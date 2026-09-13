import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, handleApiError } from '@/lib/api-helpers';

// POST /api/events — track analytics events + UTM attribution
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventType, eventData, userId, anonymousId } = body;
    const utm = body.utm || {
      utm_source: body.utmSource,
      utm_medium: body.utmMedium,
      utm_campaign: body.utmCampaign,
      utm_content: body.utmContent,
      utm_term: body.utmTerm,
      referrer: body.referrerUrl,
      landing_page: body.landingPage,
    };

    if (!eventType) return success(null);

    // Store event
    await prisma.analyticsEvent.create({
      data: {
        userId: userId || undefined,
        anonymousId: anonymousId || undefined,
        eventType,
        eventData: eventData || undefined,
        utmCampaign: utm?.utm_campaign || undefined,
      },
    });

    // Store UTM attribution if provided
    if (utm && (utm.utm_source || utm.utm_campaign)) {
      const ip = req.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = req.headers.get('user-agent') || '';

      // Check if we already have attribution for this user/anonymous
      const existingKey = userId
        ? { userId }
        : anonymousId
          ? { anonymousId }
          : null;

      if (existingKey) {
        const existing = userId
          ? await prisma.utmAttribution.findFirst({ where: { userId } })
          : anonymousId
            ? await prisma.utmAttribution.findFirst({ where: { anonymousId } })
            : null;

        if (!existing) {
          // Match campaign
          let campaignId: string | undefined;
          if (utm.utm_campaign) {
            const campaign = await prisma.campaign.findUnique({
              where: { utmCampaign: utm.utm_campaign },
            });
            campaignId = campaign?.id;
          }

          await prisma.utmAttribution.create({
            data: {
              userId: userId || undefined,
              anonymousId: anonymousId || undefined,
              utmSource: utm.utm_source,
              utmMedium: utm.utm_medium,
              utmCampaign: utm.utm_campaign,
              utmContent: utm.utm_content,
              utmTerm: utm.utm_term,
              referrerUrl: utm.referrer,
              landingPage: utm.landing_page,
              ipAddress: ip,
              userAgent,
              campaignId,
            },
          });

          // Auto-assign to agent if campaign has a route
          if (userId && utm.utm_campaign) {
            const route = await prisma.campaignAgentRoute.findFirst({
              where: {
                campaign: { utmCampaign: utm.utm_campaign },
                isActive: true,
              },
              include: { campaign: true },
            });

            if (route) {
              // Check if already assigned
              const existingAssignment = await prisma.agentAssignment.findFirst({
                where: { userId, status: 'active' },
              });

              if (!existingAssignment) {
                await prisma.agentAssignment.create({
                  data: {
                    userId,
                    agentId: route.agentId,
                    assignedBy: route.agentId, // Auto-assigned
                    notes: `Auto-assigned from campaign: ${utm.utm_campaign}`,
                  },
                });

                await prisma.assignmentHistory.create({
                  data: {
                    userId,
                    newAgentId: route.agentId,
                    action: 'assigned',
                    performedBy: route.agentId,
                    reason: `Auto-assigned from campaign: ${utm.utm_campaign}`,
                  },
                });
              }
            }
          }
        }
      }
    }

    return success(null, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
