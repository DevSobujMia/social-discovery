import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';
import { canonicalCity, cityMatchNames, findMarket, maskPhoneLast4, resolveGeo } from '@/lib/market';
import { refreshLead } from '@/lib/leads';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead a trip still counts as "coming soon" for ranking. */
const SOON_DAYS = 14;
const HORIZON_DAYS = 60;

/**
 * The operator curates a small set of profiles, so ranking happens in memory.
 * This cap keeps that honest if the set ever grows unexpectedly.
 */
const RANKING_FETCH_CAP = 500;

type TripStatus = 'here-now' | 'arriving' | 'upcoming';

interface TripView {
  id: string;
  city: string;
  country: string;
  fromDate: Date;
  toDate: Date;
  note: string | null;
  status: TripStatus;
  /** Days until arrival. Zero once they are in town. */
  daysUntil: number;
  /** Days remaining in town. Null until they arrive. */
  daysLeft: number | null;
  photoUrl: string | null;
  timing: string | null;
}

function describeTrip(
  plan: {
    id: string;
    city: string;
    country: string;
    fromDate: Date;
    toDate: Date;
    note: string | null;
    photoUrl?: string | null;
    timing?: string | null;
  },
  now: Date
): TripView {
  const from = new Date(plan.fromDate);
  const to = new Date(plan.toDate);
  const msUntil = from.getTime() - now.getTime();
  const daysUntil = Math.max(0, Math.ceil(msUntil / DAY_MS));

  const hereNow = now >= from && now <= to;
  const status: TripStatus = hereNow
    ? 'here-now'
    : daysUntil <= HORIZON_DAYS
      ? 'arriving'
      : 'upcoming';

  return {
    id: plan.id,
    city: plan.city,
    country: plan.country,
    fromDate: from,
    toDate: to,
    note: plan.note,
    photoUrl: plan.photoUrl || null,
    timing: plan.timing || null,
    status,
    daysUntil: hereNow ? 0 : daysUntil,
    daysLeft: hereNow ? Math.max(0, Math.ceil((to.getTime() - now.getTime()) / DAY_MS)) : null,
  };
}

/**
 * Rank a profile for a visitor in `viewerCity` / `viewerCountry`.
 *
 * Someone who is in the visitor's own city right now is the single most
 * valuable thing we can show; a profile with no trip at all is the least.
 * Higher is better.
 */
function rankTrip(
  trip: TripView | null,
  viewerCity: string | null,
  viewerCountry: string | null
): number {
  if (!trip) return 10;

  const cityMatch =
    Boolean(viewerCity) && trip.city.toLowerCase() === viewerCity!.toLowerCase();
  const countryMatch =
    Boolean(viewerCountry) &&
    trip.country.toLowerCase() === viewerCountry!.toLowerCase();

  if (cityMatch) {
    if (trip.status === 'here-now') return 100;
    if (trip.daysUntil <= SOON_DAYS) return 90;
    if (trip.status === 'arriving') return 80;
    return 70;
  }

  if (countryMatch) {
    if (trip.status === 'here-now') return 60;
    if (trip.status === 'arriving') return 50;
    return 45;
  }

  return 30;
}

/** Soft match copy — never hard calendar dates on the customer-facing UI. */
function matchReason(
  trip: TripView | null,
  displayName: string | null,
  viewerCity: string | null
): string | null {
  if (!trip) return null;
  const who = displayName || 'She';
  const city = trip.city || viewerCity || 'the city';
  return `${who} is traveling soon to ${city}`;
}

// GET /api/profiles — travel-aware discovery
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const skip = (page - 1) * limit;

    const gender = searchParams.get('gender');
    const country = searchParams.get('country');
    const lookingFor = searchParams.get('lookingFor');
    const minAge = searchParams.get('minAge');
    const maxAge = searchParams.get('maxAge');
    const search = searchParams.get('search');

    // Travel-matching inputs. `city` is where the visitor is; when it is absent
    // we fall back to the edge geo headers so the feed is relevant on the very
    // first paint with nothing typed.
    const requestedCity = canonicalCity(searchParams.get('city'));
    const requestedTravelCountry = searchParams.get('travelCountry');
    const onlyTravellers = searchParams.get('travellingOnly') === 'true';

    const currentUser = await getCurrentUser();

    const geo = resolveGeo(req.headers, {
      country: searchParams.get('geoCountry'),
      city: searchParams.get('city'),
    });

    const viewerCity = requestedCity || currentUser?.geoCity || geo.city;
    const viewerMarket = findMarket(geo.countryCode || currentUser?.geoCountry);
    const viewerCountry =
      requestedTravelCountry || viewerMarket?.countryName || null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      isVisible: true,
      user: { status: 'active' },
    };

    if (currentUser) {
      where.userId = { not: currentUser.id };
    }

    if (gender) where.gender = gender;
    if (country) where.country = { contains: country, mode: 'insensitive' };
    if (lookingFor) where.lookingFor = lookingFor;

    if (minAge || maxAge) {
      const now = new Date();
      if (maxAge) {
        const minDate = new Date(
          now.getFullYear() - parseInt(maxAge) - 1,
          now.getMonth(),
          now.getDate()
        );
        where.dateOfBirth = { ...where.dateOfBirth, gte: minDate };
      }
      if (minAge) {
        const maxDate = new Date(
          now.getFullYear() - parseInt(minAge),
          now.getMonth(),
          now.getDate()
        );
        where.dateOfBirth = { ...where.dateOfBirth, lte: maxDate };
      }
    }

    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { bio: { contains: search, mode: 'insensitive' } },
        { travelPlans: { some: { city: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    if (currentUser) {
      const blockedIds = await prisma.blockedUser.findMany({
        where: {
          OR: [{ blockerId: currentUser.id }, { blockedId: currentUser.id }],
        },
        select: { blockerId: true, blockedId: true },
      });

      const blockedUserIds = blockedIds.map((b) =>
        b.blockerId === currentUser.id ? b.blockedId : b.blockerId
      );

      if (blockedUserIds.length > 0) {
        where.userId = { ...where.userId, notIn: blockedUserIds };
      }
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const tripCityNames = requestedCity ? cityMatchNames(requestedCity) : [];
    if (onlyTravellers || tripCityNames.length > 0) {
      where.travelPlans = {
        some: {
          isActive: true,
          toDate: { gte: startOfToday },
          ...(tripCityNames.length > 0
            ? {
                OR: tripCityNames.map((name) => ({
                  city: { equals: name, mode: 'insensitive' },
                })),
              }
            : {}),
        },
      };
    }

    const candidates = await prisma.profile.findMany({
      where,
      include: {
        photos: { where: { isPrimary: true }, take: 1 },
        user: {
          select: {
            lastActiveAt: true,
            id: true,
            profileOwnerType: true,
            isVerifiedLead: true,
            hideContactNumber: true,
            phone: true,
            whatsapp: true,
            telegram: true,
          },
        },
        travelPlans: {
          where: { isActive: true, toDate: { gte: startOfToday } },
          orderBy: { fromDate: 'asc' },
        },
      },
      take: RANKING_FETCH_CAP,
    });

    const ranked = candidates
      .map((p) => {
        const trips = p.travelPlans.map((plan) => describeTrip(plan, now));
        // The trip that matters is the one in the visitor's city, if any,
        // otherwise simply the next one.
        const cityTrip = viewerCity
          ? trips.find((t) => t.city.toLowerCase() === viewerCity.toLowerCase())
          : undefined;
        const nextTrip = cityTrip || trips[0] || null;

        let age: number | null = null;
        if (p.dateOfBirth) {
          const birth = new Date(p.dateOfBirth);
          age = now.getFullYear() - birth.getFullYear();
          const m = now.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
        }

        return {
          profile: p,
          trips,
          nextTrip,
          age,
          rank: rankTrip(nextTrip, viewerCity, viewerCountry),
        };
      })
      .sort((a, b) => {
        if (b.rank !== a.rank) return b.rank - a.rank;

        // Soonest trip first among equally ranked profiles.
        const aFrom = a.nextTrip?.fromDate.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bFrom = b.nextTrip?.fromDate.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (aFrom !== bFrom) return aFrom - bFrom;

        const aSeen = a.profile.user?.lastActiveAt?.getTime() ?? 0;
        const bSeen = b.profile.user?.lastActiveAt?.getTime() ?? 0;
        return bSeen - aSeen;
      });

    const total = ranked.length;
    const pageItems = ranked.slice(skip, skip + limit);

    const profiles = pageItems.map(({ profile: p, trips, nextTrip, age }) => ({
      id: p.id,
      userId: p.userId,
      displayName: p.displayName,
      age,
      gender: p.gender,
      country: p.country,
      city: p.city,
      bio: p.bio,
      interests: p.interests,
      lookingFor: p.lookingFor,
      relationshipIntention: p.relationshipIntention,
      isVerified: Boolean(p.isVerified || p.user?.isVerifiedLead),
      hideContactNumber: Boolean(p.user?.hideContactNumber),
      contact: (() => {
        const raw =
          p.user?.whatsapp ||
          p.user?.phone ||
          (p.user?.telegram ? `@${p.user.telegram}` : null);
        if (!raw) return null;
        return p.user?.hideContactNumber ? maskPhoneLast4(raw) : raw;
      })(),
      profileOwnerType: p.user?.profileOwnerType || 'self',
      photo:
        p.photos.find((ph) => ph.isPrimary)?.filePath ||
        p.photos[0]?.filePath ||
        nextTrip?.photoUrl ||
        null,
      lastActive: p.user?.lastActiveAt,
      travel: nextTrip
        ? {
            city: nextTrip.city,
            country: nextTrip.country,
            fromDate: nextTrip.fromDate,
            toDate: nextTrip.toDate,
            note: nextTrip.note,
            photoUrl: nextTrip.photoUrl,
            timing: nextTrip.timing,
            status: nextTrip.status,
            daysUntil: nextTrip.daysUntil,
            daysLeft: nextTrip.daysLeft,
            isViewerCity: Boolean(
              viewerCity &&
                nextTrip.city.toLowerCase() === viewerCity.toLowerCase()
            ),
          }
        : null,
      upcomingTrips: trips.map((t) => ({
        city: t.city,
        country: t.country,
        fromDate: t.fromDate,
        toDate: t.toDate,
        photoUrl: t.photoUrl,
        timing: t.timing,
        status: t.status,
      })),
      matchReason: matchReason(nextTrip, p.displayName, viewerCity),
    }));

    return success({
      profiles,
      viewer: {
        city: viewerCity,
        country: viewerCountry,
        geoSource: geo.source,
      },
      travellersInViewerCity: viewerCity
        ? ranked.filter((r) => r.nextTrip?.city.toLowerCase() === viewerCity.toLowerCase())
            .length
        : 0,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH /api/profiles - Update own profile
export async function PATCH(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return error('Please sign in to update your profile', 401);
    }

    const body = await req.json();
    const {
      displayName,
      dateOfBirth,
      gender,
      country,
      city,
      bio,
      interests,
      lookingFor,
      relationshipIntention,
      hideContactNumber,
      age,
    } = body;

    if (displayName && displayName.length > 100) {
      return error('Name is too long');
    }
    if (bio && bio.length > 500) {
      return error('Bio must be under 500 characters');
    }

    if (hideContactNumber !== undefined) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: { hideContactNumber: Boolean(hideContactNumber) },
      });
    }

    if (age !== undefined) {
      const parsed = age === null || age === '' ? null : parseInt(String(age), 10);
      await prisma.user.update({
        where: { id: currentUser.id },
        data: {
          age: parsed !== null && !Number.isNaN(parsed) ? parsed : null,
        },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (dateOfBirth !== undefined)
      updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (gender !== undefined) updateData.gender = gender || null;
    if (country !== undefined) updateData.country = country || null;
    if (city !== undefined) updateData.city = city || null;
    if (bio !== undefined) updateData.bio = bio;
    if (interests !== undefined) updateData.interests = interests;
    if (lookingFor !== undefined) updateData.lookingFor = lookingFor || null;
    if (relationshipIntention !== undefined)
      updateData.relationshipIntention = relationshipIntention;

    const profile = await prisma.profile.findUnique({
      where: { userId: currentUser.id },
    });
    if (!profile) return error('Profile not found', 404);

    const merged = { ...profile, ...updateData };
    let completeness = 0;
    if (merged.displayName) completeness += 15;
    if (merged.dateOfBirth) completeness += 15;
    if (merged.gender) completeness += 10;
    if (merged.country) completeness += 10;
    if (merged.city) completeness += 5;
    if (merged.bio) completeness += 15;
    if (merged.interests && (merged.interests as string[]).length > 0)
      completeness += 15;
    if (merged.lookingFor) completeness += 10;
    if (merged.relationshipIntention) completeness += 5;
    updateData.profileCompleteness = completeness;

    const updated = await prisma.profile.update({
      where: { userId: currentUser.id },
      data: updateData,
      include: { photos: true },
    });

    await refreshLead(currentUser.id).catch(() => {});

    return success(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
