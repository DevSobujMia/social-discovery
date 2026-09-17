import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function noStore(res: Response) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

// GET /api/admin/conversations/[id]/messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await requireStaff();
    const { id } = await params;

    // Agent access check
    if (staff.role === 'agent') {
      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId: id },
        select: { userId: true },
      });
      const userIds = participants.map(p => p.userId);
      const hasAccess = await prisma.agentAssignment.findFirst({
        where: {
          agentId: staff.id,
          userId: { in: userIds },
          status: 'active',
        },
      });
      if (!hasAccess) return error('Access denied', 403);
    }

    const [messages, conversation] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        include: {
          senderUser: {
            select: { id: true, profile: { select: { displayName: true } } },
          },
          senderStaff: {
            select: { id: true, displayName: true, role: true },
          },
          onBehalfOf: {
            select: { id: true, profile: { select: { displayName: true } } },
          },
        },
      }),
      prisma.conversation.findUnique({
        where: { id },
        include: {
          customerUser: {
            include: {
              profile: { select: { displayName: true, photos: { where: { isPrimary: true }, take: 1 } } },
              assignments: {
                where: { status: 'active' },
                include: { agent: { select: { id: true, displayName: true } } },
                take: 1,
              },
            },
          },
          representedProfileUser: {
            include: {
              profile: { select: { displayName: true, photos: { where: { isPrimary: true }, take: 1 } } },
            },
          },
          participants: {
            include: {
              user: {
                include: {
                  profile: { select: { displayName: true, photos: { where: { isPrimary: true }, take: 1 } } },
                  assignments: {
                    where: { status: 'active' },
                    include: { agent: { select: { displayName: true, id: true } } },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    if (!conversation) {
      return error('Conversation not found', 404);
    }

    // Operator opened the thread — clear operator unread counts and mark customer messages as read
    const customerUserId =
      conversation.customerUserId ||
      conversation.participants.find((p) => p.user.profileOwnerType === 'self')?.userId;

    try {
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId: id,
          ...(customerUserId ? { userId: { not: customerUserId } } : {}),
        },
        data: { unreadCount: 0, lastReadAt: new Date() },
      });

      await prisma.message.updateMany({
        where: {
          conversationId: id,
          senderStaffId: null,
          status: { in: ['sent', 'delivered'] },
        },
        data: { status: 'read' },
      });
    } catch {
      // Never fail the inbox thread because a read-receipt write locked.
    }

    // Resolve customer and represented profile
    const customerPart = conversation.participants.find(p => p.user.profileOwnerType === 'self')
      || (conversation.customerUser ? { userId: conversation.customerUser.id, user: conversation.customerUser } : null)
      || conversation.participants[0];

    const representedPart = conversation.participants.find(p => p.user.profileOwnerType === 'staff_assisted')
      || (conversation.representedProfileUser ? { userId: conversation.representedProfileUser.id, user: conversation.representedProfileUser } : null)
      || conversation.participants.find(p => p.userId !== customerPart?.userId)
      || null;

    const assignedAgent = customerPart?.user.assignments?.[0]?.agent || null;

    return noStore(
      success({
        conversation: {
        id: conversation.id,
        status: conversation.status,
        type: conversation.type,
        isAssisted: conversation.type === 'assisted' || !!representedPart,
        customer: customerPart ? {
          userId: customerPart.userId,
          displayName: customerPart.user.profile?.displayName || 'Customer',
          email: customerPart.user.email,
          photo: customerPart.user.profile?.photos?.[0]?.filePath || null,
          assignedAgent: assignedAgent?.displayName || null,
        } : null,
        representedProfile: representedPart ? {
          userId: representedPart.userId,
          displayName: representedPart.user.profile?.displayName || 'Profile',
          photo: representedPart.user.profile?.photos?.[0]?.filePath || null,
          isStaffAssisted: representedPart.user.profileOwnerType === 'staff_assisted',
        } : null,
        handledBy: assignedAgent?.displayName || null,
        participants: conversation.participants.map(p => ({
          userId: p.userId,
          displayName: p.user.profile?.displayName,
          profileOwnerType: p.user.profileOwnerType,
          assignedAgent: p.user.assignments?.[0]?.agent || null,
        })),
      },
      messages: messages.map(m => {
        const isFromStaff = !!m.senderStaffId;
        const operatorRaw = m.senderStaff?.displayName;
        const cleanOperator = (operatorRaw === 'System Administrator' || m.senderStaff?.role === 'admin') ? 'Admin' : (operatorRaw || 'Admin');
        const personaName = m.onBehalfOf?.profile?.displayName || representedPart?.user.profile?.displayName || 'Maya';
        const senderName = isFromStaff
          ? `${personaName} (${cleanOperator})`
          : m.senderUser?.profile?.displayName || customerPart?.user.profile?.displayName || 'Customer';

        return {
          id: m.id,
          content: m.deletedAt ? '[Message deleted]' : m.content,
          contentType: m.contentType,
          mediaUrl: m.mediaUrl,
          status: m.status,
          isAssisted: m.isAssisted,
          senderName,
          senderId: m.senderUserId || m.senderStaffId,
          senderStaffId: m.senderStaffId,
          senderStaff: m.senderStaff,
          sentOnBehalfOf: m.sentOnBehalfOf,
          onBehalfOf: m.onBehalfOf,
          createdAt: m.createdAt,
          deletedAt: m.deletedAt,
        };
      }),
    })
    );
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/admin/conversations/[id]/messages — staff reply on behalf of profile
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await requireStaff();
    const { id } = await params;
    const body = await req.json();
    const { content = '', onBehalfOfUserId, sentOnBehalfOf, mediaUrl = null, contentType = 'text' } = body;

    const trimmedContent = (content || '').trim();
    if (!trimmedContent && !mediaUrl) return error('Message or media is required');

    // Fetch conversation
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

    if (!conversation) return error('Conversation not found', 404);

    // Agent access check: Agent can only reply if conversation has a customer assigned to this agent
    if (staff.role === 'agent') {
      const userIds = conversation.participants.map(p => p.userId);
      const hasAccess = await prisma.agentAssignment.findFirst({
        where: {
          agentId: staff.id,
          userId: { in: userIds },
          status: 'active',
        },
      });
      if (!hasAccess) return error('Access denied', 403);
    }

    // Determine target represented profile ID
    let targetProfileId = onBehalfOfUserId || sentOnBehalfOf;
    if (!targetProfileId) {
      // Look up staff-assisted participant or conversation.representedProfileUserId
      const assistedPart = conversation.participants.find(p => p.user.profileOwnerType === 'staff_assisted');
      targetProfileId = conversation.representedProfileUserId || assistedPart?.userId || null;
    }

    const effectiveContentType = (contentType === 'image' || contentType === 'video') ? contentType : (mediaUrl ? 'image' : 'text');
    const effectiveContent = trimmedContent || (effectiveContentType === 'video' ? '📹 Video' : effectiveContentType === 'image' ? '📷 Photo' : '');

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderStaffId: staff.id,
        sentOnBehalfOf: targetProfileId,
        content: effectiveContent,
        contentType: effectiveContentType,
        mediaUrl: mediaUrl || null,
        status: 'delivered',
        isAssisted: true,
      },
      include: {
        senderStaff: { select: { id: true, displayName: true } },
        onBehalfOf: { select: { id: true, profile: { select: { displayName: true } } } },
      },
    });

    // Update conversation metadata
    await prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: effectiveContent.substring(0, 200),
      },
    });

    // Increment unread for the customer (non-represented participants)
    await prisma.conversationParticipant.updateMany({
      where: {
        conversationId: id,
        ...(targetProfileId ? { userId: { not: targetProfileId } } : {}),
      },
      data: { unreadCount: { increment: 1 } },
    });

    // Clear operator-side unread count since operator just replied
    await prisma.conversationParticipant.updateMany({
      where: {
        conversationId: id,
        ...(targetProfileId
          ? { userId: targetProfileId }
          : { user: { profileOwnerType: 'staff_assisted' } }),
      },
      data: { unreadCount: 0, lastReadAt: new Date() },
    });
    await prisma.message.updateMany({
      where: {
        conversationId: id,
        senderStaffId: null,
        status: { in: ['sent', 'delivered'] },
      },
      data: { status: 'read' },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        staffId: staff.id,
        action: 'message.send_on_behalf',
        targetType: 'conversation',
        targetId: id,
        details: {
          operatorRole: staff.role,
          operatorDisplayName: staff.displayName,
          sentOnBehalfOf: targetProfileId,
          messageId: message.id,
          contentPreview: effectiveContent.substring(0, 100),
        },
      },
    });

    return noStore(success(message, 201));
  } catch (err) {
    return handleApiError(err);
  }
}
