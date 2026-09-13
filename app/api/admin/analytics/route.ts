import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { success, handleApiError } from '@/lib/api-helpers';

export async function GET() {
  try {
    await requireAdmin();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      newToday,
      newThisWeek,
      totalMatches,
      totalConversations,
      totalMessages,
      unassignedCount,
      agentWorkload,
      recentEvents,
      campaignStats,
    ] = await Promise.all([
      prisma.user.count({ where: { status: 'active' } }),
      prisma.user.count({ where: { status: 'active', lastActiveAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.match.count({ where: { status: 'active' } }),
      prisma.conversation.count(),
      prisma.message.count(),
      // Unassigned users (active users without an active assignment)
      prisma.user.count({
        where: {
          status: 'active',
          signupStage: 'active',
          assignments: { none: { status: 'active' } },
        },
      }),
      // Agent workload
      prisma.staffAccount.findMany({
        where: { role: 'agent', status: 'active' },
        select: {
          id: true,
          displayName: true,
          _count: { select: { agentAssignments: { where: { status: 'active' } } } },
        },
      }),
      // Recent events by type
      prisma.analyticsEvent.groupBy({
        by: ['eventType'],
        _count: true,
        where: { createdAt: { gte: weekAgo } },
      }),
      // Campaign attribution stats
      prisma.utmAttribution.groupBy({
        by: ['utmCampaign'],
        _count: true,
        where: { utmCampaign: { not: null } },
      }),
    ]);

    // Funnel data
    const funnelData = {
      visitors: recentEvents.find(e => e.eventType === 'page_view')?._count || 0,
      profileViews: recentEvents.find(e => e.eventType === 'profile_view')?._count || 0,
      signups: recentEvents.find(e => e.eventType === 'signup_complete')?._count || 0,
      likes: recentEvents.find(e => e.eventType === 'like')?._count || 0,
      matches: recentEvents.find(e => e.eventType === 'match')?._count || 0,
      chatsStarted: recentEvents.find(e => e.eventType === 'chat_started')?._count || 0,
      messagesSent: recentEvents.find(e => e.eventType === 'message_sent')?._count || 0,
    };

    return success({
      overview: {
        totalUsers,
        activeUsers,
        newToday,
        newThisWeek,
        totalMatches,
        totalConversations,
        totalMessages,
        unassignedCount,
      },
      agentWorkload: agentWorkload.map(a => ({
        id: a.id,
        name: a.displayName,
        assignedUsers: a._count.agentAssignments,
      })),
      funnel: funnelData,
      campaignStats: campaignStats.map(c => ({
        campaign: c.utmCampaign,
        leads: c._count,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
