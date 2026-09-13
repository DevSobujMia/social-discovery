import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';
import { canonicalCity } from '@/lib/market';

export const dynamic = 'force-dynamic';

/**
 * Travel plans are the product. A curated profile announces a trip to a city,
 * and every visitor the ads bring in from that city is matched to them.
 */

function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// GET /api/admin/travel-plans?profileId=&city=&includePast=
export async function GET(req: NextRequest) {
  try {
    await requireStaff();

    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get('profileId');
    const city = canonicalCity(searchParams.get('city'));
    const includePast = searchParams.get('includePast') === 'true';

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const plans = await prisma.travelPlan.findMany({
      where: {
        ...(profileId ? { profileId } : {}),
        ...(city ? { city } : {}),
        ...(includePast ? {} : { toDate: { gte: startOfToday } }),
      },
      include: {
        profile: {
          select: {
            id: true,
            displayName: true,
            userId: true,
            photos: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
      orderBy: { fromDate: 'asc' },
    });

    return success(
      plans.map((plan) => ({
        id: plan.id,
        profileId: plan.profileId,
        profileName: plan.profile.displayName,
        profileUserId: plan.profile.userId,
        photo: plan.profile.photos[0]?.filePath || null,
        city: plan.city,
        country: plan.country,
        fromDate: plan.fromDate,
        toDate: plan.toDate,
        note: plan.note,
        isActive: plan.isActive,
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/admin/travel-plans — add a trip to a curated profile
export async function POST(req: NextRequest) {
  try {
    const staff = await requireStaff();
    const body = await req.json();
    const { profileId, city, country, fromDate, toDate, note } = body;

    if (!profileId) return error('A profile is required');

    const cleanCity = canonicalCity(city);
    if (!cleanCity) return error('A destination city is required');

    if (!country || typeof country !== 'string' || !country.trim()) {
      return error('A destination country is required');
    }

    const from = parseDate(fromDate);
    const to = parseDate(toDate);
    if (!from) return error('A valid arrival date is required');
    if (!to) return error('A valid departure date is required');
    if (to < from) return error('The departure date cannot be before arrival');

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, displayName: true },
    });
    if (!profile) return error('That profile no longer exists', 404);

    const plan = await prisma.travelPlan.create({
      data: {
        profileId,
        city: cleanCity,
        country: country.trim(),
        fromDate: from,
        toDate: to,
        note: note && String(note).trim() ? String(note).trim() : null,
      },
    });

    await prisma.auditLog
      .create({
        data: {
          staffId: staff.id,
          action: 'travel_plan.create',
          targetType: 'travel_plan',
          targetId: plan.id,
          details: { profileId, city: cleanCity, country: country.trim() },
        },
      })
      .catch(() => {
        // Audit failure must not roll back a valid trip.
      });

    return success(plan, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH /api/admin/travel-plans — edit or deactivate a trip
export async function PATCH(req: NextRequest) {
  try {
    const staff = await requireStaff();
    const body = await req.json();
    const { id, city, country, fromDate, toDate, note, isActive } = body;

    if (!id) return error('A travel plan ID is required');

    const existing = await prisma.travelPlan.findUnique({ where: { id } });
    if (!existing) return error('That travel plan no longer exists', 404);

    const data: Record<string, unknown> = {};

    if (city !== undefined) {
      const cleanCity = canonicalCity(city);
      if (!cleanCity) return error('A destination city is required');
      data.city = cleanCity;
    }
    if (country !== undefined) {
      if (!country || !String(country).trim()) {
        return error('A destination country is required');
      }
      data.country = String(country).trim();
    }
    if (fromDate !== undefined) {
      const from = parseDate(fromDate);
      if (!from) return error('A valid arrival date is required');
      data.fromDate = from;
    }
    if (toDate !== undefined) {
      const to = parseDate(toDate);
      if (!to) return error('A valid departure date is required');
      data.toDate = to;
    }
    if (note !== undefined) {
      data.note = note && String(note).trim() ? String(note).trim() : null;
    }
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const finalFrom = (data.fromDate as Date) || existing.fromDate;
    const finalTo = (data.toDate as Date) || existing.toDate;
    if (finalTo < finalFrom) {
      return error('The departure date cannot be before arrival');
    }

    const updated = await prisma.travelPlan.update({ where: { id }, data });

    await prisma.auditLog
      .create({
        data: {
          staffId: staff.id,
          action: 'travel_plan.update',
          targetType: 'travel_plan',
          targetId: id,
          details: {
            city: updated.city,
            country: updated.country,
            fromDate: updated.fromDate.toISOString(),
            toDate: updated.toDate.toISOString(),
            isActive: updated.isActive,
          },
        },
      })
      .catch(() => {
        // Audit failure must not roll back a valid edit.
      });

    return success(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/admin/travel-plans?id=
export async function DELETE(req: NextRequest) {
  try {
    const staff = await requireStaff();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return error('A travel plan ID is required');

    const existing = await prisma.travelPlan.findUnique({ where: { id } });
    if (!existing) return error('That travel plan no longer exists', 404);

    await prisma.travelPlan.delete({ where: { id } });

    await prisma.auditLog
      .create({
        data: {
          staffId: staff.id,
          action: 'travel_plan.delete',
          targetType: 'travel_plan',
          targetId: id,
          details: { city: existing.city, country: existing.country },
        },
      })
      .catch(() => {
        // Audit failure must not fail the delete.
      });

    return success({ id });
  } catch (err) {
    return handleApiError(err);
  }
}
