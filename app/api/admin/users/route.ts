import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff, hashPassword } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';
import { summarizeIdentities } from '@/lib/leads';
import { messagingCostTier } from '@/lib/market';

// GET /api/admin/users — list all users
export async function GET(req: NextRequest) {
  try {
    const staff = await requireStaff();
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
            select: { utmSource: true, utmCampaign: true, utmContent: true },
          },
          identities: {
            select: { kind: true, value: true, label: true, verifiedAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return success({
      users: users.map(u => ({
        id: u.id,
        profileId: u.profile?.id,
        email: u.email,
        phone: u.phone,
        whatsapp: u.whatsapp,
        telegram: u.telegram,
        isVerifiedLead: u.isVerifiedLead,
        verifiedVia: u.verifiedVia,
        leadStage: u.leadStage,
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
        identities: summarizeIdentities(u.identities),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/admin/users — create curated travel profile (staff-assisted)
export async function POST(req: NextRequest) {
  try {
    const staff = await requireStaff();
    const body = await req.json();
    const {
      email, password, displayName, gender, country, city, bio,
      interests, lookingFor, relationshipIntention, dateOfBirth,
      photoUrl, travelCity, travelCountry, travelNote, travelFromDate, travelToDate,
    } = body;

    if (!displayName) return error('Display name is required');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userData: any = {
      profileOwnerType: 'staff_assisted',
      createdByStaffId: staff.id,
      signupStage: 'active',
      status: 'active',
    };

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
      userData.email = `${slug || 'profile'}.${Date.now()}@staff.heartlink.local`;
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
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            isVerified: true,
            isVisible: true,
            profileCompleteness: photoUrl ? 85 : 70,
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
