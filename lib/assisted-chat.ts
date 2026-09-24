import { prisma } from './db';

/** Open (or reuse) the staff-assisted thread between a customer and a profile. */
export async function ensureAssistedConversation(
  customerId: string,
  targetUserId: string
): Promise<string> {
  let resolvedTargetUserId = targetUserId;

  // Verify targetUserId exists and is active in the database
  const targetExists = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, status: true },
  });

  if (!targetExists || targetExists.status !== 'active') {
    // If targetUserId is a preview ID (e.g. 'preview-elena') or non-existent in DB,
    // gracefully resolve to a real active profile
    let fallbackUserId: string | null = null;

    if (typeof targetUserId === 'string' && targetUserId.startsWith('preview-')) {
      const previewName = targetUserId.replace(/^preview-/, '').toLowerCase();
      const matchedProfile = await prisma.profile.findFirst({
        where: {
          displayName: { startsWith: previewName, mode: 'insensitive' },
          isVisible: true,
          user: { status: 'active' },
        },
        select: { userId: true },
      });
      if (matchedProfile?.userId) {
        fallbackUserId = matchedProfile.userId;
      }
    }

    if (!fallbackUserId) {
      const anyActiveProfile = await prisma.profile.findFirst({
        where: {
          isVisible: true,
          user: { status: 'active' },
        },
        select: { userId: true },
      });
      if (anyActiveProfile?.userId) {
        fallbackUserId = anyActiveProfile.userId;
      } else {
        const anyUser = await prisma.user.findFirst({
          where: {
            id: { not: customerId },
            status: 'active',
          },
          select: { id: true },
        });
        if (anyUser?.id) {
          fallbackUserId = anyUser.id;
        }
      }
    }

    if (fallbackUserId) {
      resolvedTargetUserId = fallbackUserId;
    }
  }

  let conv = await prisma.conversation.findFirst({
    where: {
      customerUserId: customerId,
      representedProfileUserId: resolvedTargetUserId,
    },
  });

  if (!conv) {
    conv = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: customerId } } },
          { participants: { some: { userId: resolvedTargetUserId } } },
        ],
      },
    });
  }

  if (!conv) {
    const existingMatch = await prisma.match.findFirst({
      where: {
        OR: [
          { userAId: customerId, userBId: resolvedTargetUserId },
          { userAId: resolvedTargetUserId, userBId: customerId },
        ],
      },
    });

    const match =
      existingMatch ||
      (await prisma.match.create({
        data: { userAId: customerId, userBId: resolvedTargetUserId },
      }));

    conv = await prisma.conversation.create({
      data: {
        matchId: match.id,
        type: 'assisted',
        status: 'active',
        customerUserId: customerId,
        representedProfileUserId: resolvedTargetUserId,
        participants: {
          create: [{ userId: customerId }, { userId: resolvedTargetUserId }],
        },
      },
    });
  }

  return conv.id;
}

export async function sendCustomerText(params: {
  conversationId: string;
  senderUserId: string;
  content: string;
}) {
  const content = params.content.trim();
  if (!content) return null;

  const message = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      senderUserId: params.senderUserId,
      content,
      contentType: 'text',
      status: 'delivered',
    },
  });

  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: content.substring(0, 200),
    },
  });

  await prisma.conversationParticipant.updateMany({
    where: {
      conversationId: params.conversationId,
      userId: { not: params.senderUserId },
    },
    data: {
      unreadCount: { increment: 1 },
    },
  });

  return {
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
}
