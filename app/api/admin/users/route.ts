import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff, hashPassword } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';
import { summarizeIdentities } from '@/lib/leads';
import { messagingCostTier, calculateLeadMarketValue } from '@/lib/market';
import { summarizeDeviceMeta } from '@/lib/device-meta';

// GET /api/admin/users — list all users
export async function GET(req: NextRequest) {
  try {
    const staff = await requireStaff(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const skip = (page - 1) * limit;
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const ownerType = searchParams.get('ownerType');
    const leadStage = searchParams.get('leadStage');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // If agent, only show assigned users
    if (staff.role === 'agent') {
      const assignments = await prisma.agentAssignment.findMany({
        where: { agentId: staff.id, status: 'active' },
        select: { userId: true },
      });
      where.id = { in: assignments.map(a => a.userId) };
    }

    if (status) where.status = status;
    if (ownerType) where.profileOwnerType = ownerType;
    if (leadStage) where.leadStage = leadStage;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { whatsapp: { contains: search } },
        { telegram: { contains: search, mode: 'insensitive' } },
        { profile: { displayName: { contains: search, mode: 'insensitive' } } },
        { identities: { some: { value: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    // Best leads first when looking at the lead collection; newest first
    // otherwise, which is what the user-management tab expects.
    const orderBy = leadStage
      ? [{ leadScore: 'desc' as const }, { createdAt: 'desc' as const }]
      : [{ createdAt: 'desc' as const }];

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          profile: { include: { photos: { where: { isPrimary: true }, take: 1 } } },
          assignments: {
            where: { status: 'active' },
            include: { agent: { select: { displayName: true, email: true } } },
          },
          utmAttribution: {
            select: {
              utmSource: true,
              utmCampaign: true,
              utmContent: true,
              userAgent: true,
            },
          },
          customerRequirements: {
            select: {
              preferredGender: true,
              relationshipIntention: true,
              travelDestination: true,
            },
          },
          identities: {
            select: { kind: true, value: true, label: true, verifiedAt: true },
            orderBy: { createdAt: 'asc' },
          },
          _count: {
            select: {
              sentMessages: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return success({
      users: users.map(u => {
        const sentMessagesCount = u._count?.sentMessages || 0;
        const identities = summarizeIdentities(u.identities);
        const hasVerifiedContact = Boolean(
          u.isVerifiedLead ||
          u.phone ||
          u.whatsapp ||
          u.telegram ||
          identities.some(i => i.verified || i.value)
        );
        // Complete Lead: sent at least 1 message OR provided verified contact info
        // Incomplete Lead: visitor from ad / entered funnel but backed out without sending msg or contact
        const isComplete = hasVerifiedContact || sentMessagesCount > 0;
        const effectiveStage = isComplete ? 'complete' : 'incomplete';

        const deviceSummary = summarizeDeviceMeta(u.deviceMeta, {
          country: u.geoCountry,
          city: u.geoCity,
        });

        const osField = deviceSummary.fields?.find(f => f.key === 'OS')?.value || (u.deviceMeta as any)?.os;
        const deviceClass = deviceSummary.fields?.find(f => f.key === 'Device')?.value || (u.deviceMeta as any)?.deviceClass;

        const marketValuation = calculateLeadMarketValue({
          countryCode: u.originCountry || u.geoCountry,
          geoCountry: u.geoCountry,
          isComplete,
          sentMessagesCount,
          hasContact: hasVerifiedContact,
          os: osField,
          deviceClass,
        });

        return {
          id: u.id,
          profileId: u.profile?.id,
          email: u.email,
          phone: u.phone,
          whatsapp: u.whatsapp,
          telegram: u.telegram,
          isVerifiedLead: u.isVerifiedLead,
          verifiedVia: u.verifiedVia,
          leadStage: effectiveStage,
          isCompleteLead: isComplete,
          sentMessagesCount,
          marketValuation,
          age: u.age,
          status: u.status,
          signupStage: u.signupStage,
          profileOwnerType: u.profileOwnerType,
          displayName: u.profile?.displayName,
          photo: u.profile?.photos?.[0]?.filePath || null,
          country: u.profile?.country,
          gender: u.profile?.gender,
          lookingFor: u.profile?.lookingFor,
          lastActiveAt: u.lastActiveAt,
          createdAt: u.createdAt,
          assignedAgent: u.assignments[0]?.agent || null,
          source: u.utmAttribution
            ? {
                utm_source: u.utmAttribution.utmSource,
                utm_campaign: u.utmAttribution.utmCampaign,
                utm_content: u.utmAttribution.utmContent,
              }
            : null,
          // Lead intelligence
          leadScore: u.leadScore,
          preferredChannel: u.preferredChannel,
          geoCountry: u.geoCountry,
          geoCity: u.geoCity,
          originCountry: u.originCountry,
          language: u.language,
          messagingCost: messagingCostTier(u.originCountry || u.geoCountry),
          identities,
          requirements: u.customerRequirements
            ? {
                preferredGender: u.customerRequirements.preferredGender,
                relationshipIntention: u.customerRequirements.relationshipIntention,
                travelDestination: u.customerRequirements.travelDestination,
              }
            : null,
          device: deviceSummary,
          deviceMeta: u.deviceMeta,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/admin/users — create curated travel profile (staff-assisted)
export async function POST(req: NextRequest) {
  try {
    const staff = await requireStaff(req);
    const body = await req.json();
    const {
      email, password, displayName, age, gender, country, city, bio,
      interests, lookingFor, relationshipIntention, dateOfBirth,
      photoUrl, travelCity, travelCountry, travelNote, travelFromDate, travelToDate,
      whatsapp, telegram, phone, isVerifiedLead,
    } = body;

    if (!displayName) return error('Display name is required');

    const parsedAge = age ? parseInt(String(age), 10) : undefined;
    let dob = dateOfBirth ? new Date(dateOfBirth) : undefined;
    if (!dob && parsedAge && !isNaN(parsedAge)) {
      const now = new Date();
      dob = new Date(now.getFullYear() - parsedAge, 5, 15);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userData: any = {
      profileOwnerType: 'staff_assisted',
      createdByStaffId: staff.id,
      signupStage: 'active',
      status: 'active',
      age: parsedAge && !isNaN(parsedAge) ? parsedAge : undefined,
    };

    if (whatsapp) userData.whatsapp = String(whatsapp).trim();
    if (telegram) userData.telegram = String(telegram).trim().replace(/^@/, '');
    if (phone) userData.phone = String(phone).trim();
    if (isVerifiedLead) userData.isVerifiedLead = true;

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) return error('Email already in use');
      userData.email = email.toLowerCase();
    } else {
      const slug = String(displayName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 24);
      userData.email = `${slug || 'profile'}.${Date.now()}@staff.cityhost.local`;
    }
    if (password) {
      userData.passwordHash = await hashPassword(password);
    }

    const interestList = Array.isArray(interests)
      ? interests
      : typeof interests === 'string'
        ? interests.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];

    const user = await prisma.user.create({
      data: {
        ...userData,
        profile: {
          create: {
            displayName,
            gender: gender || undefined,
            country: country || undefined,
            city: city || undefined,
            bio: bio || undefined,
            interests: interestList,
            lookingFor: lookingFor || 'travel_partner',
            relationshipIntention: relationshipIntention || undefined,
            dateOfBirth: dob,
            isVerified: true,
            isVisible: true,
            profileCompleteness: photoUrl ? 90 : 75,
            ...(photoUrl
              ? {
                  photos: {
                    create: [
                      {
                        filePath: photoUrl,
                        isPrimary: true,
                        sortOrder: 0,
                        uploadedBy: 'staff',
                        uploadedByStaffId: staff.id,
                      },
                    ],
                  },
                }
              : {}),
          },
        },
      },
      include: { profile: true },
    });

    if (user.profile && travelCity) {
      const from = travelFromDate
        ? new Date(travelFromDate)
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + 5);
            return d;
          })();
      const to = travelToDate
        ? new Date(travelToDate)
        : (() => {
            const d = new Date(from);
            d.setDate(d.getDate() + 10);
            return d;
          })();

      await prisma.travelPlan.create({
        data: {
          profileId: user.profile.id,
          city: travelCity,
          country:
            travelCountry ||
            (travelCity === 'Riyadh' || travelCity === 'Jeddah' || travelCity === 'Dammam'
              ? 'Saudi Arabia'
              : 'United Arab Emirates'),
          fromDate: from,
          toDate: to,
          note: travelNote || `Traveling soon to ${travelCity}.`,
          isActive: true,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        staffId: staff.id,
        action: 'user.create',
        targetType: 'user',
        targetId: user.id,
        details: {
          displayName,
          profileOwnerType: 'staff_assisted',
          travelCity: travelCity || null,
        },
      },
    });

    return success(user, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/admin/users — delete one or multiple leads/users
export async function DELETE(req: NextRequest) {
  try {
    const staff = await requireStaff(req);
    const { searchParams } = new URL(req.url);
    let userIds: string[] = [];

    const idParam = searchParams.get('id');
    if (idParam) {
      userIds = [idParam];
    } else {
      try {
        const body = await req.json();
        if (body.id && typeof body.id === 'string') userIds = [body.id];
        else if (Array.isArray(body.userIds)) {
          userIds = body.userIds.filter((x: unknown): x is string => typeof x === 'string' && Boolean(x));
        } else if (Array.isArray(body.ids)) {
          userIds = body.ids.filter((x: unknown): x is string => typeof x === 'string' && Boolean(x));
        }
      } catch {
        // query param or empty body
      }
    }

    if (!userIds.length) {
      return error('No user IDs provided for deletion');
    }

    // Execute cascading deletion inside transaction
    await prisma.$transaction(async (tx) => {
      // 1. Find all conversations connected to these users
      const connectedConversations = await tx.conversation.findMany({
        where: {
          OR: [
            { customerUserId: { in: userIds } },
            { representedProfileUserId: { in: userIds } },
            { participants: { some: { userId: { in: userIds } } } },
          ],
        },
        select: { id: true },
      });
      const convIds = connectedConversations.map((c) => c.id);

      if (convIds.length > 0) {
        await tx.message.deleteMany({ where: { conversationId: { in: convIds } } });
        await tx.conversationParticipant.deleteMany({ where: { conversationId: { in: convIds } } });
        await tx.conversation.deleteMany({ where: { id: { in: convIds } } });
      }

      // 2. Clean up any remaining messages / participants / events
      await tx.message.deleteMany({
        where: {
          OR: [
            { senderUserId: { in: userIds } },
            { onBehalfOf: { id: { in: userIds } } },
          ],
        },
      });
      await tx.conversationParticipant.deleteMany({ where: { userId: { in: userIds } } });
      await tx.analyticsEvent.deleteMany({ where: { userId: { in: userIds } } });
      await tx.report.deleteMany({
        where: {
          OR: [
            { reporterId: { in: userIds } },
            { reportedUserId: { in: userIds } },
          ],
        },
      });
      await tx.contactConsent.deleteMany({
        where: {
          OR: [
            { granterId: { in: userIds } },
            { receiverId: { in: userIds } },
          ],
        },
      });
      await tx.blockedUser.deleteMany({
        where: {
          OR: [
            { blockerId: { in: userIds } },
            { blockedId: { in: userIds } },
          ],
        },
      });
      await tx.agentAssignment.deleteMany({ where: { userId: { in: userIds } } });
      await tx.assignmentHistory.deleteMany({ where: { userId: { in: userIds } } });
      await tx.utmAttribution.deleteMany({ where: { userId: { in: userIds } } });
      await tx.leadIdentity.deleteMany({ where: { userId: { in: userIds } } });
      await tx.customerRequirements.deleteMany({ where: { userId: { in: userIds } } });
      await tx.match.deleteMany({
        where: {
          OR: [
            { userAId: { in: userIds } },
            { userBId: { in: userIds } },
          ],
        },
      });
      await tx.interaction.deleteMany({
        where: {
          OR: [
            { actorUserId: { in: userIds } },
            { targetUserId: { in: userIds } },
          ],
        },
      });

      // Profiles and travel plans
      const profiles = await tx.profile.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const profileIds = profiles.map((p) => p.id);
      if (profileIds.length > 0) {
        await tx.travelPlan.deleteMany({ where: { profileId: { in: profileIds } } });
        await tx.profilePhoto.deleteMany({ where: { profileId: { in: profileIds } } });
        await tx.profile.deleteMany({ where: { id: { in: profileIds } } });
      }

      // Finally, delete the users
      await tx.user.deleteMany({ where: { id: { in: userIds } } });

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          staffId: staff.id,
          action: 'user.bulk_delete',
          targetType: 'user',
          targetId: userIds.join(','),
          details: { deletedCount: userIds.length, userIds },
        },
      });
    });

    return success({ deletedCount: userIds.length, userIds });
  } catch (err) {
    return handleApiError(err);
  }
}

