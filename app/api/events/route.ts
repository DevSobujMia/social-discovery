import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, handleApiError } from '@/lib/api-helpers';
import { resolveVisitorGeo } from '@/lib/geo';

// POST /api/events — track analytics events, visitors, clicks + UTM attribution
export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      body = {};
    }

    // Support single event or batch events
    const rawEvents: any[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.events)
        ? body.events
        : [body];

    const validEvents = rawEvents.filter((e) => e && (e.eventType || e.event_type));
    if (validEvents.length === 0) return success(null);

    // Resolve Geo Location once for the request
    const firstEvent = validEvents[0];
    const adHints = firstEvent.eventData?.adHints || {};
    const timezone = firstEvent.eventData?.timezone || null;

    const geo = await resolveVisitorGeo(req.headers, {
      country: adHints.country || firstEvent.country || null,
      city: adHints.city || firstEvent.city || null,
      timezone,
    });

    const userAgent = req.headers.get('user-agent') || '';

    // Process each event
    for (const ev of validEvents) {
      const eventType = String(ev.eventType || ev.event_type);
      const anonymousId = ev.anonymousId || ev.eventData?.visitorId || undefined;
      let userId: string | undefined = ev.userId || undefined;

      // Verify userId exists if supplied to prevent foreign key errors
      if (userId) {
        const userExists = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!userExists) userId = undefined;
      }

      const utm = ev.utm || {
        utm_source: ev.utmSource,
        utm_medium: ev.utmMedium,
        utm_campaign: ev.utmCampaign,
        utm_content: ev.utmContent,
        utm_term: ev.utmTerm,
        referrer: ev.referrerUrl || ev.eventData?.referrer,
        landing_page: ev.landingPage || ev.eventData?.url,
      };

      const eventData = {
        ...(ev.eventData || {}),
        ip: geo.ip,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
        flag: geo.flag,
        geoSource: geo.source,
        userAgent: userAgent.slice(0, 300),
      };

      // Store event in database
      await prisma.analyticsEvent.create({
        data: {
          userId: userId || undefined,
          anonymousId: anonymousId || undefined,
          eventType,
          eventData,
          utmCampaign: utm?.utm_campaign || undefined,
        },
      });

      // Update user geo/lastActive if registered or guest user
      if (userId) {
        try {
          await prisma.user.update({
            where: { id: userId },
            data: {
              lastActiveAt: new Date(),
              geoCountry: geo.countryCode || undefined,
              geoCity: geo.city || undefined,
            },
          });
        } catch {
          // ignore
        }
      }

      // Store UTM attribution if campaign provided
      if (utm && (utm.utm_source || utm.utm_campaign)) {
        try {
          const existing = userId
            ? await prisma.utmAttribution.findFirst({ where: { userId } })
            : anonymousId
              ? await prisma.utmAttribution.findFirst({ where: { anonymousId } })
              : null;

          if (!existing) {
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
                ipAddress: geo.ip,
                userAgent: userAgent.slice(0, 500),
                campaignId,
              },
            });
          }
        } catch {
          // ignore attribution error
        }
      }
    }

    return success({ tracked: validEvents.length, geo }, 201);
  } catch (err: any) {
    console.error('[events route error]:', err?.message || err);
    return handleApiError(err);
  }
}
