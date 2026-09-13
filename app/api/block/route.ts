import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

// GET /api/block — check block status or list blocked users
export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireUser();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (userId) {
      const [blockedByMe, blockedByOther] = await Promise.all([
        prisma.blockedUser.findUnique({
          where: {
            blockerId_blockedId: {
              blockerId: currentUser.id,
              blockedId: userId,
            },
          },
        }),
        prisma.blockedUser.findUnique({
          where: {
            blockerId_blockedId: {
              blockerId: userId,
              blockedId: currentUser.id,
            },
          },
        }),
      ]);

      return success({
        isBlocked: !!(blockedByMe || blockedByOther),
        blockedByMe: !!blockedByMe,
        blockedByOther: !!blockedByOther,
      });
    }

    // List all users blocked by current user
    const blockedRecords = await prisma.blockedUser.findMany({
      where: { blockerId: currentUser.id },
      select: { blockedId: true, createdAt: true },
    });

    return success({
      blockedUserIds: blockedRecords.map((b) => b.blockedId),
      blockedUsers: blockedRecords,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/block — block a user
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireUser();
    const body = await req.json();
    const { userId } = body;

    if (!userId) return error('userId is required');
    if (userId === currentUser.id) return error('Cannot block yourself');

    await prisma.blockedUser.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: currentUser.id,
          blockedId: userId,
        },
      },
      update: {},
      create: {
        blockerId: currentUser.id,
        blockedId: userId,
      },
    });

    // Block all conversations involving this user and current user
    const conversations = await prisma.conversationParticipant.findMany({
      where: { userId: currentUser.id },
      select: { conversationId: true },
    });

    for (const conv of conversations) {
      const otherParticipant = await prisma.conversationParticipant.findFirst({
        where: {
          conversationId: conv.conversationId,
          userId,
        },
      });
      if (otherParticipant) {
        await prisma.conversation.update({
          where: { id: conv.conversationId },
          data: { status: 'blocked' },
        });
      }
    }

    return success({ message: 'User blocked' });
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/block — unblock
export async function DELETE(req: NextRequest) {
  try {
    const currentUser = await requireUser();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return error('userId is required');

    await prisma.blockedUser.deleteMany({
      where: {
        blockerId: currentUser.id,
        blockedId: userId,
      },
    });

    // Check if the other user also blocked currentUser
    const reverseBlock = await prisma.blockedUser.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: userId,
          blockedId: currentUser.id,
        },
      },
    });

    // If no reverse block exists, restore conversation status to 'active'
    if (!reverseBlock) {
      const conversations = await prisma.conversationParticipant.findMany({
        where: { userId: currentUser.id },
        select: { conversationId: true },
      });

      for (const conv of conversations) {
        const otherParticipant = await prisma.conversationParticipant.findFirst({
          where: {
            conversationId: conv.conversationId,
            userId,
          },
        });
        if (otherParticipant) {
          await prisma.conversation.update({
            where: { id: conv.conversationId },
            data: { status: 'active' },
          });
        }
      }
    }

    return success({ message: 'User unblocked' });
  } catch (err) {
    return handleApiError(err);
  }
}
