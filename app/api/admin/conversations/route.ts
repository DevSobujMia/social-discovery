import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

// GET /api/admin/conversations — master inbox
export async function GET(req: NextRequest) {
  try {
    const staff = await requireStaff();
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const skip = (page - 1) * limit;
    const agentFilter = searchParams.get('agentId');
    const hasUnread = searchParams.get('hasUnread');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // For agents, only show conversations involving customers assigned to them
    if (staff.role === 'agent') {
      const assignments = await prisma.agentAssignment.findMany({
        where: { agentId: staff.id, status: 'active' },
        select: { userId: true },
      });
      const assignedCustomerIds = assignments.map(a => a.userId);
      where.participants = {
        some: { userId: { in: assignedCustomerIds } },
      };
    }

    if (agentFilter) {
      const agentAssignments = await prisma.agentAssignment.findMany({
        where: { agentId: agentFilter, status: 'active' },
        select: { userId: true },
      });
      const agentUserIds = agentAssignments.map(a => a.userId);
      where.participants = {
        some: { userId: { in: agentUserIds } },
      };
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          representedProfileUser: {
            include: {
              profile: {
                select: { displayName: true, photos: { where: { isPrimary: true }, take: 1 } },
              },
            },
          },
          customerUser: {
            include: {
              profile: {
                select: { displayName: true, photos: { where: { isPrimary: true }, take: 1 } },
              },
              assignments: {
                where: { status: 'active' },
                include: { agent: { select: { id: true, displayName: true } } },
                take: 1,
              },
            },
          },
          participants: {
            include: {
              user: {
                include: {
                  profile: {
                    select: { displayName: true, photos: { where: { isPrimary: true }, take: 1 } },
                  },
                  assignments: {
                    where: { status: 'active' },
                    include: { agent: { select: { id: true, displayName: true } } },
                    take: 1,
                  },
                },
              },
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              content: true,
              senderUserId: true,
              senderStaffId: true,
              sentOnBehalfOf: true,
              isAssisted: true,
              createdAt: true,
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    const result = conversations.map(conv => {
      // Only count unread waiting for the operator (staff-assisted profile side).
      // Customer's unread must NOT reappear as admin inbox unread after refresh.
      const totalUnread = conv.participants.reduce((sum, p) => {
        if (p.user.profileOwnerType === 'staff_assisted') return sum + (p.unreadCount || 0);
        return sum;
      }, 0);

      // Distinguish customer and represented profile
      const customerPart = conv.participants.find(p => p.user.profileOwnerType === 'self')
        || (conv.customerUser ? { userId: conv.customerUser.id, user: conv.customerUser, unreadCount: 0 } : null)
        || conv.participants[0];

      const representedPart = conv.participants.find(p => p.user.profileOwnerType === 'staff_assisted')
        || (conv.representedProfileUser ? { userId: conv.representedProfileUser.id, user: conv.representedProfileUser, unreadCount: 0 } : null)
        || conv.participants.find(p => p.userId !== customerPart?.userId)
        || null;

      const customerUser = customerPart?.user;
      const representedUser = representedPart?.user;

      const customerDisplayName = customerUser?.profile?.displayName || 'Customer';
      const representedDisplayName = representedUser?.profile?.displayName || 'Profile';
      const assignedAgent = customerUser?.assignments?.[0]?.agent || null;

      return {
        id: conv.id,
        status: conv.status,
        type: conv.type,
        isAssisted: conv.type === 'assisted' || representedUser?.profileOwnerType === 'staff_assisted',
        lastMessageAt: conv.lastMessageAt,
        lastMessagePreview: conv.lastMessagePreview,
        totalUnread,
        customer: customerPart ? {
          userId: customerPart.userId,
          displayName: customerDisplayName,
          email: customerUser?.email || null,
          photo: customerUser?.profile?.photos?.[0]?.filePath || null,
          assignedAgent: assignedAgent?.displayName || null,
          assignedAgentId: assignedAgent?.id || null,
        } : null,
        representedProfile: representedPart ? {
          userId: representedPart.userId,
          displayName: representedDisplayName,
          photo: representedUser?.profile?.photos?.[0]?.filePath || null,
          isStaffAssisted: representedUser?.profileOwnerType === 'staff_assisted',
        } : null,
        handledBy: assignedAgent?.displayName || null,
        participants: conv.participants.map(p => ({
          userId: p.userId,
          displayName: p.user.profile?.displayName || 'Unknown',
          user: {
            profile: { displayName: p.user.profile?.displayName || 'Unknown' },
            profileOwnerType: p.user.profileOwnerType,
          },
          unreadCount: p.unreadCount,
          assignedAgent: p.user.assignments?.[0]?.agent?.displayName || null,
        })),
        lastMessage: conv.messages[0] || null,
      };
    });

    if (hasUnread === 'true') {
      const filtered = result.filter(c => c.totalUnread > 0);
      return success({
        conversations: filtered,
        pagination: { page, limit, total: filtered.length, totalPages: 1 },
      });
    }

    return success({
      conversations: result,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
