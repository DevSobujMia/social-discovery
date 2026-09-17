import { prisma } from './db';

/** Open (or reuse) the staff-assisted thread between a customer and a profile. */
export async function ensureAssistedConversation(
  customerId: string,
  targetUserId: string
): Promise<string> {
  let conv = await prisma.conversation.findFirst({
    where: {
      customerUserId: customerId,
      representedProfileUserId: targetUserId,
    },
  });

  if (!conv) {
    conv = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: customerId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
    });
  }

  if (!conv) {
    const existingMatch = await prisma.match.findFirst({
      where: {
        OR: [
          { userAId: customerId, userBId: targetUserId },
          { userAId: targetUserId, userBId: customerId },
        ],
      },
    });

    const match =
      existingMatch ||
      (await prisma.match.create({
        data: { userAId: customerId, userBId: targetUserId },
      }));

    conv = await prisma.conversation.create({
      data: {
        matchId: match.id,
        type: 'assisted',
        status: 'active',
        customerUserId: customerId,
        representedProfileUserId: targetUserId,
        participants: {
          create: [{ userId: customerId }, { userId: targetUserId }],
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
