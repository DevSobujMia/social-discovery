import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
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
    const currentUser = await requireUser();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 300);

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

    // Fetch conversation metadata to resolve counterpart / represented identity
    const conversation = await prisma.conversation.findUnique({
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
    const currentUser = await requireUser();
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

    // Check conversation is active
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: { select: { userId: true } },
      },
    });
    if (!conversation || conversation.status !== 'active') {
      return error('This conversation is not active', 403);
    }

    // Direct defense-in-depth check for block relationship
    const otherParticipant = conversation.participants.find(p => p.userId !== currentUser.id);
    const counterpartId = conversation.representedProfileUserId || otherParticipant?.userId;

    if (counterpartId) {
      const isBlocked = await prisma.blockedUser.findFirst({
        where: {
          OR: [
            { blockerId: currentUser.id, blockedId: counterpartId },
            { blockerId: counterpartId, blockedId: currentUser.id },
          ],
        },
      });
      if (isBlocked) {
        return error('Cannot send messages to a blocked user', 403);
      }
    }

    // -------------------------------------------------------------
    // Phone-first gate: verify mobile before any customer message.
    // That number is also the returning-visitor login (no password).
    // -------------------------------------------------------------
    if (!currentUser.isVerifiedLead) {
      return error(
        'Verify your mobile number before messaging. This number is also how you log back in later.',
        403,
        { code: 'VERIFICATION_REQUIRED', messageCount: 0 }
      );
    }

    const effectiveContentType = (contentType === 'image' || contentType === 'video') ? contentType : (mediaUrl ? 'image' : 'text');
    const effectiveContent = trimmedContent || (effectiveContentType === 'video' ? '📹 Video' : effectiveContentType === 'image' ? '📷 Photo' : '');

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderUserId: currentUser.id,
        content: effectiveContent,
        contentType: effectiveContentType,
        mediaUrl: mediaUrl || null,
        // Delivered immediately — WhatsApp-style double-tick without a separate push ack.
        status: 'delivered',
      },
    });

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
        userId: { not: currentUser.id },
      },
      data: {
        unreadCount: { increment: 1 },
      },
    });

    // Track event
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: currentUser.id,
          eventType: 'message_sent',
          eventData: { conversationId: id },
        },
      });
    } catch {
      // Non-critical
    }

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
