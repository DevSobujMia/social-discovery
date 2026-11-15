import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { success, handleApiError } from '@/lib/api-helpers';
import { getCountryFlag } from '@/lib/geo';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7d';
    const search = (searchParams.get('search') || '').trim().toLowerCase();

    const now = new Date();
    let startDate: Date;

    if (range === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === 'all') {
      startDate = new Date(2020, 0, 1);
    } else {
      // Default: 7 days
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Fetch analytics events within date range
    const events = await prisma.analyticsEvent.findMany({
      where: {
        createdAt: { gte: startDate },
        eventType: { in: ['page_view', 'click', 'ad_landing_view', 'profile_view'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 2500,
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            whatsapp: true,
            leadStage: true,
            leadScore: true,
            profile: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
    });

    // Today's events for daily badges
    const todayEvents = events.filter((e) => e.createdAt >= todayStart);

    // Grouping & Aggregating Data
    const visitorMap = new Map<string, {
      visitorId: string;
      sessionId?: string;
      user?: any;
      firstSeenAt: Date;
      lastActiveAt: Date;
      country: string;
      countryCode: string;
      city: string;
      flag: string;
      ip: string;
      deviceType: string;
      os: string;
      browser: string;
      screen: string;
      viewport: string;
      isInAppBrowser: boolean;
      landingPage: string;
      referrer: string;
      utmCampaign: string | null;
      pageViewsCount: number;
      clicksCount: number;
      clicks: Array<{
        id: string;
        time: Date;
        targetText: string;
        targetTag: string;
        targetId?: string;
        targetHref?: string;
        section: string;
        path: string;
        coords?: any;
      }>;
    }>();

    const countryCountMap = new Map<string, { country: string; countryCode: string; flag: string; count: number }>();
    const cityCountMap = new Map<string, { city: string; country: string; count: number }>();
    const deviceTypeMap = new Map<string, number>();
    const osMap = new Map<string, number>();
    const browserMap = new Map<string, number>();
    const clickTargetMap = new Map<string, { targetText: string; section: string; targetTag: string; clicksCount: number; uniqueVisitors: Set<string>; lastClickedAt: Date }>();
    const recentClicks: any[] = [];

    let totalPageViews = 0;
    let totalClicks = 0;
    let mobileCount = 0;
    let inAppCount = 0;

    for (const ev of events) {
      const data: any = ev.eventData || {};
      const vid = ev.anonymousId || data.visitorId || (ev.userId ? `u_${ev.userId}` : `unknown_${ev.id}`);
      const country = data.country || 'Saudi Arabia';
      const countryCode = (data.countryCode || 'SA').toUpperCase();
      const city = data.city || 'Riyadh';
      const flag = data.flag || getCountryFlag(countryCode);
      const ip = data.ip || '127.0.0.1';

      // Device info
      const dev = data.device || {};
      const deviceType = dev.deviceClass || (dev.isMobile ? 'phone' : 'desktop');
      const os = dev.os || 'Unknown OS';
      const browser = dev.browser || 'Browser';
      const isInApp = Boolean(dev.isInAppBrowser || dev.inAppBrowser);

      if (ev.eventType === 'page_view' || ev.eventType === 'ad_landing_view') {
        totalPageViews++;
      } else if (ev.eventType === 'click') {
        totalClicks++;
      }

      if (deviceType === 'phone' || deviceType === 'tablet' || dev.isMobile) {
        mobileCount++;
      }
      if (isInApp) {
        inAppCount++;
      }

      // Geo stats
      const cKey = countryCode || country;
      const cEntry = countryCountMap.get(cKey) || { country, countryCode, flag, count: 0 };
      cEntry.count++;
      countryCountMap.set(cKey, cEntry);

      if (city) {
        const cityKey = `${city}, ${countryCode}`;
        const cityEntry = cityCountMap.get(cityKey) || { city, country, count: 0 };
        cityEntry.count++;
        cityCountMap.set(cityKey, cityEntry);
      }

      // Device stats
      const dtKey = deviceType === 'phone' ? 'Mobile' : deviceType === 'tablet' ? 'Tablet' : 'Desktop';
      deviceTypeMap.set(dtKey, (deviceTypeMap.get(dtKey) || 0) + 1);

      const osClean = os.startsWith('Android') ? 'Android' : os.startsWith('iOS') ? 'iOS' : os;
      osMap.set(osClean, (osMap.get(osClean) || 0) + 1);

      const bName = isInApp ? `${browser} (In-App)` : browser;
      browserMap.set(bName, (browserMap.get(bName) || 0) + 1);

      // Visitor aggregation
      let visitor = visitorMap.get(vid);
      if (!visitor) {
        visitor = {
          visitorId: vid,
          sessionId: data.sessionId,
          user: ev.user,
          firstSeenAt: ev.createdAt,
          lastActiveAt: ev.createdAt,
          country,
          countryCode,
          city,
          flag,
          ip,
          deviceType: dtKey,
          os,
          browser: bName,
          screen: data.screen || '390×844',
          viewport: data.viewport || '390×740',
          isInAppBrowser: isInApp,
          landingPage: data.url || data.path || '/',
          referrer: data.referrer || 'Direct / Ads',
          utmCampaign: ev.utmCampaign || null,
          pageViewsCount: 0,
          clicksCount: 0,
          clicks: [],
        };
        visitorMap.set(vid, visitor);
      }

      if (ev.createdAt > visitor.lastActiveAt) {
        visitor.lastActiveAt = ev.createdAt;
      }
      if (ev.createdAt < visitor.firstSeenAt) {
        visitor.firstSeenAt = ev.createdAt;
      }

      if (ev.eventType === 'page_view' || ev.eventType === 'ad_landing_view') {
        visitor.pageViewsCount++;
      }

      // Click details
      if (ev.eventType === 'click') {
        visitor.clicksCount++;
        const targetText = data.targetText || 'Clicked Element';
        const targetTag = data.targetTag || 'BUTTON';
        const section = data.section || 'Page';
        const path = data.path || '/';

        const clickObj = {
          id: ev.id,
          time: ev.createdAt,
          targetText,
          targetTag,
          targetId: data.targetId,
          targetHref: data.targetHref,
          section,
          path,
          coords: data.coords,
        };

        visitor.clicks.push(clickObj);

        // Click target ranking
        const targetKey = `${targetText}::${section}`;
        const targetEntry = clickTargetMap.get(targetKey) || {
          targetText,
          section,
          targetTag,
          clicksCount: 0,
          uniqueVisitors: new Set<string>(),
          lastClickedAt: ev.createdAt,
        };
        targetEntry.clicksCount++;
        targetEntry.uniqueVisitors.add(vid);
        if (ev.createdAt > targetEntry.lastClickedAt) {
          targetEntry.lastClickedAt = ev.createdAt;
        }
        clickTargetMap.set(targetKey, targetEntry);

        // Feed of recent clicks
        if (recentClicks.length < 150) {
          recentClicks.push({
            id: ev.id,
            createdAt: ev.createdAt,
            visitorId: vid,
            targetText,
            targetTag,
            section,
            path,
            city,
            country,
            countryCode,
            flag,
            ip,
            deviceType: dtKey,
            os,
            browser: bName,
          });
        }
      }
    }

    // Convert aggregated visitors to array and apply search filter
    let visitorsList = Array.from(visitorMap.values());

    if (search) {
      visitorsList = visitorsList.filter((v) =>
        v.visitorId.toLowerCase().includes(search) ||
        v.ip.toLowerCase().includes(search) ||
        v.city.toLowerCase().includes(search) ||
        v.country.toLowerCase().includes(search) ||
        v.os.toLowerCase().includes(search) ||
        v.browser.toLowerCase().includes(search) ||
        (v.utmCampaign && v.utmCampaign.toLowerCase().includes(search)) ||
        v.clicks.some((c) => c.targetText.toLowerCase().includes(search) || c.section.toLowerCase().includes(search))
      );
    }

    // Sort visitors by most recent activity
    visitorsList.sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());

    // Sort top clicked targets
    const topClicks = Array.from(clickTargetMap.values())
      .map((t) => ({
        targetText: t.targetText,
        section: t.section,
        targetTag: t.targetTag,
        clicksCount: t.clicksCount,
        uniqueVisitorsCount: t.uniqueVisitors.size,
        lastClickedAt: t.lastClickedAt,
      }))
      .sort((a, b) => b.clicksCount - a.clicksCount)
      .slice(0, 30);

    // Format top countries
    const totalEventsCount = Math.max(1, events.length);
    const countries = Array.from(countryCountMap.values())
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        ...c,
        percentage: Math.round((c.count / totalEventsCount) * 100),
      }));

    // Format top cities
    const cities = Array.from(cityCountMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Format device stats
    const deviceTypes = Array.from(deviceTypeMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percent: Math.round((count / totalEventsCount) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const osStats = Array.from(osMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percent: Math.round((count / totalEventsCount) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const browserStats = Array.from(browserMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percent: Math.round((count / totalEventsCount) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Calculate today's stats
    const todayUniqueVisitors = new Set(
      todayEvents.map((e) => e.anonymousId || (e.eventData as any)?.visitorId).filter(Boolean)
    ).size;
    const todayClicks = todayEvents.filter((e) => e.eventType === 'click').length;

    const topCountry = countries[0] || { country: 'Saudi Arabia', countryCode: 'SA', flag: '🇸🇦', count: 0, percentage: 100 };
    const topCity = cities[0] || { city: 'Riyadh', country: 'Saudi Arabia', count: 0 };

    return success({
      range,
      summary: {
        totalVisitors: visitorMap.size,
        totalSessions: new Set(Array.from(visitorMap.values()).map((v) => v.sessionId).filter(Boolean)).size,
        totalPageViews,
        totalClicks,
        todayVisitors: todayUniqueVisitors,
        todayClicks,
        topCountry,
        topCity,
        mobilePercentage: totalEventsCount > 0 ? Math.round((mobileCount / totalEventsCount) * 100) : 0,
        inAppPercentage: totalEventsCount > 0 ? Math.round((inAppCount / totalEventsCount) * 100) : 0,
      },
      visitors: visitorsList.slice(0, 100),
      recentClicks,
      topClicks,
      geoStats: {
        countries,
        cities,
      },
      deviceStats: {
        deviceTypes,
        osStats,
        browserStats,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
