import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  GUEST_SESSION_DAYS,
  getCurrentUser,
  signToken,
  attachUserCookie,
} from '@/lib/auth';
import { success, handleApiError } from '@/lib/api-helpers';
import { attachIdentity, refreshLead } from '@/lib/leads';
import { mergeDeviceMeta } from '@/lib/device-meta';
import { canonicalCity, findMarket, inferLanguage, resolveGeo } from '@/lib/market';

/**
 * POST /api/auth/guest
 *
 * The single entry point for ad traffic. Creates or resumes a guest lead with
 * no registration, records everything the ad and the edge already told us, and
 * opens the conversation with the profile the visitor tapped.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      age,
      gender,
      lookingFor,
      preferredGender,
      targetUserId,
      utm,
      // Ad URL parameters and the browser's persistent device token.
      deviceToken,
      device,
      adCountry,
      adCity,
    } = body;

    const geo = resolveGeo(req.headers, { country: adCountry, city: adCity });
    const market = findMarket(geo.countryCode);

    let user: any = await getCurrentUser();
    let isNewLead = false;

    let guestToken: string | null = null;

    if (!user) {
      isNewLead = true;
      const parsedAge = age ? parseInt(String(age), 10) : null;
      const cleanName = (name && String(name).trim()) || 'Visitor';

      user = await prisma.user.create({
        data: {
          signupStage: 'anonymous',
          status: 'active',
          isVerifiedLead: false,
          leadStage: 'incomplete',
          age: parsedAge && !isNaN(parsedAge) ? parsedAge : undefined,
          geoCountry: geo.countryCode,
          geoCity: geo.city,
          language: market ? market.languages[0] : inferLanguage(null),
          profile: {
            create: {
              displayName: cleanName,
              gender: gender === 'male' || gender === 'female' ? gender : undefined,
              lookingFor: lookingFor || 'travel_partner',
              country: market?.countryName || 'United Arab Emirates',
              city: geo.city || undefined,
              bio: 'Inbound Ad Lead',
              isVerified: false,
              // Ad leads are people to follow up with, not profiles to browse.
              // Discovery only ever shows the profiles the operator curates.
              isVisible: false,
            },
          },
        },
        include: {
          profile: {
            include: { photos: true },
          },
        },
      });

      // Save the search criteria the ad implied, so the operator can see what
      // this person was actually looking for.
      if (lookingFor || preferredGender || gender || parsedAge) {
        const staff = await prisma.staffAccount.findFirst();
        if (staff) {
          const want =
            preferredGender === 'male' || preferredGender === 'female'
              ? preferredGender
              : lookingFor === 'male' || lookingFor === 'female'
                ? lookingFor
                : undefined;
          await prisma.customerRequirements
            .create({
              data: {
                userId: user.id,
                preferredGender: want,
                relationshipIntention:
                  lookingFor === 'male' || lookingFor === 'female'
                    ? 'travel_partner'
                    : lookingFor || 'travel_partner',
                travelDestination: canonicalCity(adCity) || geo.city || undefined,
                preferredCountries: market ? [market.countryName] : [],
                createdById: staff.id,
              },
            })
            .catch(() => {
              // Requirements are supplementary; never fail the funnel on them.
            });
        }
      }

      if (utm) {
        let campaignId: string | undefined = undefined;
        if (utm.utmCampaign) {
          const matchedCamp = await prisma.campaign.findUnique({
            where: { utmCampaign: utm.utmCampaign },
          });
          if (matchedCamp) campaignId = matchedCamp.id;
        }

        await prisma.utmAttribution
          .create({
            data: {
              userId: user.id,
              utmSource: utm.utmSource,
              utmMedium: utm.utmMedium,
              utmCampaign: utm.utmCampaign,
              utmContent: utm.utmContent,
              utmTerm: utm.utmTerm,
              landingPage: utm.landingPage || req.headers.get('referer') || '/',
              referrerUrl: utm.referrerUrl || req.headers.get('referer'),
              ipAddress: geo.ip || undefined,
              userAgent: req.headers.get('user-agent') || undefined,
              campaignId,
            },
          })
          .catch(() => {
            // Attribution is best-effort.
          });
      }

      guestToken = signToken(
        { id: user.id, email: user.email || '', type: 'user' },
        GUEST_SESSION_DAYS
      );
    } else {
      // Returning visitor: enrich what we already hold rather than overwrite it.
      const cleanName = name && String(name).trim();
      if (
        cleanName &&
        cleanName !== 'Visitor' &&
        cleanName !== 'Guest Traveler'
      ) {
        await prisma.profile.updateMany({
          where: { userId: user.id },
          data: { displayName: cleanName },
        });
      }

      const userUpdate: Record<string, unknown> = {};
      if (age) {
        const parsedAge = parseInt(String(age), 10);
        if (!isNaN(parsedAge)) userUpdate.age = parsedAge;
      }
      if (geo.countryCode && !user.geoCountry) userUpdate.geoCountry = geo.countryCode;
      if (geo.city && !user.geoCity) userUpdate.geoCity = geo.city;

      if (Object.keys(userUpdate).length > 0) {
        await prisma.user.update({ where: { id: user.id }, data: userUpdate });
      }
    }

    // Bind the browser to this lead so a cleared cookie is recoverable.
    if (deviceToken && typeof deviceToken === 'string') {
      await attachIdentity({
        userId: user.id,
        kind: 'device',
        value: deviceToken,
      });
    }

    // Snapshot the device for admin lead-quality review.
    const mergedDevice = mergeDeviceMeta(user.deviceMeta, device);
    if (mergedDevice) {
      await prisma.user
        .update({
          where: { id: user.id },
          data: { deviceMeta: mergedDevice },
        })
        .catch(() => {
          // Device intel is best-effort.
        });
    }

    // -------------------------------------------------------------
    // Open the conversation with the profile they tapped
    // -------------------------------------------------------------
    let conversationId: string | null = null;
    let targetProfile: Awaited<
      ReturnType<typeof prisma.profile.findFirst>
    > | null = null;
    let targetPhotos: string | null = null;

    if (targetUserId) {
      const found = await prisma.profile.findFirst({
        where: { userId: targetUserId },
        include: { photos: true },
      });
      targetProfile = found;
      targetPhotos = found?.photos?.[0]?.filePath || null;

      let conv = await prisma.conversation.findFirst({
        where: {
          customerUserId: user.id,
          representedProfileUserId: targetUserId,
        },
      });

      if (!conv) {
        conv = await prisma.conversation.findFirst({
          where: {
            AND: [
              { participants: { some: { userId: user.id } } },
              { participants: { some: { userId: targetUserId } } },
            ],
          },
        });
      }

      if (!conv) {
        const existingMatch = await prisma.match.findFirst({
          where: {
            OR: [
              { userAId: user.id, userBId: targetUserId },
              { userAId: targetUserId, userBId: user.id },
            ],
          },
        });

        const match =
          existingMatch ||
          (await prisma.match.create({
            data: { userAId: user.id, userBId: targetUserId },
          }));

        conv = await prisma.conversation.create({
          data: {
            matchId: match.id,
            type: 'assisted',
            status: 'active',
            customerUserId: user.id,
            representedProfileUserId: targetUserId,
            participants: {
              create: [{ userId: user.id }, { userId: targetUserId }],
            },
          },
        });
      }

      conversationId = conv.id;
    }

    const lead = await refreshLead(user.id);

    if (isNewLead) {
      await prisma.analyticsEvent
        .create({
          data: {
            userId: user.id,
            eventType: 'lead_created',
            eventData: {
              geoSource: geo.source,
              country: geo.countryCode,
              city: geo.city,
              market: market?.countryName || null,
            },
            utmCampaign: utm?.utmCampaign || undefined,
          },
        })
        .catch(() => {
          // Analytics must never break the funnel.
        });
    }

    return attachUserCookie(
      NextResponse.json({
        success: true,
        data: {
          user: {
            id: user.id,
            displayName: user.profile?.displayName || name || 'Visitor',
            age: user.age,
            isVerifiedLead: user.isVerifiedLead,
            leadStage: lead.stage,
            leadScore: lead.score,
            verifiedVia: user.verifiedVia,
          },
          geo: {
            country: geo.countryCode,
            city: geo.city,
            source: geo.source,
          },
          conversationId,
          targetProfile: targetProfile
            ? {
                userId: targetProfile.userId,
                displayName: targetProfile.displayName,
                photo: targetPhotos,
              }
            : null,
        },
      }),
      guestToken ||
        signToken(
          { id: user.id, email: user.email || '', type: 'user' },
          GUEST_SESSION_DAYS
        ),
      GUEST_SESSION_DAYS
    );
  } catch (err) {
    return handleApiError(err);
  }
}
