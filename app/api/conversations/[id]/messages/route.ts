import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, getCurrentStaff, requireUser, signToken } from '@/lib/auth';
import { sendPushToStaff, sendPushToUser } from '@/lib/push-service';
import { success, error, handleApiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function noStore(res: Response) {
  res.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function formatMessages(
  messages: any[],
  currentUser: { id: string; profile?: { displayName?: string | null } | null },
  fallbackRepresentedName: string,
  otherParticipantUserId?: string | null
) {
  return messages.map((m) => {
    const isOwn = m.senderUserId === currentUser.id;
    let senderName = 'Unknown';
    let senderId = m.senderUserId;

    if (isOwn) {
      senderName = currentUser.profile?.displayName || 'You';
    } else if (m.sentOnBehalfOf || m.senderStaffId) {
      senderName = m.onBehalfOf?.profile?.displayName || fallbackRepresentedName;
      senderId = m.sentOnBehalfOf || otherParticipantUserId || m.senderUserId;
    } else {
      senderName = m.senderUser?.profile?.displayName || fallbackRepresentedName;
    }

    return {
      id: m.id,
      conversationId: m.conversationId,
      content: m.content,
      contentType: m.contentType,
      mediaUrl: m.mediaUrl,
      status: m.status,
      isAssisted: m.isAssisted,
      senderName,
      senderId,
      senderUserId: m.senderUserId,
      senderStaffId: m.senderStaffId,
      sentOnBehalfOf: m.sentOnBehalfOf,
      isOwn,
      createdAt: m.createdAt,
    };
  });
}

// GET /api/conversations/[id]/messages — get messages for a conversation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireUser(req);

    // Heartbeat: update lastActiveAt for presence
    prisma.user
      .update({
        where: { id: currentUser.id },
        data: { lastActiveAt: new Date() },
      })
      .catch(() => {});

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 300);
    const isPoll = searchParams.get('poll') === '1';

    // Check participation
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: currentUser.id,
        },
      },
    });

    if (!participant) {
      return error('Conversation not found', 404);
    }

    // Polls already know sender names from the open thread — skip the extra join.
    const conversation = isPoll
      ? null
      : await prisma.conversation.findUnique({
          where: { id },
          include: {
            representedProfileUser: {
              include: {
                profile: { select: { displayName: true } },
              },
            },
            participants: {
              include: {
                user: {
                  include: {
                    profile: { select: { displayName: true } },
                  },
                },
              },
            },
          },
        });

    // Do not filter deletedAt: null — PGlite/Prisma can drop inbound staff
    // rows on that predicate while lastMessagePreview still updates.
    let recent: any[] = [];
    try {
      recent = await prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          senderUser: {
            select: {
              id: true,
              profile: { select: { displayName: true } },
            },
          },
          onBehalfOf: {
            select: {
              id: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      });
    } catch {
      recent = await prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }
    const messages = recent.filter((m) => !m.deletedAt).slice().reverse();

    // Read receipts must never fail the history fetch — a PGlite write lock
    // on poll was wiping the customer thread in the UI.
    if (participant.unreadCount > 0) {
      try {
        await prisma.conversationParticipant.update({
          where: { id: participant.id },
          data: {
            unreadCount: 0,
            lastReadAt: new Date(),
          },
        });
        await prisma.message.updateMany({
          where: {
            conversationId: id,
            OR: [
              { senderUserId: { not: currentUser.id } },
              { senderUserId: null },
            ],
            status: { in: ['sent', 'delivered'] },
          },
          data: { status: 'read' },
        });
      } catch {
        // History still returns below.
      }
    }

    const otherParticipant = conversation?.participants.find(p => p.userId !== currentUser.id);
    const fallbackRepresentedName = conversation?.representedProfileUser?.profile?.displayName
      || otherParticipant?.user?.profile?.displayName
      || 'Profile';

    const formatted = formatMessages(
      messages,
      currentUser,
      fallbackRepresentedName,
      otherParticipant?.userId || conversation?.representedProfileUserId
    );

    return noStore(
      success({
        messages: formatted,
        hasMore: messages.length === limit,
        nextCursor: messages.length === limit ? messages[0]?.id : null,
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/conversations/[id]/messages — send a message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    const currentStaff = !currentUser ? await getCurrentStaff(req) : null;

    if (!currentUser && !currentStaff) {
      return error('Unauthorized', 401);
    }

    const { id } = await params;
    const body = await req.json();
    const { content = '', contentType = 'text', mediaUrl = null } = body;

    const trimmedContent = (content || '').trim();
    if (!trimmedContent && !mediaUrl) {
      return error('Message content or media is required');
    }

    if (trimmedContent.length > 5000) {
      return error('Message is too long');
    }

    // Check conversation exists and is active
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!conversation || conversation.status !== 'active') {
      return error('Conversation not found or not active', 404);
    }

    const effectiveContentType = (contentType === 'image' || contentType === 'video') ? contentType : (mediaUrl ? 'image' : 'text');
    const effectiveContent = trimmedContent || (effectiveContentType === 'video' ? '📹 Video' : effectiveContentType === 'image' ? '📷 Photo' : '');

    // -------------------------------------------------------------
    // BRANCH A: Staff Member (e.g. Quick Reply from notification)
    // -------------------------------------------------------------
    if (currentStaff) {
      const assistedPart = conversation.participants.find(p => p.user.profileOwnerType === 'staff_assisted');
      const targetProfileId = conversation.representedProfileUserId || assistedPart?.userId || null;

      if (targetProfileId) {
        prisma.user
          .update({
            where: { id: targetProfileId },
            data: { lastActiveAt: new Date() },
          })
          .catch(() => {});
      }

      const message = await prisma.message.create({
        data: {
          conversationId: id,
          senderStaffId: currentStaff.id,
          sentOnBehalfOf: targetProfileId,
          content: effectiveContent,
          contentType: effectiveContentType,
          mediaUrl: mediaUrl || null,
          status: 'delivered',
          isAssisted: true,
        },
        include: {
          onBehalfOf: { select: { id: true, profile: { select: { displayName: true } } } },
        },
      });

      await prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: effectiveContent.substring(0, 200),
        },
      });

      // Increment customer unread
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId: id,
          ...(targetProfileId ? { userId: { not: targetProfileId } } : {}),
        },
        data: { unreadCount: { increment: 1 } },
      });

      // Clear operator unread
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId: id,
          ...(targetProfileId
            ? { userId: targetProfileId }
            : { user: { profileOwnerType: 'staff_assisted' } }),
        },
        data: { unreadCount: 0, lastReadAt: new Date() },
      });

      // Dispatch Web Push to customer
      try {
        const customerPart =
          conversation.participants.find(
            (p) => p.userId !== targetProfileId && p.user.profileOwnerType === 'self'
          ) ||
          conversation.participants.find((p) => p.userId !== targetProfileId);

        if (customerPart) {
          const personaName = message.onBehalfOf?.profile?.displayName || 'City Host';
          const userToken = signToken({
            id: customerPart.userId,
            email: customerPart.user.email || '',
            type: 'user',
          });
          sendPushToUser(customerPart.userId, {
            title: personaName,
            body: effectiveContent,
            conversationId: id,
            url: `/?tab=messenger&chat=${encodeURIComponent(id)}`,
            token: userToken,
          }).catch((err) => console.warn('[Push] Error notifying customer:', err));
        }
      } catch {}

      const msgPayload = {
        id: message.id,
        conversationId: message.conversationId,
        content: message.content,
        contentType: message.contentType,
        mediaUrl: message.mediaUrl,
        status: message.status,
        isAssisted: message.isAssisted,
        senderUserId: null,
        senderStaffId: message.senderStaffId,
        sentOnBehalfOf: message.sentOnBehalfOf,
        isOwn: true,
        createdAt: message.createdAt,
      };

      return success({ ...msgPayload, message: msgPayload }, 201);
    }

    // -------------------------------------------------------------
    // BRANCH B: Customer / User
    // -------------------------------------------------------------
    // Check participation
    const participant = conversation.participants.find((p) => p.userId === currentUser!.id);
    if (!participant) {
      return error('Conversation not found', 404);
    }

    // Direct defense-in-depth check for block relationship
    const otherParticipant = conversation.participants.find((p) => p.userId !== currentUser!.id);
    const counterpartId = conversation.representedProfileUserId || otherParticipant?.userId;

    if (counterpartId) {
      const isBlocked = await prisma.blockedUser.findFirst({
        where: {
          OR: [
            { blockerId: currentUser!.id, blockedId: counterpartId },
            { blockerId: counterpartId, blockedId: currentUser!.id },
          ],
        },
      });
      if (isBlocked) {
        return error('Cannot send messages to a blocked user', 403);
      }
    }

    // If operator has explicitly requested human verification, customer must verify before sending further messages
    if (!currentUser!.isVerifiedLead) {
      const hasVerificationRequest = await prisma.message.findFirst({
        where: {
          conversationId: id,
          content: '__REQUEST_HUMAN_VERIFICATION__',
        },
      });
      if (hasVerificationRequest) {
        return error(
          'Please complete human verification to continue chatting.',
          403,
          { code: 'VERIFICATION_REQUIRED', messageCount: 0 }
        );
      }
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderUserId: currentUser!.id,
        content: effectiveContent,
        contentType: effectiveContentType,
        mediaUrl: mediaUrl || null,
        status: 'delivered',
      },
    });

    // Touch customer activity for real-time presence
    prisma.user
      .update({
        where: { id: currentUser!.id },
        data: { lastActiveAt: new Date() },
      })
      .catch(() => {});

    // Update conversation metadata
    const preview = effectiveContent.substring(0, 200);
    await prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview,
      },
    });

    // Increment unread count for other participants
    await prisma.conversationParticipant.updateMany({
      where: {
        conversationId: id,
        userId: { not: currentUser!.id },
      },
      data: {
        unreadCount: { increment: 1 },
      },
    });

    // Track event
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: currentUser!.id,
          eventType: 'message_sent',
          eventData: { conversationId: id },
        },
      });
    } catch {}

    // Dispatch Web Push to staff (wakes up staff phones even when admin tab is closed)
    try {
      const senderTitle = currentUser!.profile?.displayName || 'Customer message';
      sendPushToStaff({
        title: senderTitle,
        body: effectiveContent,
        conversationId: id,
        url: `/admin`,
      }).catch((err) => console.warn('[Push] Error notifying staff:', err));
    } catch {}

    // If there is another non-assisted customer participant, dispatch Web Push to them too
    try {
      if (otherParticipant && otherParticipant.user.profileOwnerType === 'self') {
        const otherToken = signToken({
          id: otherParticipant.userId,
          email: otherParticipant.user.email || '',
          type: 'user',
        });
        sendPushToUser(otherParticipant.userId, {
          title: currentUser!.profile?.displayName || 'City Host',
          body: effectiveContent,
          conversationId: id,
          url: `/?tab=messenger&chat=${encodeURIComponent(id)}`,
          token: otherToken,
        }).catch((err) => console.warn('[Push] Error notifying other user:', err));
      }
    } catch {}

    const msgPayload = {
      id: message.id,
      conversationId: message.conversationId,
      content: message.content,
      contentType: message.contentType,
      mediaUrl: message.mediaUrl,
      status: message.status,
      isAssisted: message.isAssisted,
      senderUserId: message.senderUserId,
      senderStaffId: message.senderStaffId,
      sentOnBehalfOf: message.sentOnBehalfOf,
      isOwn: true,
      createdAt: message.createdAt,
    };

    return success({
      ...msgPayload,
      message: msgPayload,
    }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
