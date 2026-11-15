import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type FunnelMode = 'interactive_qualifier' | 'vip_card' | 'instant_redirect';
export type AgentQualityTier = 'all' | 'vip_only' | 'standard_only';
export type AgentStatus = 'active' | 'paused';
export type LeadQualityTier = 'vip' | 'standard' | 'low';

export type ActorRole = 'customer' | 'agent' | 'spy' | 'admin';

export interface KnownActorRule {
  id: string;
  matchType: 'ip' | 'visitorId';
  value: string;
  role: ActorRole;
  label: string;
  agentId?: string;
  agentName?: string;
  createdAt: string;
}

export interface StealthAgent {
  id: string;
  name: string;
  phone: string;
  roleLabel: string;
  status: AgentStatus;
  weight: number;
  qualityTier: AgentQualityTier;
  maxDailyLeads: number | null;
  notes: string;
  createdAt: string;
}

export interface AutoReplyConfig {
  enabled: boolean;
  step1Template: string;
  step2Template: string;
  step3Template: string;
  includeStealthWaHandoff: boolean;
}

export interface StealthConfig {
  defaultMode: FunnelMode;
  requirePhoneCapture: boolean;
  routingMode: 'auto' | 'fixed';
  fixedAgentId: string | null;
  blockBangladesh: boolean;
  maintenanceEnabled: boolean;
  maintenanceTitle: string;
  maintenanceMessage: string;
  brandName: string;
  personaName: string;
  personaCity: string;
  personaBadge: string;
  greetingTemplate: string;
  whatsappMessageTemplate: string;
  agents: StealthAgent[];
  knownActors: KnownActorRule[];
  autoReply: AutoReplyConfig;
  updatedAt: string;
}

const CONFIG_EVENT_TYPE = 'stealth_system_config';
const DEFAULT_FALLBACK_PHONE = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '15187099695'
).replace(/\D/g, '');

export const DEFAULT_STEALTH_CONFIG: StealthConfig = {
  defaultMode: 'instant_redirect',
  requirePhoneCapture: false,
  brandName: 'CityHost Concierge',
  personaName: 'Nadia',
  personaCity: 'your city',
  personaBadge: 'Verified Private Host',
  greetingTemplate:
    'Welcome to {brand}. Please confirm two quick details so our concierge in {city} can connect you privately.',
  whatsappMessageTemplate:
    'Hi, I am connecting from CityHost — Verified Pass #{code}',
  agents: [
    {
      id: 'primary-desk',
      name: 'Primary Concierge Desk',
      phone: DEFAULT_FALLBACK_PHONE || '15187099695',
      roleLabel: 'Senior VIP Host Manager',
      status: 'active',
      weight: 3,
      qualityTier: 'all',
      maxDailyLeads: null,
      notes: 'Default primary desk seeded from environment configuration.',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  autoReply: {
    enabled: true,
    step1Template:
      'Hi {name}, thanks for messaging on CityHost! Where are you currently located, and when are you looking to connect?',
    step2Template:
      'Got it — our private concierge desk reviews all requests to keep the community respectful and verified. What best describes your work or profession?',
    step3Template:
      'Thank you! You are now pre-verified (#{code}). Tap our private CityHost concierge desk link below to continue on WhatsApp directly with priority access.',
    includeStealthWaHandoff: true,
  },
  routingMode: 'auto',
  fixedAgentId: null,
  blockBangladesh: false,
  maintenanceEnabled: false,
  maintenanceTitle: 'City Host travel site is under maintenance.',
  maintenanceMessage: 'It will be solved as soon as possible, our IT team is working on it.',
  knownActors: [],
  updatedAt: new Date(0).toISOString(),
};

/**
 * Strip all non-digit characters from a phone string.
 */
export function cleanPhoneDigits(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '');
}

/**
 * Normalize a user-supplied phone number with a country dial code into digits-only E.164 format.
 */
export function normalizeCustomerPhone(
  dialCode: string | null | undefined,
  rawPhone: string | null | undefined
): string {
  const localDigits = cleanPhoneDigits(rawPhone);
  if (!localDigits) return '';

  const cleanDial = cleanPhoneDigits(dialCode);
  if (!cleanDial) {
    return localDigits;
  }

  // If the user already pasted the full international code (e.g. 9665..., 88017...), keep it.
  if (localDigits.startsWith(cleanDial) && localDigits.length >= cleanDial.length + 7) {
    return localDigits;
  }

  // Strip a single trunk leading zero when combining with a country dial code (05... -> 5..., 017... -> 17...).
  const trimmedLocal = localDigits.replace(/^0+/, '');
  return `${cleanDial}${trimmedLocal}`;
}

/**
 * Generate a unique short verification code (e.g. "CH-4829") for anti-cheat audit logs.
 */
export function generateLeadCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `CH-${num}${suffix}`;
}

function sanitizeAgent(raw: Partial<StealthAgent>, fallbackIndex = 0): StealthAgent {
  const phone = cleanPhoneDigits(raw.phone);
  return {
    id:
      (raw.id && raw.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')) ||
      `agent-${Date.now()}-${fallbackIndex}`,
    name: (raw.name || `Agent ${fallbackIndex + 1}`).trim(),
    phone: phone || DEFAULT_FALLBACK_PHONE || '15187099695',
    roleLabel: (raw.roleLabel || 'Concierge Agent').trim(),
    status: raw.status === 'paused' ? 'paused' : 'active',
    weight: Math.max(1, Math.min(20, Number(raw.weight) || 1)),
    qualityTier:
      raw.qualityTier === 'vip_only' || raw.qualityTier === 'standard_only'
        ? raw.qualityTier
        : 'all',
    maxDailyLeads:
      raw.maxDailyLeads !== null &&
      raw.maxDailyLeads !== undefined &&
      Number(raw.maxDailyLeads) > 0
        ? Math.floor(Number(raw.maxDailyLeads))
        : null,
    notes: (raw.notes || '').trim(),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function normalizeKnownActors(raw: unknown): KnownActorRule[] {
  if (!Array.isArray(raw)) return [];
  const validRoles: ActorRole[] = ['customer', 'agent', 'spy', 'admin'];
  const dedup = new Map<string, KnownActorRule>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Partial<KnownActorRule>;
    const matchType = rec.matchType === 'ip' || rec.matchType === 'visitorId' ? rec.matchType : null;
    const value = typeof rec.value === 'string' ? rec.value.trim() : '';
    const role = rec.role && validRoles.includes(rec.role) ? rec.role : null;
    if (!matchType || !value || !role) continue;

    const key = `${matchType}:${value}`;
    dedup.set(key, {
      id: typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : key,
      matchType,
      value,
      role,
      label: typeof rec.label === 'string' ? rec.label.trim() : '',
      agentId: typeof rec.agentId === 'string' && rec.agentId.trim() ? rec.agentId.trim() : undefined,
      agentName:
        typeof rec.agentName === 'string' && rec.agentName.trim() ? rec.agentName.trim() : undefined,
      createdAt:
        typeof rec.createdAt === 'string' && rec.createdAt ? rec.createdAt : new Date().toISOString(),
    });
  }

  return Array.from(dedup.values());
}

function mergeConfig(raw: unknown): StealthConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_STEALTH_CONFIG,
      agents: DEFAULT_STEALTH_CONFIG.agents.map((a) => ({ ...a })),
      knownActors: [],
      autoReply: { ...DEFAULT_STEALTH_CONFIG.autoReply },
    };
  }

  const obj = raw as Partial<StealthConfig>;
  const agents =
    Array.isArray(obj.agents) && obj.agents.length > 0
      ? obj.agents.map((agent, idx) => sanitizeAgent(agent, idx))
      : DEFAULT_STEALTH_CONFIG.agents.map((a) => ({ ...a }));

  const defaultMode: FunnelMode =
    obj.defaultMode === 'interactive_qualifier' ||
    obj.defaultMode === 'vip_card' ||
    obj.defaultMode === 'instant_redirect'
      ? obj.defaultMode
      : DEFAULT_STEALTH_CONFIG.defaultMode;

  return {
    defaultMode,
    requirePhoneCapture:
      typeof obj.requirePhoneCapture === 'boolean'
        ? obj.requirePhoneCapture
        : DEFAULT_STEALTH_CONFIG.requirePhoneCapture,
    brandName: (obj.brandName || DEFAULT_STEALTH_CONFIG.brandName).trim(),
    personaName: (obj.personaName || DEFAULT_STEALTH_CONFIG.personaName).trim(),
    personaCity: (obj.personaCity || DEFAULT_STEALTH_CONFIG.personaCity).trim(),
    personaBadge: (obj.personaBadge || DEFAULT_STEALTH_CONFIG.personaBadge).trim(),
    greetingTemplate:
      (obj.greetingTemplate || DEFAULT_STEALTH_CONFIG.greetingTemplate).trim(),
    whatsappMessageTemplate:
      (obj.whatsappMessageTemplate || DEFAULT_STEALTH_CONFIG.whatsappMessageTemplate).trim(),
    agents,
    autoReply: {
      enabled:
        typeof obj.autoReply?.enabled === 'boolean'
          ? obj.autoReply.enabled
          : DEFAULT_STEALTH_CONFIG.autoReply.enabled,
      step1Template:
        (obj.autoReply?.step1Template || DEFAULT_STEALTH_CONFIG.autoReply.step1Template).trim(),
      step2Template:
        (obj.autoReply?.step2Template || DEFAULT_STEALTH_CONFIG.autoReply.step2Template).trim(),
      step3Template:
        (obj.autoReply?.step3Template || DEFAULT_STEALTH_CONFIG.autoReply.step3Template).trim(),
      includeStealthWaHandoff:
        typeof obj.autoReply?.includeStealthWaHandoff === 'boolean'
          ? obj.autoReply.includeStealthWaHandoff
          : DEFAULT_STEALTH_CONFIG.autoReply.includeStealthWaHandoff,
    },
    routingMode: obj.routingMode === 'fixed' ? 'fixed' : 'auto',
    fixedAgentId:
      typeof obj.fixedAgentId === 'string' && obj.fixedAgentId.trim()
        ? obj.fixedAgentId.trim()
        : null,
    blockBangladesh:
      typeof obj.blockBangladesh === 'boolean'
        ? obj.blockBangladesh
        : DEFAULT_STEALTH_CONFIG.blockBangladesh,
    maintenanceEnabled:
      typeof obj.maintenanceEnabled === 'boolean'
        ? obj.maintenanceEnabled
        : DEFAULT_STEALTH_CONFIG.maintenanceEnabled,
    maintenanceTitle:
      typeof obj.maintenanceTitle === 'string' && obj.maintenanceTitle.trim()
        ? obj.maintenanceTitle.trim()
        : DEFAULT_STEALTH_CONFIG.maintenanceTitle,
    maintenanceMessage:
      typeof obj.maintenanceMessage === 'string' && obj.maintenanceMessage.trim()
        ? obj.maintenanceMessage.trim()
        : DEFAULT_STEALTH_CONFIG.maintenanceMessage,
    knownActors: normalizeKnownActors(obj.knownActors),
    updatedAt: obj.updatedAt || new Date().toISOString(),
  };
}

/**
 * Load the latest persisted stealth router & auto-reply configuration from PostgreSQL.
 */
export async function getStealthConfig(): Promise<StealthConfig> {
  try {
    const latest = await prisma.analyticsEvent.findFirst({
      where: { eventType: CONFIG_EVENT_TYPE },
      orderBy: { createdAt: 'desc' },
      select: { eventData: true },
    });

    if (!latest?.eventData) {
      return mergeConfig(null);
    }

    return mergeConfig(latest.eventData);
  } catch (err) {
    console.error('[stealth-router] Failed to load config:', err);
    return mergeConfig(null);
  }
}

/**
 * Persist an updated stealth router configuration snapshot cleanly in analyticsEvent.
 */
export async function saveStealthConfig(input: Partial<StealthConfig>): Promise<StealthConfig> {
  const current = await getStealthConfig();
  const next = mergeConfig({
    ...current,
    ...input,
    autoReply: {
      ...current.autoReply,
      ...(input.autoReply || {}),
    },
    agents: input.agents ?? current.agents,
    knownActors: input.knownActors ?? current.knownActors,
    updatedAt: new Date().toISOString(),
  });

  await prisma.analyticsEvent.create({
    data: {
      eventType: CONFIG_EVENT_TYPE,
      eventData: next as unknown as Prisma.InputJsonValue,
    },
  });

  return next;
}

/**
 * Score a lead based on residency tier, occupation/quality answer, phone capture, and GCC/Western geo.
 */
export function scoreQualifiedLead(params: {
  residencyTier?: string | null;
  occupationTier?: string | null;
  hasPhone?: boolean;
  countryCode?: string | null;
}): { qualityTier: LeadQualityTier; qualityScore: number } {
  let score = 40;

  const res = (params.residencyTier || '').toLowerCase();
  if (res === 'resident' || res === 'citizen' || res === 'expat_pro' || res === 'vip') {
    score += 20;
  } else if (res === 'visitor') {
    score += 12;
  }

  const occ = (params.occupationTier || '').toLowerCase();
  if (occ === 'business' || occ === 'executive') {
    score += 25;
  } else if (occ === 'professional' || occ === 'engineer' || occ === 'medical') {
    score += 18;
  } else if (occ === 'student') {
    score += 5;
  } else if (occ === 'casual' || occ === 'browse') {
    score -= 15;
  }

  if (params.hasPhone) {
    score += 10;
  }

  const cc = (params.countryCode || '').toUpperCase();
  const tier1Countries = new Set([
    'SA',
    'AE',
    'QA',
    'KW',
    'BH',
    'OM',
    'US',
    'GB',
    'CA',
    'DE',
    'FR',
    'CH',
    'AU',
  ]);
  if (tier1Countries.has(cc)) {
    score += 10;
  }

  const bounded = Math.max(10, Math.min(100, score));
  const qualityTier: LeadQualityTier =
    bounded >= 75 ? 'vip' : bounded >= 48 ? 'standard' : 'low';

  return { qualityTier, qualityScore: bounded };
}

function toAgentSlug(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Resolve an agent by 1-based index, id, name, or slug (optionally stripping `verify-`). */
export function resolveAgentByTag(
  agents: StealthAgent[],
  rawTag: string,
  options?: { includePaused?: boolean }
): StealthAgent | null {
  const cleaned = rawTag.trim().toLowerCase().replace(/^verify-/, '');
  if (!cleaned || cleaned === 'vip') return null;

  const list = agents.length > 0 ? agents : DEFAULT_STEALTH_CONFIG.agents;
  const activePool = list.filter((a) => a.status === 'active');
  const pool = options?.includePaused ? list : activePool.length > 0 ? activePool : list;

  if (/^\d+$/.test(cleaned)) {
    const idx = Number.parseInt(cleaned, 10) - 1;
    const indexedAgent = list[idx];
    if (indexedAgent && (options?.includePaused || indexedAgent.status === 'active')) {
      return indexedAgent;
    }
  }

  return (
    pool.find((a) => {
      const idLower = a.id.toLowerCase();
      const nameLower = a.name.toLowerCase();
      const nameSlug = toAgentSlug(a.name);
      return (
        idLower === cleaned ||
        idLower.startsWith(`${cleaned}-`) ||
        nameLower === cleaned ||
        nameSlug === cleaned
      );
    }) || null
  );
}

/**
 * Select the best active agent for a lead using requested tag, quality tier preference,
 * daily cap checks, and weighted least-loaded distribution across today's redirects.
 */
export async function selectTargetAgent(
  config: StealthConfig,
  options: {
    requestedAgentTag?: string | null;
    qualityTier: LeadQualityTier;
  }
): Promise<StealthAgent> {
  const allAgents = config.agents.length > 0 ? config.agents : DEFAULT_STEALTH_CONFIG.agents;
  const activeAgents = allAgents.filter((a) => a.status === 'active');
  const pool = activeAgents.length > 0 ? activeAgents : allAgents;

  let effectiveQualityTier: LeadQualityTier = options.qualityTier;

  // 1. Direct agent pin via URL param or short slug (/wa/1, /wa/vip, ?ag=<id-or-slug>)
  if (options.requestedAgentTag) {
    const tag = options.requestedAgentTag.trim().toLowerCase().replace(/^verify-/, '');
    if (tag === 'vip') {
      effectiveQualityTier = 'vip';
    } else {
      const matched = resolveAgentByTag(allAgents, tag);
      if (matched) {
        return matched;
      }
    }
  }

  // 1b. Fixed Single-WhatsApp override (when Admin locks all traffic to 1 WA without deleting others)
  if (config.routingMode === 'fixed' && config.fixedAgentId) {
    const fixedAgent = allAgents.find((a) => a.id === config.fixedAgentId);
    if (fixedAgent) {
      return fixedAgent;
    }
  }

  // 2. Count today's redirects per agent for capacity & weighted balancing
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const todayCounts = new Map<string, number>();
  try {
    const todayEvents = await prisma.analyticsEvent.findMany({
      where: {
        eventType: 'wa_redirect',
        createdAt: { gte: startOfDay },
      },
      select: { eventData: true },
      take: 2000,
    });

    for (const ev of todayEvents) {
      const data = ev.eventData as Record<string, unknown> | null;
      const agentId = typeof data?.agentId === 'string' ? data.agentId : '';
      if (agentId) {
        todayCounts.set(agentId, (todayCounts.get(agentId) || 0) + 1);
      }
    }
  } catch {
    // Non-fatal fallback to pure weights
  }

  // Filter out capped agents unless all are capped
  const uncapped = pool.filter((a) => {
    if (!a.maxDailyLeads) return true;
    return (todayCounts.get(a.id) || 0) < a.maxDailyLeads;
  });
  const eligible = uncapped.length > 0 ? uncapped : pool;

  // 3. Match quality tier preference
  let tierPool = eligible.filter((a) => {
    if (effectiveQualityTier === 'vip') {
      return a.qualityTier === 'vip_only' || a.qualityTier === 'all';
    }
    if (effectiveQualityTier === 'low' || effectiveQualityTier === 'standard') {
      return a.qualityTier === 'standard_only' || a.qualityTier === 'all';
    }
    return true;
  });

  if (effectiveQualityTier === 'vip') {
    const vipSpecialists = tierPool.filter((a) => a.qualityTier === 'vip_only');
    if (vipSpecialists.length > 0) {
      tierPool = vipSpecialists;
    }
  }

  if (tierPool.length === 0) {
    tierPool = eligible;
  }

  // 4. Weighted least-loaded selection: minimize (todayCount / weight)
  let selected = tierPool[0];
  let bestScore = Infinity;

  for (const agent of tierPool) {
    const count = todayCounts.get(agent.id) || 0;
    const ratio = (count + 0.1) / Math.max(1, agent.weight);
    if (ratio < bestScore) {
      bestScore = ratio;
      selected = agent;
    }
  }

  return selected;
}

/**
 * Render template placeholders cleanly.
 */
export function renderStealthTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    return vars[key] ?? '';
  });
}

/**
 * Trigger the on-site 3-step auto-reply warmup engine when a customer sends a message
 * inside an internal conversation and no human staff member has taken over yet.
 */
export async function triggerAutoReplyIfEnabled(params: {
  conversationId: string;
  customerUserId: string;
  counterpartId: string | null | undefined;
  customerName?: string | null;
  city?: string | null;
  origin?: string | null;
}): Promise<{ sent: boolean; step?: number }> {
  try {
    if (!params.counterpartId || !params.conversationId) {
      return { sent: false };
    }

    const config = await getStealthConfig();
    if (!config.autoReply.enabled) {
      return { sent: false };
    }

    // Never interrupt once a human staff agent has replied in this conversation
    const staffReplied = await prisma.message.findFirst({
      where: {
        conversationId: params.conversationId,
        senderStaffId: { not: null },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (staffReplied) {
      return { sent: false };
    }

    // Ignore internal control/system payloads from the customer side
    const latestCustomerMsg = await prisma.message.findFirst({
      where: {
        conversationId: params.conversationId,
        senderUserId: params.customerUserId,
        deletedAt: null,
      },
      orderBy: { id: 'desc' },
      select: { content: true },
    });
    if (latestCustomerMsg?.content?.trim().startsWith('__')) {
      return { sent: false };
    }

    // Determine step index by counting prior automated concierge replies in this conversation
    const priorAutoReplies = await prisma.analyticsEvent.count({
      where: {
        userId: params.customerUserId,
        eventType: 'stealth_auto_reply',
        eventData: {
          path: ['conversationId'],
          equals: params.conversationId,
        },
      },
    });

    const nextStep = priorAutoReplies + 1;
    if (nextStep > 3) {
      return { sent: false };
    }

    let resolvedName = params.customerName || '';
    let resolvedCity = params.city || '';
    if (!resolvedName || !resolvedCity) {
      const [userRow, profileRow] = await Promise.all([
        prisma.user.findUnique({
          where: { id: params.customerUserId },
          select: { geoCity: true },
        }),
        prisma.profile.findFirst({
          where: { userId: params.customerUserId },
          select: { displayName: true, city: true },
        }),
      ]);
      if (!resolvedName) resolvedName = profileRow?.displayName || '';
      if (!resolvedCity) resolvedCity = profileRow?.city || userRow?.geoCity || '';
    }

    const leadCode = generateLeadCode();
    const vars: Record<string, string> = {
      name: (resolvedName || 'friend').split(' ')[0],
      city: resolvedCity || config.personaCity || 'your city',
      brand: config.brandName,
      code: leadCode,
    };

    let content = '';
    if (nextStep === 1) {
      content = renderStealthTemplate(config.autoReply.step1Template, vars);
    } else if (nextStep === 2) {
      content = renderStealthTemplate(config.autoReply.step2Template, vars);
    } else {
      content = renderStealthTemplate(config.autoReply.step3Template, vars);
      if (config.autoReply.includeStealthWaHandoff) {
        const base = params.origin ? params.origin.replace(/\/$/, '') : '';
        const handoffPath = `${base}/chat?c=onsite_warmup`;
        content = `${content}\n\nVerify & Connect: ${handoffPath}`;
      }
    }

    if (!content.trim()) {
      return { sent: false };
    }

    await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        senderUserId: params.counterpartId,
        content,
        contentType: 'text',
        status: 'sent',
        isAssisted: true,
      },
    });

    await prisma.conversationParticipant.updateMany({
      where: {
        conversationId: params.conversationId,
        userId: params.customerUserId,
      },
      data: {
        unreadCount: { increment: 1 },
      },
    });

    await prisma.analyticsEvent.create({
      data: {
        userId: params.customerUserId,
        eventType: 'stealth_auto_reply',
        eventData: {
          conversationId: params.conversationId,
          step: nextStep,
          leadCode,
        },
      },
    });

    return { sent: true, step: nextStep };
  } catch (err) {
    console.error('[stealth-router] Auto-reply trigger failed:', err);
    return { sent: false };
  }
}
