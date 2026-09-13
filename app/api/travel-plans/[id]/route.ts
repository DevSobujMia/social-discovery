import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

// DELETE /api/travel-plans/[id] — remove a travel plan
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireUser();
    const { id } = await params;

    const existing = await prisma.travelPlan.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!existing) {
      return error('Travel plan not found', 404);
    }

    // Verify ownership
    if (existing.profile.userId !== currentUser.id) {
      return error('Access denied — you can only delete your own travel plans', 403);
    }

    await prisma.travelPlan.delete({
      where: { id },
    });

    return success({ message: 'Travel plan removed' });
  } catch (err) {
    return handleApiError(err);
  }
}
