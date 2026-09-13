import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { success, error, notFound, handleApiError } from '@/lib/api-helpers';

// GET /api/profiles/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const profile = await prisma.profile.findFirst({
      where: {
        OR: [
          { id },
          { userId: id },
        ],
        isVisible: true,
        user: { status: 'active' },
      },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        user: { select: { lastActiveAt: true, id: true, createdAt: true } },
      },
    });

    if (!profile) {
      return notFound('Profile not found');
    }

    // Calculate age
    let age: number | null = null;
    if (profile.dateOfBirth) {
      const today = new Date();
      const birth = new Date(profile.dateOfBirth);
      age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
    }

    // Check if current user has interacted
    const currentUser = await getCurrentUser();
    let interaction = null;
    let isMatched = false;
    if (currentUser) {
      interaction = await prisma.interaction.findFirst({
        where: {
          actorUserId: currentUser.id,
          targetUserId: profile.userId,
        },
      });

      const match = await prisma.match.findFirst({
        where: {
          OR: [
            { userAId: currentUser.id, userBId: profile.userId },
            { userAId: profile.userId, userBId: currentUser.id },
          ],
          status: 'active',
        },
      });
      isMatched = !!match;

      // Track profile view
      try {
        await prisma.analyticsEvent.create({
          data: {
            userId: currentUser.id,
            eventType: 'profile_view',
            eventData: { viewedProfileId: profile.id },
          },
        });
      } catch {
        // Non-critical
      }
    }

    return success({
      id: profile.id,
      userId: profile.userId,
      displayName: profile.displayName,
      age,
      gender: profile.gender,
      country: profile.country,
      city: profile.city,
      bio: profile.bio,
      interests: profile.interests,
      lookingFor: profile.lookingFor,
      relationshipIntention: profile.relationshipIntention,
      isVerified: profile.isVerified,
      photos: profile.photos.map(p => ({
        id: p.id,
        url: p.filePath,
        isPrimary: p.isPrimary,
      })),
      lastActive: profile.user?.lastActiveAt,
      memberSince: profile.user?.createdAt,
      interaction: interaction ? { type: interaction.type, status: interaction.status } : null,
      isMatched,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
