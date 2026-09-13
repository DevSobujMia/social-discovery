import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

// GET /api/travel-plans — list active travel plans from travelers
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city');
    const country = searchParams.get('country');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const where: any = {
      isActive: true,
      toDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Plans ending yesterday or later
    };

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }
    if (country) {
      where.country = { contains: country, mode: 'insensitive' };
    }

    const plans = await prisma.travelPlan.findMany({
      where,
      orderBy: { fromDate: 'asc' },
      take: limit,
      include: {
        profile: {
          select: {
            id: true,
            userId: true,
            displayName: true,
            dateOfBirth: true,
            gender: true,
            city: true,
            country: true,
            bio: true,
            isVerified: true,
            photos: {
              where: { isPrimary: true },
              take: 1,
              select: { filePath: true },
            },
            user: {
              select: {
                id: true,
                age: true,
                isVerifiedLead: true,
                verifiedVia: true,
              },
            },
          },
        },
      },
    });

    const formatted = plans.map((p) => {
      const isVerified = Boolean(p.profile.isVerified || p.profile.user?.isVerifiedLead);
      const computedAge = p.profile.user?.age || (p.profile.dateOfBirth ? Math.floor((Date.now() - new Date(p.profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 26);
      return {
        id: p.id,
        country: p.country,
        city: p.city,
        fromDate: p.fromDate.toISOString(),
        toDate: p.toDate.toISOString(),
        note: p.note,
        photoUrl: p.photoUrl,
        timing: p.timing,
        createdAt: p.createdAt.toISOString(),
        profile: {
          id: p.profile.id,
          userId: p.profile.userId,
          displayName: p.profile.displayName,
          age: computedAge,
          gender: p.profile.gender,
          city: p.profile.city,
          country: p.profile.country,
          bio: p.profile.bio,
          photo: p.photoUrl || p.profile.photos[0]?.filePath || null,
          isVerified,
          verifiedVia: p.profile.user?.verifiedVia || null,
        },
      };
    });

    return success({ travelPlans: formatted });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/travel-plans — publish a new travel plan for the current user
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireUser();
    const body = await req.json();
    const { country, city, timing, fromDate, toDate, note, photoUrl } = body;

    if (!country?.trim() || !city?.trim()) {
      return error('Destination country and city are required', 400);
    }

    let start: Date;
    let end: Date;
    const now = new Date();

    if (timing === 'coming_soon' || timing === 'soon' || (!fromDate && !toDate)) {
      start = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      end = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    } else if (timing === 'next_month') {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      start = nextMonth;
      end = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    } else if (timing === 'flexible') {
      start = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      end = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
    } else {
      start = fromDate ? new Date(fromDate) : new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      end = toDate ? new Date(toDate) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return error('Invalid date format', 400);
    }

    // Ensure user has a profile record
    let profileId = currentUser.profile?.id;
    if (!profileId) {
      const createdProfile = await prisma.profile.create({
        data: {
          userId: currentUser.id,
          displayName: currentUser.profile?.displayName || currentUser.email?.split('@')[0] || 'Traveler',
          gender: 'male',
          country: country.trim(),
          city: city.trim(),
        },
      });
      profileId = createdProfile.id;
    }

    const newPlan = await prisma.travelPlan.create({
      data: {
        profileId,
        country: country.trim(),
        city: city.trim(),
        fromDate: start,
        toDate: end,
        note: (note || '').trim() || null,
        photoUrl: photoUrl?.trim() || null,
        timing: timing || 'soon',
        isActive: true,
      },
    });

    // If a photo was supplied and the profile has no primary photo yet, set as primary
    if (photoUrl?.trim()) {
      const existingPhotos = await prisma.profilePhoto.count({
        where: { profileId },
      });
      if (existingPhotos === 0) {
        await prisma.profilePhoto.create({
          data: {
            profileId,
            filePath: photoUrl.trim(),
            isPrimary: true,
            uploadedBy: 'user',
          },
        });
      }
    }

    return success(
      {
        travelPlan: {
          id: newPlan.id,
          profileId: newPlan.profileId,
          country: newPlan.country,
          city: newPlan.city,
          fromDate: newPlan.fromDate.toISOString(),
          toDate: newPlan.toDate.toISOString(),
          note: newPlan.note,
          photoUrl: newPlan.photoUrl,
          timing: newPlan.timing,
          isActive: newPlan.isActive,
          createdAt: newPlan.createdAt.toISOString(),
        },
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
