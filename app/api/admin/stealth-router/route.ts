import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';
import {
  cleanPhoneDigits,
  getStealthConfig,
  saveStealthConfig,
  type AgentQualityTier,
  type FunnelMode,
  type StealthAgent,
} from '@/lib/stealth-router';

export const dynamic = 'force-dynamic';

interface LedgerRow {
  id: string;
  leadCode: string;
  customerName: string;
  customerPhone: string;
  agentId: string;
  agentName: string;
  agentPhone: string;
  campaign: string;
  qualityTier: string;
  qualityScore: number;
  residencyTier: string;
  occupationTier: string;
  mode: string;
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  deviceSummary: string;
  os: string;
  browser: string;
  referrerStripped: boolean;
  createdAt: string;
}

function getRangeStart(range: string | null): Date | undefined {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }
  if (range === '24h') {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  if (range === '30d') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  if (range === 'all') {
    return undefined;
  }
  // Default: 7d
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function extractDeviceSummary(rawDevice: unknown): {
  summary: string;
  os: string;
  browser: string;
} {
  if (!rawDevice || typeof rawDevice !== 'object') {
    return { summary: 'Unknown Device', os: '', browser: '' };
  }
  const d = rawDevice as Record<string, unknown>;
  const deviceType = typeof d.deviceType === 'string' ? d.deviceType : '';
  const os = typeof d.os === 'string' ? d.os : '';
  const browser = typeof d.browser === 'string' ? d.browser : '';
  const model = typeof d.deviceModel === 'string' ? d.deviceModel : '';
  const parts = [model || deviceType, os, browser].filter(Boolean);
  return {
    summary: parts.length > 0 ? parts.join(' • ') : 'Unknown Device',
    os,
    browser,
  };
}

/**
 * Admin endpoint returning stealth router configuration, agent ledger attribution stats,
 * and searchable #CH-XXXX anti-cheat audit logs.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const sp = req.nextUrl.searchParams;
    const range = sp.get('range') || '7d';
    const filterAgentId = (sp.get('agentId') || '').trim();
    const filterQuality = (sp.get('quality') || '').trim().toLowerCase();
    const search = (sp.get('search') || '').trim().toLowerCase();

    const since = getRangeStart(range);
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [config, events, todayEvents] = await Promise.all([
      getStealthConfig(),
      prisma.analyticsEvent.findMany({
        where: {
          eventType: 'wa_redirect',
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
      prisma.analyticsEvent.findMany({
        where: {
          eventType: 'wa_redirect',
          createdAt: { gte: startOfToday },
        },
        select: { eventData: true, createdAt: true },
        take: 2000,
      }),
    ]);

    const agentResetMap = new Map<string, number>();
    for (const ag of config.agents) {
      if (ag.quotaResetAt) {
        const ms = new Date(ag.quotaResetAt).getTime();
        if (!Number.isNaN(ms)) {
          agentResetMap.set(ag.id, ms);
        }
      }
    }

    const todayByAgent = new Map<string, number>();
    for (const ev of todayEvents) {
      const data = ev.eventData as Record<string, unknown> | null;
      const aId = typeof data?.agentId === 'string' ? data.agentId : '';
      if (!aId) continue;
      const resetMs = agentResetMap.get(aId);
      if (resetMs && ev.createdAt.getTime() < resetMs) {
        continue;
      }
      todayByAgent.set(aId, (todayByAgent.get(aId) || 0) + 1);
    }

    const agentAggMap = new Map<
      string,
      {
        totalLeads: number;
        vipLeads: number;
        capturedPhones: number;
        lastLeadAt: string | null;
        nameFallback: string;
        phoneFallback: string;
      }
    >();

    let vipLeads = 0;
    let standardLeads = 0;
    let lowLeads = 0;
    let capturedPhones = 0;

    const allLedgerRows: LedgerRow[] = [];

    for (const ev of events) {
      const data = (ev.eventData && typeof ev.eventData === 'object'
        ? ev.eventData
        : {}) as Record<string, unknown>;

      const agentId = typeof data.agentId === 'string' ? data.agentId : 'unknown';
      const agentName = typeof data.agentName === 'string' ? data.agentName : 'Unassigned';
      const agentPhone = typeof data.agentPhone === 'string' ? data.agentPhone : '';
      const qualityTier =
        typeof data.qualityTier === 'string' ? data.qualityTier.toLowerCase() : 'standard';
      const customerPhone =
        typeof data.customerPhone === 'string' ? data.customerPhone : '';
      const createdAtIso = ev.createdAt.toISOString();

      if (qualityTier === 'vip') vipLeads += 1;
      else if (qualityTier === 'low') lowLeads += 1;
      else standardLeads += 1;

      if (customerPhone) capturedPhones += 1;

      const existingAgg = agentAggMap.get(agentId) || {
        totalLeads: 0,
        vipLeads: 0,
        capturedPhones: 0,
        lastLeadAt: null,
        nameFallback: agentName,
        phoneFallback: agentPhone,
      };
      existingAgg.totalLeads += 1;
      if (qualityTier === 'vip') existingAgg.vipLeads += 1;
      if (customerPhone) existingAgg.capturedPhones += 1;
      if (!existingAgg.lastLeadAt) existingAgg.lastLeadAt = createdAtIso;
      agentAggMap.set(agentId, existingAgg);

      const dev = extractDeviceSummary(data.device);

      allLedgerRows.push({
        id: ev.id,
        leadCode: typeof data.leadCode === 'string' ? data.leadCode : ev.id.slice(0, 8),
        customerName: typeof data.customerName === 'string' ? data.customerName : 'Guest',
        customerPhone,
        agentId,
        agentName,
        agentPhone,
        campaign:
          typeof data.campaign === 'string'
            ? data.campaign
            : ev.utmCampaign || 'direct',
        qualityTier,
        qualityScore: typeof data.qualityScore === 'number' ? data.qualityScore : 50,
        residencyTier: typeof data.residencyTier === 'string' ? data.residencyTier : '',
        occupationTier: typeof data.occupationTier === 'string' ? data.occupationTier : '',
        mode: typeof data.mode === 'string' ? data.mode : 'interactive_qualifier',
        city: typeof data.city === 'string' ? data.city : 'Unknown',
        country: typeof data.country === 'string' ? data.country : 'Unknown',
        countryCode: typeof data.countryCode === 'string' ? data.countryCode : '',
        flag: typeof data.flag === 'string' ? data.flag : '',
        deviceSummary: dev.summary,
        os: dev.os,
        browser: dev.browser,
        referrerStripped: data.referrerStripped !== false,
        createdAt: createdAtIso,
      });
    }

    const totalRedirects = events.length;

    const totalActiveWeight = config.agents
      .filter((a) => a.status === 'active')
      .reduce((sum, a) => sum + Math.max(1, a.weight), 0);

    const agentStats = config.agents.map((agent) => {
      const agg = agentAggMap.get(agent.id);
      const totalLeads = agg?.totalLeads || 0;
      const todayLeads = todayByAgent.get(agent.id) || 0;
      const configuredPercent =
        agent.status === 'active' && totalActiveWeight > 0
          ? Math.round((Math.max(1, agent.weight) / totalActiveWeight) * 100)
          : 0;
      const isTargetReached = Boolean(
        agent.status === 'active' &&
          agent.limitEnabled &&
          agent.maxDailyLeads !== null &&
          agent.maxDailyLeads > 0 &&
          todayLeads >= agent.maxDailyLeads
      );
      return {
        ...agent,
        totalLeads,
        todayLeads,
        vipLeads: agg?.vipLeads || 0,
        capturedPhones: agg?.capturedPhones || 0,
        lastLeadAt: agg?.lastLeadAt || null,
        sharePercent:
          totalRedirects > 0 ? Math.round((totalLeads / totalRedirects) * 100) : 0,
        configuredPercent,
        isTargetReached,
      };
    });

    // Apply filters on the returned ledger list
    const filteredLedger = allLedgerRows.filter((row) => {
      if (filterAgentId && row.agentId !== filterAgentId) {
        return false;
      }
      if (filterQuality && filterQuality !== 'all' && row.qualityTier !== filterQuality) {
        return false;
      }
      if (search) {
        const haystack = [
          row.leadCode,
          `#${row.leadCode}`,
          row.customerName,
          row.customerPhone,
          row.agentName,
          row.agentPhone,
          row.campaign,
          row.city,
          row.country,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      return true;
    });

    return success({
      config,
      summary: {
        totalRedirects,
        todayRedirects: todayEvents.length,
        vipLeads,
        standardLeads,
        lowLeads,
        capturedPhones,
        phoneCaptureRate:
          totalRedirects > 0 ? Math.round((capturedPhones / totalRedirects) * 100) : 0,
        activeAgentsCount: config.agents.filter((a) => a.status === 'active').length,
        totalAgentsCount: config.agents.length,
      },
      agentStats,
      ledger: filteredLedger.slice(0, 300),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Admin mutations for managing agent numbers, routing rules, and auto-reply settings.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const rawBody = await req.text();
    const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    const action = typeof body.action === 'string' ? body.action : '';

    const config = await getStealthConfig();

    if (action === 'save_agent') {
      const rawAgent = (body.agent && typeof body.agent === 'object'
        ? body.agent
        : body) as Record<string, unknown>;

      const name = typeof rawAgent.name === 'string' ? rawAgent.name.trim() : '';
      const phone = cleanPhoneDigits(
        typeof rawAgent.phone === 'string' ? rawAgent.phone : ''
      );

      if (!name) {
        return error('Agent display name is required.', 400);
      }
      if (phone.length < 6) {
        return error('Valid WhatsApp number (with country code, e.g. 447700...) is required.', 400);
      }

      const rawId = typeof rawAgent.id === 'string' ? rawAgent.id.trim() : '';
      const slugBase = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const existingIndex = rawId
        ? config.agents.findIndex((a) => a.id === rawId)
        : -1;

      // Prevent duplicate WhatsApp numbers so one WA number never receives double share accidentally
      const duplicateAgent = config.agents.find(
        (a, idx) => idx !== existingIndex && cleanPhoneDigits(a.phone) === phone
      );
      if (duplicateAgent) {
        return error(
          `This WhatsApp number (+${phone}) is already assigned to "${duplicateAgent.name}". Edit that row or use a different number.`,
          400
        );
      }

      const qualityTier: AgentQualityTier =
        rawAgent.qualityTier === 'vip_only' || rawAgent.qualityTier === 'standard_only'
          ? rawAgent.qualityTier
          : 'all';

      const maxDailyRaw = rawAgent.maxDailyLeads;
      const maxDailyLeads =
        maxDailyRaw !== null &&
        maxDailyRaw !== undefined &&
        maxDailyRaw !== '' &&
        Number(maxDailyRaw) > 0
          ? Math.floor(Number(maxDailyRaw))
          : null;

      const limitEnabled =
        typeof rawAgent.limitEnabled === 'boolean'
          ? rawAgent.limitEnabled
          : Boolean(maxDailyLeads && maxDailyLeads > 0);
      const countryFilter =
        typeof rawAgent.countryFilter === 'string' && rawAgent.countryFilter.trim()
          ? rawAgent.countryFilter.trim().toUpperCase().slice(0, 16)
          : 'ALL';
      const quotaResetAt =
        rawAgent.resetQuota === true
          ? new Date().toISOString()
          : existingIndex >= 0
            ? config.agents[existingIndex].quotaResetAt || null
            : null;

      const nextAgent: StealthAgent = {
        id:
          existingIndex >= 0
            ? config.agents[existingIndex].id
            : `${slugBase || 'agent'}-${Math.floor(100 + Math.random() * 900)}`,
        name,
        phone,
        roleLabel:
          typeof rawAgent.roleLabel === 'string' && rawAgent.roleLabel.trim()
            ? rawAgent.roleLabel.trim()
            : 'Concierge Agent',
        status: rawAgent.status === 'paused' ? 'paused' : 'active',
        weight: Math.max(1, Math.min(100, Math.round(Number(rawAgent.weight) || 50))),
        qualityTier,
        maxDailyLeads,
        limitEnabled,
        countryFilter,
        quotaResetAt,
        notes: typeof rawAgent.notes === 'string' ? rawAgent.notes.trim() : '',
        createdAt:
          existingIndex >= 0
            ? config.agents[existingIndex].createdAt
            : new Date().toISOString(),
      };

      const nextAgents = [...config.agents];
      if (existingIndex >= 0) {
        nextAgents[existingIndex] = nextAgent;
      } else {
        nextAgents.push(nextAgent);
      }

      const updated = await saveStealthConfig({ agents: nextAgents });
      return success({ config: updated, agent: nextAgent, message: 'Agent saved.' });
    }

    if (action === 'quick_update_agent') {
      const agentId = typeof body.agentId === 'string' ? body.agentId : '';
      const idx = config.agents.findIndex((a) => a.id === agentId);
      if (idx === -1) {
        return error('Agent not found.', 404);
      }

      const existing = config.agents[idx];
      const nextWeight =
        body.weight !== undefined
          ? Math.max(1, Math.min(100, Math.round(Number(body.weight) || 1)))
          : existing.weight;
      const nextMaxDaily =
        body.maxDailyLeads === null || body.maxDailyLeads === ''
          ? null
          : body.maxDailyLeads !== undefined
            ? Number(body.maxDailyLeads) > 0
              ? Math.floor(Number(body.maxDailyLeads))
              : null
            : existing.maxDailyLeads;
      const nextLimitEnabled =
        typeof body.limitEnabled === 'boolean'
          ? body.limitEnabled
          : body.maxDailyLeads !== undefined
            ? Boolean(nextMaxDaily && nextMaxDaily > 0)
            : existing.limitEnabled;
      const nextCountryFilter =
        typeof body.countryFilter === 'string' && body.countryFilter.trim()
          ? body.countryFilter.trim().toUpperCase().slice(0, 16)
          : existing.countryFilter;
      const nextStatus =
        body.status === 'active' || body.status === 'paused'
          ? body.status
          : existing.status;
      const nextQuotaResetAt =
        body.resetQuota === true ? new Date().toISOString() : existing.quotaResetAt;

      const nextAgents = config.agents.map((a, i) =>
        i === idx
          ? {
              ...a,
              weight: nextWeight,
              maxDailyLeads: nextMaxDaily,
              limitEnabled: nextLimitEnabled,
              countryFilter: nextCountryFilter,
              status: nextStatus,
              quotaResetAt: nextQuotaResetAt,
            }
          : a
      );

      const updated = await saveStealthConfig({ agents: nextAgents });
      return success({ config: updated, message: 'Agent settings updated.' });
    }

    if (action === 'equalize_weights') {
      const activeAgents = config.agents.filter((a) => a.status === 'active');
      const equalShare = Math.max(1, Math.round(100 / Math.max(1, activeAgents.length)));
      const nextAgents = config.agents.map((a) =>
        a.status === 'active' ? { ...a, weight: equalShare } : a
      );
      const updated = await saveStealthConfig({ agents: nextAgents });
      return success({ config: updated, message: 'Active agents balanced equally.' });
    }

    if (action === 'toggle_agent') {
      const agentId = typeof body.agentId === 'string' ? body.agentId : '';
      const idx = config.agents.findIndex((a) => a.id === agentId);
      if (idx === -1) {
        return error('Agent not found.', 404);
      }

      const nextAgents = config.agents.map((a, i) =>
        i === idx
          ? { ...a, status: a.status === 'active' ? ('paused' as const) : ('active' as const) }
          : a
      );
      const updated = await saveStealthConfig({ agents: nextAgents });
      return success({ config: updated, message: 'Agent status updated.' });
    }

    if (action === 'delete_agent') {
      const agentId = typeof body.agentId === 'string' ? body.agentId : '';
      const nextAgents = config.agents.filter((a) => a.id !== agentId);
      if (nextAgents.length === config.agents.length) {
        return error('Agent not found.', 404);
      }

      const nextRoutingMode =
        nextAgents.length === 0 || config.fixedAgentId === agentId ? 'auto' : config.routingMode;
      const nextFixedAgentId =
        nextRoutingMode === 'fixed' ? config.fixedAgentId : null;

      const updated = await saveStealthConfig({
        agents: nextAgents,
        routingMode: nextRoutingMode,
        fixedAgentId: nextFixedAgentId,
      });
      return success({ config: updated, message: 'Agent removed.' });
    }

    if (action === 'set_routing_mode') {
      const routingMode = body.routingMode === 'fixed' ? 'fixed' : 'auto';
      const fixedAgentId =
        typeof body.fixedAgentId === 'string' && body.fixedAgentId.trim()
          ? body.fixedAgentId.trim()
          : routingMode === 'fixed'
            ? config.agents.find((a) => a.status === 'active')?.id || config.agents[0]?.id || null
            : null;
      const updated = await saveStealthConfig({ routingMode, fixedAgentId });
      return success({ config: updated, message: 'Routing mode updated.' });
    }

    if (action === 'save_config') {
      const patch = (body.config && typeof body.config === 'object'
        ? body.config
        : body) as Record<string, unknown>;

      const defaultMode: FunnelMode =
        patch.defaultMode === 'vip_card' || patch.defaultMode === 'instant_redirect'
          ? patch.defaultMode
          : patch.defaultMode === 'interactive_qualifier'
            ? 'interactive_qualifier'
            : config.defaultMode;

      const autoReplyInput =
        patch.autoReply && typeof patch.autoReply === 'object'
          ? (patch.autoReply as Record<string, unknown>)
          : undefined;

      const updated = await saveStealthConfig({
        defaultMode,
        routingMode:
          patch.routingMode === 'fixed' || patch.routingMode === 'auto'
            ? patch.routingMode
            : config.routingMode,
        fixedAgentId:
          patch.fixedAgentId === null
            ? null
            : typeof patch.fixedAgentId === 'string' && patch.fixedAgentId.trim()
              ? patch.fixedAgentId.trim()
              : config.fixedAgentId,
        blockBangladesh:
          typeof patch.blockBangladesh === 'boolean'
            ? patch.blockBangladesh
            : config.blockBangladesh,
        requirePhoneCapture:
          typeof patch.requirePhoneCapture === 'boolean'
            ? patch.requirePhoneCapture
            : config.requirePhoneCapture,
        brandName:
          typeof patch.brandName === 'string' && patch.brandName.trim()
            ? patch.brandName.trim()
            : config.brandName,
        personaName:
          typeof patch.personaName === 'string' && patch.personaName.trim()
            ? patch.personaName.trim()
            : config.personaName,
        personaCity:
          typeof patch.personaCity === 'string' && patch.personaCity.trim()
            ? patch.personaCity.trim()
            : config.personaCity,
        personaBadge:
          typeof patch.personaBadge === 'string' && patch.personaBadge.trim()
            ? patch.personaBadge.trim()
            : config.personaBadge,
        greetingTemplate:
          typeof patch.greetingTemplate === 'string' && patch.greetingTemplate.trim()
            ? patch.greetingTemplate.trim()
            : config.greetingTemplate,
        whatsappMessageTemplate:
          typeof patch.whatsappMessageTemplate === 'string' &&
          patch.whatsappMessageTemplate.trim()
            ? patch.whatsappMessageTemplate.trim()
            : config.whatsappMessageTemplate,
        autoReply: autoReplyInput
          ? {
              enabled:
                typeof autoReplyInput.enabled === 'boolean'
                  ? autoReplyInput.enabled
                  : config.autoReply.enabled,
              step1Template:
                typeof autoReplyInput.step1Template === 'string' &&
                autoReplyInput.step1Template.trim()
                  ? autoReplyInput.step1Template.trim()
                  : config.autoReply.step1Template,
              step2Template:
                typeof autoReplyInput.step2Template === 'string' &&
                autoReplyInput.step2Template.trim()
                  ? autoReplyInput.step2Template.trim()
                  : config.autoReply.step2Template,
              step3Template:
                typeof autoReplyInput.step3Template === 'string' &&
                autoReplyInput.step3Template.trim()
                  ? autoReplyInput.step3Template.trim()
                  : config.autoReply.step3Template,
              includeStealthWaHandoff:
                typeof autoReplyInput.includeStealthWaHandoff === 'boolean'
                  ? autoReplyInput.includeStealthWaHandoff
                  : config.autoReply.includeStealthWaHandoff,
            }
          : config.autoReply,
      });

      return success({ config: updated, message: 'Router configuration updated.' });
    }

    return error(`Unsupported action: ${action}`, 400);
  } catch (err) {
    return handleApiError(err);
  }
}
