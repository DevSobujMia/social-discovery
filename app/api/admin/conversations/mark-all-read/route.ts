import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { success, handleApiError } from '@/lib/api-helpers';

// POST /api/admin/conversations/mark-all-read — clear all operator unread counts across all conversations
export async function POST(req: NextRequest) {
  try {
    await requireStaff();

    // Mark all delivered/sent messages without senderStaffId as read
    await prisma.message.updateMany({
      where: {
        senderStaffId: null,
        status: { in: ['sent', 'delivered'] },
      },
      data: { status: 'read' },
    });

    // Reset unreadCount for all staff_assisted participants and non-self participants
    await prisma.conversationParticipant.updateMany({
      where: {
        OR: [
          { user: { profileOwnerType: 'staff_assisted' } },
          { user: { profileOwnerType: { not: 'self' } } },
        ],
      },
      data: {
        unreadCount: 0,
        lastReadAt: new Date(),
      },
    });

    return success({ message: 'All conversations marked as read' });
  } catch (err) {
    return handleApiError(err);
  }
}
