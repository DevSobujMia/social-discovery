import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/conversations — list user's conversations
export async function GET() {
  try {
    const currentUser = await requireUser();

    // Heartbeat: keep user lastActiveAt updated in real-time
    prisma.user
      .update({
        where: { id: currentUser.id },
        data: { lastActiveAt: new Date() },
      })
      .catch(() => {});

    const participations = await prisma.conversationParticipant.findMany({
      where: { userId: currentUser.id },
      include: {
        conversation: {
          include: {
            participants: {
              where: { userId: { not: currentUser.id } },
              include: {
                user: {
                  include: {
                    profile: {
                      include: {
                        photos: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
                        travelPlans: {
                          where: { isActive: true, toDate: { gte: new Date() } },
                          orderBy: { fromDate: 'asc' },
                          take: 1,
                          select: { city: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            representedProfileUser: {
              include: {
                profile: {
                  include: {
                    photos: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
                    travelPlans: {
                      where: { isActive: true, toDate: { gte: new Date() } },
                      orderBy: { fromDate: 'asc' },
                      take: 1,
                      select: { city: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });

    const conversations = participations.map(p => {
      const conv = p.conversation;
      const otherParticipant = conv.participants[0];
      const otherUser = otherParticipant?.user;

      // Determine counter-party: if this is an assisted conversation where current user is the customer,
      // counter-party is the represented profile.
      const counterpart = (conv.type === 'assisted' && conv.representedProfileUser)
        ? conv.representedProfileUser
        : otherUser;

      const nextTrip = counterpart?.profile?.travelPlans?.[0] || null;
      const isVerified = Boolean(counterpart?.profile?.isVerified);
      const travelCity = nextTrip?.city || null;

      return {
        id: conv.id,
        type: conv.type,
        isAssisted: conv.type === 'assisted' || counterpart?.profileOwnerType === 'staff_assisted',
        representedProfileUserId: conv.representedProfileUserId,
        lastMessageAt: conv.lastMessageAt || conv.createdAt,
        lastMessagePreview: conv.lastMessagePreview,
        unreadCount: p.unreadCount,
        status: conv.status,
        participant: counterpart ? {
          userId: counterpart.id,
          displayName: counterpart.profile?.displayName || 'Unknown',
          photo: counterpart.profile?.photos[0]?.filePath || null,
          gender: counterpart.profile?.gender || null,
          country: counterpart.profile?.country || null,
          unreadCount: p.unreadCount,
          lastActiveAt: counterpart.lastActiveAt,
          profileOwnerType: counterpart.profileOwnerType,
          isVerified,
          travelCity,
        } : {
          userId: '',
          displayName: 'Unknown',
          photo: null,
          gender: null,
          country: null,
          unreadCount: 0,
          lastActiveAt: null,
          profileOwnerType: 'self',
          isVerified: false,
          travelCity: null,
        },
        otherUser: counterpart ? {
          id: counterpart.id,
          displayName: counterpart.profile?.displayName || 'Unknown',
          photo: counterpart.profile?.photos[0]?.filePath || null,
          country: counterpart.profile?.country,
          profileOwnerType: counterpart.profileOwnerType,
          isVerified,
          travelCity,
        } : null,
      };
    });

    return success({ conversations });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/conversations — create or get direct/assisted conversation with a target user
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireUser();
    const body = await req.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return error('targetUserId is required');
    }

    if (targetUserId === currentUser.id) {
      return error('Cannot create conversation with yourself');
    }

    let targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { profile: { include: { photos: true } } },
    });

    if (!targetUser && typeof targetUserId === 'string' && targetUserId.startsWith('preview-')) {
      const previewName = targetUserId.replace(/^preview-/, '').toLowerCase();
      const matchedProfile = await prisma.profile.findFirst({
        where: {
          displayName: { startsWith: previewName, mode: 'insensitive' },
          isVisible: true,
          user: { status: 'active' },
        },
        include: { user: { include: { profile: { include: { photos: true } } } } },
      });
      if (matchedProfile?.user) {
        targetUser = matchedProfile.user;
      }
    }

    if (!targetUser || targetUser.status !== 'active') {
      return error('User not found', 404);
    }

    const actualTargetUserId = targetUser.id;

    // Check if either user has blocked the other
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: currentUser.id, blockedId: actualTargetUserId },
          { blockerId: actualTargetUserId, blockedId: currentUser.id },
        ],
      },
    });
    if (isBlocked) {
      return error('Cannot start a conversation with a blocked user', 403);
    }

    const isAssisted = targetUser.profileOwnerType === 'staff_assisted';

    // Find existing conversation between the two users
    let existingConversation = await prisma.conversation.findFirst({
      where: {
        participants: {
          every: { userId: { in: [currentUser.id, actualTargetUserId] } },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              include: {
                profile: { include: { photos: { where: { isPrimary: true }, take: 1 } } },
              },
            },
          },
        },
      },
    });

    if (!existingConversation) {
      // Find or create match if needed
      const [aId, bId] = [currentUser.id, actualTargetUserId].sort();
      let match = await prisma.match.findUnique({
        where: { userAId_userBId: { userAId: aId, userBId: bId } },
      });

      if (!match) {
        match = await prisma.match.create({
          data: {
            userAId: aId,
            userBId: bId,
            status: 'active',
          },
        });
      }

      existingConversation = await prisma.conversation.create({
        data: {
          matchId: match.id,
          type: isAssisted ? 'assisted' : 'direct',
          customerUserId: isAssisted ? currentUser.id : null,
          representedProfileUserId: isAssisted ? actualTargetUserId : null,
          participants: {
            create: [
              { userId: currentUser.id },
              { userId: actualTargetUserId },
            ],
          },
        },
        include: {
          participants: {
            include: {
              user: {
                include: {
                  profile: { include: { photos: { where: { isPrimary: true }, take: 1 } } },
                },
              },
            },
          },
        },
      });
    }

    return success({
      conversation: {
        id: existingConversation.id,
        type: existingConversation.type,
        status: existingConversation.status,
      },
    }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
