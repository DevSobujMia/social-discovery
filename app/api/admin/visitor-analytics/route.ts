import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { error, success, handleApiError } from '@/lib/api-helpers';
import { getCountryFlag } from '@/lib/geo';
import {
  getStealthConfig,
  resolveAgentByTag,
  saveStealthConfig,
  type ActorRole,
  type KnownActorRule,
  type StealthConfig,
} from '@/lib/stealth-router';

interface VisitorSecurityAlert {
  id: string;
  time: Date;
  action: string;
  detail: string | null;
  path: string;
}

interface SecurityAlertFeedItem {
  id: string;
  createdAt: Date;
  visitorId: string;
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  flag: string;
  deviceType: string;
  os: string;
  browser: string;
  action: string;
  detail: string | null;
  path: string;
  actorRole?: ActorRole;
  actorLabel?: string;
  linkedAgentName?: string | null;
  spyScore?: number;
}

function classifyVisitor(
  visitor: {
    visitorId: string;
    ip: string;
    deviceType: string;
    utmCampaign: string | null;
    visitedPaths: string[];
    hasAdContext: boolean;
    probedAdmin: boolean;
    actorHint: string | null;
    agentTagHint: string | null;
    securityAlerts: VisitorSecurityAlert[];
  },
  stealthConfig: StealthConfig,
  ruleByVisitorId: Map<string, KnownActorRule>,
  ruleByIp: Map<string, KnownActorRule>
): {
  actorRole: ActorRole;
  actorLabel: string;
  linkedAgentName: string | null;
  spyScore: number;
  spyReasons: string[];
  isExplicitlyTagged: boolean;
} {
  const vidRule = ruleByVisitorId.get(visitor.visitorId);
  const ipRule =
    visitor.ip && visitor.ip !== 'unknown' && !visitor.ip.startsWith('127.')
      ? ruleByIp.get(visitor.ip)
      : undefined;
  const explicitRule = vidRule || ipRule || null;

  const resolvedTagAgent = visitor.agentTagHint
    ? resolveAgentByTag(stealthConfig.agents, visitor.agentTagHint, { includePaused: true })
    : null;
  const linkedAgentName =
    explicitRule?.agentName ||
    resolvedTagAgent?.name ||
    (visitor.agentTagHint ? visitor.agentTagHint : null);

  let spyScore = 0;
  const spyReasons: string[] = [];

  const adminProbes = visitor.securityAlerts.filter((a) => a.action === 'admin_probe').length;
  const devtoolsHits = visitor.securityAlerts.filter((a) => a.action === 'devtools_shortcut').length;
  const rightClickHits = visitor.securityAlerts.filter((a) => a.action === 'right_click').length;
  const copyHits = visitor.securityAlerts.filter((a) => a.action === 'text_copy').length;

  if (adminProbes > 0 || visitor.probedAdmin) {
    spyScore += 55;
    spyReasons.push('Opened /admin without login');
  }
  if (devtoolsHits > 0) {
    spyScore += Math.min(70, devtoolsHits * 35);
    spyReasons.push(`DevTools / View Source shortcut (${devtoolsHits}x)`);
  }
  if (rightClickHits > 0) {
    spyScore += Math.min(40, 20 + (rightClickHits - 1) * 10);
    spyReasons.push(`Right-click inspect attempt (${rightClickHits}x)`);
  }
  if (copyHits > 0) {
    spyScore += Math.min(45, 25 + (copyHits - 1) * 15);
    spyReasons.push(`Tried copying site text (${copyHits}x)`);
  }
  if (
    visitor.deviceType === 'desktop' &&
    !visitor.hasAdContext &&
    !visitor.utmCampaign &&
    visitor.visitedPaths.length >= 3
  ) {
    spyScore += 20;
    spyReasons.push('Desktop multi-page snooping (no ad UTM)');
  }

  let actorRole: ActorRole = 'customer';
  let actorLabel = 'Customer';

  if (explicitRule?.role === 'admin') {
    actorRole = 'admin';
    actorLabel = explicitRule.label || 'Admin';
  } else if (explicitRule?.role === 'customer') {
    actorRole = 'customer';
    actorLabel = explicitRule.label || 'Customer (Verified)';
  } else if (explicitRule?.role === 'spy') {
    actorRole = 'spy';
    actorLabel = explicitRule.label || 'Flagged Spy';
  } else if (visitor.actorHint === 'admin') {
    actorRole = 'admin';
    actorLabel = 'Admin Browser';
  } else if (spyScore >= 40) {
    actorRole = 'spy';
    actorLabel = linkedAgentName ? `Spy (${linkedAgentName})` : 'Suspected Spy';
  } else if (explicitRule?.role === 'agent' || visitor.actorHint === 'agent' || linkedAgentName) {
    actorRole = 'agent';
    actorLabel =
      explicitRule?.label || (linkedAgentName ? `Agent: ${linkedAgentName}` : 'Internal Agent');
  } else if (spyScore >= 20) {
    actorLabel = 'Customer (Watch)';
  }

  return {
    actorRole,
    actorLabel,
    linkedAgentName,
    spyScore: Math.min(100, spyScore),
    spyReasons,
    isExplicitlyTagged: Boolean(explicitRule),
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7d';
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const roleFilter = (searchParams.get('role') || 'all').trim().toLowerCase();

    const stealthConfig = await getStealthConfig();
    const ruleByVisitorId = new Map<string, KnownActorRule>();
    const ruleByIp = new Map<string, KnownActorRule>();
    for (const rule of stealthConfig.knownActors) {
      if (rule.matchType === 'visitorId') {
        ruleByVisitorId.set(rule.value, rule);
      } else if (rule.matchType === 'ip') {
        ruleByIp.set(rule.value, rule);
      }
    }

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
        eventType: { in: ['page_view', 'click', 'ad_landing_view', 'profile_view', 'security_alert'] },
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
      visitedPaths: string[];
      hasAdContext: boolean;
      probedAdmin: boolean;
      actorHint: string | null;
      agentTagHint: string | null;
      securityAlertsCount: number;
      securityAlerts: VisitorSecurityAlert[];
      actorRole: ActorRole;
      actorLabel: string;
      linkedAgentName: string | null;
      spyScore: number;
      spyReasons: string[];
      isExplicitlyTagged: boolean;
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
    const securityAlertsFeed: SecurityAlertFeedItem[] = [];

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
          visitedPaths: [],
          hasAdContext: false,
          probedAdmin: false,
          actorHint: null,
          agentTagHint: null,
          securityAlertsCount: 0,
          securityAlerts: [],
          actorRole: 'customer',
          actorLabel: 'Customer',
          linkedAgentName: null,
          spyScore: 0,
          spyReasons: [],
          isExplicitlyTagged: false,
        };
        visitorMap.set(vid, visitor);
      }

      const rawPath =
        typeof data.path === 'string' && data.path.trim()
          ? data.path.trim()
          : typeof data.url === 'string' && data.url.startsWith('http')
            ? (() => {
                try {
                  return new URL(data.url).pathname || '/';
                } catch {
                  return '';
                }
              })()
            : '';
      if (rawPath && !visitor.visitedPaths.includes(rawPath) && visitor.visitedPaths.length < 25) {
        visitor.visitedPaths.push(rawPath);
      }
      if (data.hasAdContext) {
        visitor.hasAdContext = true;
      }
      if (data.probedAdmin) {
        visitor.probedAdmin = true;
      }
      if (data.actorHint === 'admin') {
        visitor.actorHint = 'admin';
      } else if (!visitor.actorHint && data.actorHint) {
        visitor.actorHint = String(data.actorHint);
      }
      if (!visitor.agentTagHint && (data.agentTagHint || data.agentSlug || data.agentName)) {
        visitor.agentTagHint = String(data.agentTagHint || data.agentSlug || data.agentName);
      }

      if (ev.eventType === 'security_alert') {
        const action = String(data.action || 'suspicious_action');
        const detail = data.detail
          ? String(data.detail)
          : data.agentName
            ? String(data.agentName)
            : data.agentSlug
              ? String(data.agentSlug)
              : null;
        const alertPath = rawPath || '/';

        if (action !== 'agent_device_registered') {
          visitor.securityAlertsCount++;
        }
        if (visitor.securityAlerts.length < 30) {
          visitor.securityAlerts.push({
            id: ev.id,
            time: ev.createdAt,
            action,
            detail,
            path: alertPath,
          });
        }
        if (securityAlertsFeed.length < 100) {
          securityAlertsFeed.push({
            id: ev.id,
            createdAt: ev.createdAt,
            visitorId: vid,
            ip,
            country,
            countryCode,
            city,
            flag,
            deviceType: dtKey,
            os,
            browser: bName,
            action,
            detail,
            path: alertPath,
          });
        }
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

    // Classify visitors (Customer vs Agent vs Spy vs Admin)
    for (const v of visitorMap.values()) {
      const classification = classifyVisitor(v, stealthConfig, ruleByVisitorId, ruleByIp);
      v.actorRole = classification.actorRole;
      v.actorLabel = classification.actorLabel;
      v.linkedAgentName = classification.linkedAgentName;
      v.spyScore = classification.spyScore;
      v.spyReasons = classification.spyReasons;
      v.isExplicitlyTagged = classification.isExplicitlyTagged;
    }

    for (const alertItem of securityAlertsFeed) {
      const v = visitorMap.get(alertItem.visitorId);
      if (v) {
        alertItem.actorRole = v.actorRole;
        alertItem.actorLabel = v.actorLabel;
        alertItem.linkedAgentName = v.linkedAgentName;
        alertItem.spyScore = v.spyScore;
      }
    }

    // Convert aggregated visitors to array and apply search + role filters
    let visitorsList = Array.from(visitorMap.values());

    if (search) {
      visitorsList = visitorsList.filter((v) =>
        v.visitorId.toLowerCase().includes(search) ||
        v.ip.toLowerCase().includes(search) ||
        v.city.toLowerCase().includes(search) ||
        v.country.toLowerCase().includes(search) ||
        v.os.toLowerCase().includes(search) ||
        v.browser.toLowerCase().includes(search) ||
        v.actorLabel.toLowerCase().includes(search) ||
        (v.linkedAgentName && v.linkedAgentName.toLowerCase().includes(search)) ||
        (v.utmCampaign && v.utmCampaign.toLowerCase().includes(search)) ||
        v.clicks.some((c) => c.targetText.toLowerCase().includes(search) || c.section.toLowerCase().includes(search))
      );
    }

    const roleCounts = {
      all: visitorsList.length,
      customer: visitorsList.filter((v) => v.actorRole === 'customer').length,
      agent: visitorsList.filter((v) => v.actorRole === 'agent').length,
      spy: visitorsList.filter((v) => v.actorRole === 'spy').length,
      admin: visitorsList.filter((v) => v.actorRole === 'admin').length,
    };

    if (roleFilter && roleFilter !== 'all') {
      visitorsList = visitorsList.filter((v) => v.actorRole === roleFilter);
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
        securityAlertsCount: securityAlertsFeed.filter((a) => a.action !== 'agent_device_registered').length,
        suspectedSpiesCount: roleCounts.spy,
        agentsSeenCount: roleCounts.agent,
      },
      roleCounts,
      visitors: visitorsList.slice(0, 100),
      recentClicks,
      topClicks,
      securityAlerts: securityAlertsFeed,
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

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return error('Invalid request payload', 400);
    }

    const action = String(body.action || '');
    const visitorId = typeof body.visitorId === 'string' ? body.visitorId.trim() : '';
    const ip = typeof body.ip === 'string' ? body.ip.trim() : '';
    const cfg = await getStealthConfig();
    let nextRules: KnownActorRule[] = [...cfg.knownActors];

    if (action === 'tag_actor') {
      const role = body.role as ActorRole;
      if (!['customer', 'agent', 'spy', 'admin'].includes(role)) {
        return error('Invalid actor role', 400);
      }
      if (!visitorId && (!ip || ip === 'unknown')) {
        return error('visitorId or valid ip is required', 400);
      }

      const labelInput = typeof body.label === 'string' ? body.label.trim() : '';
      const defaultLabels: Record<ActorRole, string> = {
        customer: 'Customer (Verified)',
        agent: 'Internal Agent',
        spy: 'Flagged Spy',
        admin: 'Admin',
      };
      const label = labelInput || defaultLabels[role];
      const nowIso = new Date().toISOString();

      const upsert = (matchType: 'visitorId' | 'ip', value: string) => {
        const cleanVal = value.trim();
        if (!cleanVal) return;
        const rule: KnownActorRule = {
          id: `${matchType}:${cleanVal}`,
          matchType,
          value: cleanVal,
          role,
          label,
          agentName: typeof body.agentName === 'string' && body.agentName.trim() ? body.agentName.trim() : undefined,
          createdAt: nowIso,
        };
        const idx = nextRules.findIndex((r) => r.matchType === matchType && r.value === cleanVal);
        if (idx >= 0) {
          nextRules[idx] = rule;
        } else {
          nextRules.push(rule);
        }
      };

      if (visitorId) upsert('visitorId', visitorId);
      if (
        !body.skipIp &&
        ip &&
        ip !== 'unknown' &&
        !['127.0.0.1', '::1', 'localhost'].includes(ip)
      ) {
        upsert('ip', ip);
      }

      const saved = await saveStealthConfig({ knownActors: nextRules });
      return success({ knownActors: saved.knownActors });
    }

    if (action === 'remove_actor_tag') {
      nextRules = nextRules.filter((r) => {
        if (visitorId && r.matchType === 'visitorId' && r.value === visitorId) return false;
        if (ip && r.matchType === 'ip' && r.value === ip) return false;
        return true;
      });
      const saved = await saveStealthConfig({ knownActors: nextRules });
      return success({ knownActors: saved.knownActors });
    }

    return error('Unsupported action', 400);
  } catch (err) {
    return handleApiError(err);
  }
}
