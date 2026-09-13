import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

// POST /api/interactions — like, pass, save, connect
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireUser();
    const body = await req.json();
    const { targetUserId, type } = body;

    if (!targetUserId || !type) {
      return error('targetUserId and type are required');
    }

    if (!['like', 'pass', 'save', 'connect'].includes(type)) {
      return error('Invalid interaction type');
    }

    if (targetUserId === currentUser.id) {
      return error('Cannot interact with yourself');
    }

    // Check target exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser || targetUser.status !== 'active') {
      return error('User not found');
    }

    // Check blocked
    const blocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: currentUser.id, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: currentUser.id },
        ],
      },
    });
    if (blocked) {
      return error('Cannot interact with this user');
    }

    // Upsert interaction
    const interaction = await prisma.interaction.upsert({
      where: {
        actorUserId_targetUserId_type: {
          actorUserId: currentUser.id,
          targetUserId,
          type,
        },
      },
      update: {
        status: 'pending',
        updatedAt: new Date(),
      },
      create: {
        actorUserId: currentUser.id,
        targetUserId,
        type,
        status: 'pending',
      },
    });

    // Track event
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: currentUser.id,
          eventType: type,
          eventData: { targetUserId },
        },
      });
    } catch {
      // Non-critical
    }

    // Check for mutual like/connect → create match
    let matchCreated = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let createdMatch: any = null;
    let conversationId: string | null = null;

    if (type === 'like' || type === 'connect') {
      const isTargetAssisted = targetUser.profileOwnerType === 'staff_assisted';
      let isEligibleMatch = isTargetAssisted;

      if (!isEligibleMatch) {
        const reciprocal = await prisma.interaction.findFirst({
          where: {
            actorUserId: targetUserId,
            targetUserId: currentUser.id,
            type: { in: ['like', 'connect'] },
          },
        });
        if (reciprocal) isEligibleMatch = true;
      }

      if (isEligibleMatch) {
        // Check if match already exists
        const [aId, bId] = [currentUser.id, targetUserId].sort();
        let match = await prisma.match.findFirst({
          where: {
            userAId: aId,
            userBId: bId,
          },
          include: { conversation: true },
        });

        if (!match) {
          match = await prisma.match.create({
            data: {
              userAId: aId,
              userBId: bId,
            },
            include: { conversation: true },
          });
        }

        // Auto-create or link conversation
        let conversation = match.conversation;
        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              matchId: match.id,
              type: isTargetAssisted ? 'assisted' : 'direct',
              customerUserId: isTargetAssisted ? currentUser.id : null,
              representedProfileUserId: isTargetAssisted ? targetUserId : null,
              participants: {
                create: [
                  { userId: currentUser.id },
                  { userId: targetUserId },
                ],
              },
            },
          });
        }

        createdMatch = match;
        matchCreated = true;
        conversationId = conversation.id;

        // Track match event
        try {
          await prisma.analyticsEvent.create({
            data: {
              userId: currentUser.id,
              eventType: 'match',
              eventData: { matchedWith: targetUserId, isAssisted: isTargetAssisted },
            },
          });
        } catch {
          // Non-critical
        }
      }
    }

    return success({
      interaction,
      matchCreated,
      isMatch: matchCreated,
      match: createdMatch,
      conversationId,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// GET /api/interactions — list matches
export async function GET() {
  try {
    const currentUser = await requireUser();

    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { userAId: currentUser.id },
          { userBId: currentUser.id },
        ],
        status: 'active',
      },
      include: {
        userA: {
          include: {
            profile: {
              include: { photos: { where: { isPrimary: true }, take: 1 } },
            },
          },
        },
        userB: {
          include: {
            profile: {
              include: { photos: { where: { isPrimary: true }, take: 1 } },
            },
          },
        },
        conversation: true,
      },
      orderBy: { matchedAt: 'desc' },
    });

    const matchList = matches.map(m => {
      const otherUser = m.userAId === currentUser.id ? m.userB : m.userA;
      return {
        matchId: m.id,
        conversationId: m.conversation?.id,
        matchedAt: m.matchedAt,
        user: {
          id: otherUser.id,
          displayName: otherUser.profile?.displayName,
          photo: otherUser.profile?.photos[0]?.filePath || null,
          country: otherUser.profile?.country,
        },
      };
    });

    return success(matchList);
  } catch (err) {
    return handleApiError(err);
  }
}
