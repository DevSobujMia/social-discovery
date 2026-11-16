import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { resolveVisitorGeo } from '@/lib/geo';
import { getCurrentStaff } from '@/lib/auth';

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
  limitEnabled: boolean;
  countryFilter: string;
  quotaResetAt: string | null;
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
  trustedAdminIps: string[];
  ignoreAdminTests: boolean;
  scrmSyncSecret: string;
  metaPixelId: string;
  metaCapiToken: string;
  autoReply: AutoReplyConfig;
  updatedAt: string;
}

const CONFIG_EVENT_TYPE = 'stealth_system_config';
const LEGACY_DUMMY_PHONE = '15187099695';

export const DEFAULT_STEALTH_CONFIG: StealthConfig = {
  defaultMode: 'instant_redirect',
  requirePhoneCapture: false,
  brandName: 'CityHost Concierge',
  personaName: 'Nadia',
  personaCity: 'your city',
  personaBadge: 'Verified Private Host',
  greetingTemplate:
    'Welcome to {brand}. Please confirm two quick details so our concierge in {city} can connect you privately.',
  whatsappMessageTemplate: 'Hi, Where are you from?',
  agents: [],
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
  trustedAdminIps: [],
  ignoreAdminTests: true,
  scrmSyncSecret: '',
  metaPixelId: '',
  metaCapiToken: '',
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
  const maxDailyLeads =
    raw.maxDailyLeads !== null &&
    raw.maxDailyLeads !== undefined &&
    Number(raw.maxDailyLeads) > 0
      ? Math.floor(Number(raw.maxDailyLeads))
      : null;
  const limitEnabled =
    typeof raw.limitEnabled === 'boolean'
      ? raw.limitEnabled
      : Boolean(maxDailyLeads && maxDailyLeads > 0);
  const countryFilter =
    typeof raw.countryFilter === 'string' && raw.countryFilter.trim()
      ? raw.countryFilter.trim().toUpperCase().slice(0, 16)
      : 'ALL';
  const quotaResetAt =
    typeof raw.quotaResetAt === 'string' && raw.quotaResetAt.trim()
      ? raw.quotaResetAt.trim()
      : null;

  return {
    id:
      (raw.id && raw.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')) ||
      `agent-${Date.now()}-${fallbackIndex}`,
    name: (raw.name || `Agent ${fallbackIndex + 1}`).trim(),
    phone,
    roleLabel: (raw.roleLabel || 'Concierge Agent').trim(),
    status: raw.status === 'paused' ? 'paused' : 'active',
    weight: Math.max(1, Math.min(100, Math.round(Number(raw.weight) || 50))),
    qualityTier:
      raw.qualityTier === 'vip_only' || raw.qualityTier === 'standard_only'
        ? raw.qualityTier
        : 'all',
    maxDailyLeads,
    limitEnabled,
    countryFilter,
    quotaResetAt,
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
  const agents = Array.isArray(obj.agents)
    ? obj.agents
        .map((agent, idx) => sanitizeAgent(agent, idx))
        .filter(
          (a) =>
            a.id !== 'primary-desk' &&
            cleanPhoneDigits(a.phone) !== LEGACY_DUMMY_PHONE &&
            cleanPhoneDigits(a.phone).length >= 6
        )
    : [];

  const rawFixedId =
    typeof obj.fixedAgentId === 'string' && obj.fixedAgentId.trim()
      ? obj.fixedAgentId.trim()
      : null;
  const fixedAgentExists = Boolean(rawFixedId && agents.some((a) => a.id === rawFixedId));
  const routingMode: 'auto' | 'fixed' =
    obj.routingMode === 'fixed' && fixedAgentExists ? 'fixed' : 'auto';
  const fixedAgentId = routingMode === 'fixed' ? rawFixedId : null;

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
      obj.whatsappMessageTemplate &&
      obj.whatsappMessageTemplate.trim() !==
        'Hi, I am connecting from CityHost — Verified Pass #{code}'
        ? obj.whatsappMessageTemplate.trim()
        : DEFAULT_STEALTH_CONFIG.whatsappMessageTemplate,
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
    routingMode,
    fixedAgentId,
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
    trustedAdminIps: Array.isArray(obj.trustedAdminIps)
      ? Array.from(
          new Set(
            obj.trustedAdminIps
              .filter((ip): ip is string => typeof ip === 'string' && ip.trim().length > 0)
              .map((ip) => ip.trim().slice(0, 64))
          )
        )
      : [],
    ignoreAdminTests:
      typeof obj.ignoreAdminTests === 'boolean'
        ? obj.ignoreAdminTests
        : DEFAULT_STEALTH_CONFIG.ignoreAdminTests,
    scrmSyncSecret:
      typeof obj.scrmSyncSecret === 'string' && obj.scrmSyncSecret.trim()
        ? obj.scrmSyncSecret.trim().slice(0, 128)
        : '',
    metaPixelId:
      typeof obj.metaPixelId === 'string'
        ? obj.metaPixelId.trim().slice(0, 64)
        : '',
    metaCapiToken:
      typeof obj.metaCapiToken === 'string'
        ? obj.metaCapiToken.trim().slice(0, 512)
        : '',
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
    trustedAdminIps: input.trustedAdminIps ?? current.trustedAdminIps,
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

  const list = agents;
  if (list.length === 0) return null;
  const activePool = list.filter(
    (a) => a.status === 'active' && cleanPhoneDigits(a.phone).length >= 6
  );
  const pool = options?.includePaused ? list : activePool;
  if (pool.length === 0) return null;

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

const EU_COUNTRY_CODES = new Set([
  'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'PT', 'PL', 'IE', 'GR', 'CZ', 'HU', 'RO',
]);

function normalizeCountryToken(raw?: string | null): string {
  const up = (raw || '').trim().toUpperCase();
  if (!up) return '';
  if (up === 'UK' || up === 'GB' || up === 'UNITED KINGDOM' || up === 'GREAT BRITAIN' || up === 'ENGLAND') return 'GB';
  if (up === 'USA' || up === 'US' || up === 'UNITED STATES' || up === 'AMERICA') return 'US';
  if (up === 'UAE' || up === 'AE' || up === 'UNITED ARAB EMIRATES') return 'AE';
  if (up === 'CANADA' || up === 'CA') return 'CA';
  if (up === 'AUSTRALIA' || up === 'AU') return 'AU';
  if (up === 'SINGAPORE' || up === 'SG') return 'SG';
  if (up === 'GERMANY' || up === 'DE') return 'DE';
  if (up === 'FRANCE' || up === 'FR') return 'FR';
  if (up === 'EUROPE' || up === 'EU') return 'EU';
  if (up === 'TURKEY' || up === 'TR' || up === 'TÜRKIYE' || up === 'TURKIYE') return 'TR';
  return up;
}

export function matchesCountryFilter(
  agentFilter: string | null | undefined,
  visitorCountryCode?: string | null,
  visitorCountryName?: string | null,
  campaign?: string | null
): boolean {
  const filterNorm = normalizeCountryToken(agentFilter);
  if (!filterNorm || filterNorm === 'ALL') return true;

  const vCode = normalizeCountryToken(visitorCountryCode);
  const vName = normalizeCountryToken(visitorCountryName);
  const campLower = (campaign || '').toLowerCase();

  if (filterNorm === 'EU') {
    if (EU_COUNTRY_CODES.has(vCode) || EU_COUNTRY_CODES.has(vName)) return true;
    return /\b(eu|europe|uk|de|fr|es|it|nl)\b/i.test(campLower);
  }

  if (vCode === filterNorm || vName === filterNorm) return true;

  const campaignAliases: Record<string, RegExp> = {
    GB: /(^|[^a-z])(uk|gb|london|britain)([^a-z]|$)/i,
    US: /(^|[^a-z])(us|usa|ny|la|miami|america)([^a-z]|$)/i,
    CA: /(^|[^a-z])(ca|canada|toronto|vancouver)([^a-z]|$)/i,
    AU: /(^|[^a-z])(au|aus|australia|sydney|melbourne)([^a-z]|$)/i,
    AE: /(^|[^a-z])(ae|uae|dubai|abudhabi)([^a-z]|$)/i,
    SG: /(^|[^a-z])(sg|singapore)([^a-z]|$)/i,
    TR: /(^|[^a-z])(tr|turkey|turkiye|istanbul|ankara|antalya)([^a-z]|$)/i,
  };
  const rx = campaignAliases[filterNorm];
  return rx ? rx.test(campLower) : campLower.includes(filterNorm.toLowerCase());
}

/**
 * Select the best active agent for a lead using requested tag, country pool,
 * dual daily limit checks, duplicate-number safety, and weighted random (%) rotation.
 */
export async function selectTargetAgent(
  config: StealthConfig,
  options: {
    requestedAgentTag?: string | null;
    qualityTier: LeadQualityTier;
    countryCode?: string | null;
    countryName?: string | null;
    campaign?: string | null;
  }
): Promise<StealthAgent | null> {
  const allAgents = config.agents.filter((a) => cleanPhoneDigits(a.phone).length >= 6);
  const activeAgents = allAgents.filter((a) => a.status === 'active');
  if (activeAgents.length === 0) {
    return null;
  }
  const pool = activeAgents;

  let effectiveQualityTier: LeadQualityTier = options.qualityTier;

  // 1. Direct agent pin via URL param or short slug (/wa/1, /wa/vip, ?ag=<id-or-slug>)
  if (options.requestedAgentTag) {
    const tag = options.requestedAgentTag.trim().toLowerCase().replace(/^verify-/, '');
    if (tag === 'vip') {
      effectiveQualityTier = 'vip';
    } else {
      const matched = resolveAgentByTag(activeAgents, tag);
      if (matched) {
        return matched;
      }
    }
  }

  // 1b. Fixed Single-WhatsApp override (when Admin locks all traffic to 1 WA without deleting others)
  if (config.routingMode === 'fixed' && config.fixedAgentId) {
    const fixedAgent = activeAgents.find((a) => a.id === config.fixedAgentId);
    if (fixedAgent) {
      return fixedAgent;
    }
  }

  // 2. Count today's redirects per agent (respecting per-agent quotaResetAt) + last target phone
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const resetMsByAgent = new Map<string, number>();
  for (const ag of pool) {
    if (ag.quotaResetAt) {
      const ms = new Date(ag.quotaResetAt).getTime();
      if (!Number.isNaN(ms)) {
        resetMsByAgent.set(ag.id, ms);
      }
    }
  }

  const todayCounts = new Map<string, number>();
  let lastRedirectPhone = '';
  try {
    const todayEvents = await prisma.analyticsEvent.findMany({
      where: {
        eventType: 'wa_redirect',
        createdAt: { gte: startOfDay },
      },
      orderBy: { createdAt: 'desc' },
      select: { eventData: true, createdAt: true },
      take: 2000,
    });

    for (let i = 0; i < todayEvents.length; i++) {
      const ev = todayEvents[i];
      const data = ev.eventData as Record<string, unknown> | null;
      if (i === 0 && typeof data?.agentPhone === 'string') {
        lastRedirectPhone = cleanPhoneDigits(data.agentPhone);
      }
      const agentId = typeof data?.agentId === 'string' ? data.agentId : '';
      if (!agentId) continue;
      const resetMs = resetMsByAgent.get(agentId);
      if (resetMs && ev.createdAt.getTime() < resetMs) {
        continue;
      }
      todayCounts.set(agentId, (todayCounts.get(agentId) || 0) + 1);
    }
  } catch {
    // Non-fatal fallback to pure weights
  }

  // 2b. Country pool matching: keep country-matched + ALL agents, excluding agents pinned to other countries
  const specificMatches = pool.filter(
    (a) =>
      a.countryFilter &&
      a.countryFilter !== 'ALL' &&
      matchesCountryFilter(a.countryFilter, options.countryCode, options.countryName, options.campaign)
  );
  const globalPool = pool.filter((a) => !a.countryFilter || a.countryFilter === 'ALL');
  const countryPool =
    specificMatches.length > 0
      ? [...specificMatches, ...globalPool]
      : globalPool.length > 0
        ? globalPool
        : pool;

  // 2c. Dual target limit filtering (only block when limitEnabled === true & maxDailyLeads > 0 & reached)
  const isAgentCapped = (a: StealthAgent) =>
    Boolean(
      a.limitEnabled &&
        a.maxDailyLeads !== null &&
        a.maxDailyLeads > 0 &&
        (todayCounts.get(a.id) || 0) >= a.maxDailyLeads
    );
  const uncapped = countryPool.filter((a) => !isAgentCapped(a));
  const eligible = uncapped.length > 0 ? uncapped : countryPool;

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

  // 4. Deduplicate by cleaned WhatsApp number so one WA number cannot enter twice in the same draw
  const seenPhones = new Set<string>();
  const dedupedPool: StealthAgent[] = [];
  for (const agent of tierPool) {
    const digits = cleanPhoneDigits(agent.phone);
    if (digits && seenPhones.has(digits)) continue;
    if (digits) seenPhones.add(digits);
    dedupedPool.push(agent);
  }
  let drawPool = dedupedPool.length > 0 ? dedupedPool : tierPool;

  // 4b. Avoid sending two consecutive leads to the exact same WhatsApp number when fair alternatives exist
  if (drawPool.length > 1 && lastRedirectPhone) {
    const totalW = drawPool.reduce((acc, a) => acc + Math.max(1, a.weight), 0);
    const nonRepeated = drawPool.filter((a) => cleanPhoneDigits(a.phone) !== lastRedirectPhone);
    const nonRepeatedW = nonRepeated.reduce((acc, a) => acc + Math.max(1, a.weight), 0);
    if (nonRepeated.length > 0 && totalW > 0 && nonRepeatedW / totalW > 0.2) {
      drawPool = nonRepeated;
    }
  }

  // 5. Weighted Random (%) Selection with mild deficit smoothing so shares match configured % over time
  if (drawPool.length === 1) {
    return drawPool[0];
  }

  const baseWeightSum = drawPool.reduce((sum, a) => sum + Math.max(1, a.weight), 0);
  const totalPoolCount = drawPool.reduce((sum, a) => sum + (todayCounts.get(a.id) || 0), 0);

  const scoredCandidates = drawPool.map((agent) => {
    const rawWeight = Math.max(1, agent.weight);
    const share = baseWeightSum > 0 ? rawWeight / baseWeightSum : 1 / drawPool.length;
    const expectedCount = share * totalPoolCount;
    const actualCount = todayCounts.get(agent.id) || 0;
    const deficitFactor = Math.max(0.35, Math.min(2.5, 1 + (expectedCount - actualCount) * 0.25));
    const effectiveWeight = Math.max(0.5, rawWeight * deficitFactor);
    return { agent, effectiveWeight };
  });

  const totalEffectiveWeight = scoredCandidates.reduce((sum, item) => sum + item.effectiveWeight, 0);
  let cursor = Math.random() * totalEffectiveWeight;
  for (const item of scoredCandidates) {
    cursor -= item.effectiveWeight;
    if (cursor <= 0) {
      return item.agent;
    }
  }

  return scoredCandidates[scoredCandidates.length - 1].agent;
}

function getQueryParamValue(
  sp: Record<string, string | string[] | undefined> | undefined,
  ...keys: string[]
): string {
  if (!sp) return '';
  for (const key of keys) {
    const val = sp[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (Array.isArray(val) && typeof val[0] === 'string' && val[0].trim()) return val[0].trim();
  }
  return '';
}

function summarizeUaForLedger(ua: string): { deviceType: string; os: string; browser: string } {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const os = /iPhone|iPad|iPod/i.test(ua)
    ? 'iOS'
    : /Android/i.test(ua)
      ? 'Android'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS/i.test(ua)
          ? 'macOS'
          : 'Unknown OS';
  const browser = /FBAN|FBAV|Instagram/i.test(ua)
    ? 'Meta In-App'
    : /Edg/i.test(ua)
      ? 'Edge'
      : /Chrome/i.test(ua)
        ? 'Chrome'
        : /Safari/i.test(ua)
          ? 'Safari'
          : /Firefox/i.test(ua)
            ? 'Firefox'
            : 'Browser';
  return { deviceType: isMobile ? 'phone' : 'desktop', os, browser };
}

/**
 * Resolve an immediate server-side HTTP 307 redirect URL for /wa and /wa/[slug]
 * when instant_redirect is active, bypassing any intermediate HTML/loading page.
 */
export async function buildInstantServerRedirectUrl(params: {
  reqHeaders: Headers;
  slug?: string;
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<string | null> {
  const slug = (params.slug || '').trim().slice(0, 64);
  if (/^verify-/i.test(slug)) {
    return null;
  }

  const ua = params.reqHeaders.get('user-agent') || '';
  const purpose = (
    params.reqHeaders.get('purpose') ||
    params.reqHeaders.get('sec-purpose') ||
    ''
  ).toLowerCase();
  if (
    purpose.includes('prefetch') ||
    /facebookexternalhit|facebot|meta-external|facebookcatalog|adsbot|googlebot|bingbot|twitterbot|linkedinbot|whatsapp|slackbot|discordbot|telegrambot|crawler|spider|preview|lighthouse/i.test(
      ua
    )
  ) {
    return null;
  }

  const sp = params.searchParams;
  const requestedMode = getQueryParamValue(sp, 'mode');
  if (requestedMode === 'interactive_qualifier' || requestedMode === 'vip_card') {
    return null;
  }

  const config = await getStealthConfig();
  if (requestedMode !== 'instant_redirect' && config.defaultMode !== 'instant_redirect') {
    return null;
  }

  const campaign = getQueryParamValue(sp, 'c', 'utm_campaign') || (slug ? `wa-${slug}` : '');
  const requestedAgentTag = getQueryParamValue(sp, 'ag', 'agent') || slug;
  const cityOverride = getQueryParamValue(sp, 'city', 'dest').slice(0, 60);
  const countryOverride = getQueryParamValue(sp, 'country').slice(0, 60);
  const personaOverride = getQueryParamValue(sp, 'persona').slice(0, 60);
  const customText = getQueryParamValue(sp, 'text').slice(0, 240);

  const geo = await resolveVisitorGeo(params.reqHeaders, {
    country: countryOverride || null,
    city: cityOverride || null,
  });

  const targetAgent = await selectTargetAgent(config, {
    requestedAgentTag,
    qualityTier: 'vip',
    countryCode: geo.countryCode,
    countryName: countryOverride || geo.country,
    campaign,
  });

  if (!targetAgent) {
    return null;
  }

  const leadCode = generateLeadCode();
  const configuredCity =
    config.personaCity && config.personaCity.trim().toLowerCase() !== 'your city'
      ? config.personaCity.trim()
      : '';
  const displayCity =
    cityOverride ||
    configuredCity ||
    (geo.city && geo.city !== 'Unknown' && geo.city !== 'your city' ? geo.city : 'your city');

  let messageText = renderStealthTemplate(config.whatsappMessageTemplate, {
    code: leadCode,
    name: 'Guest',
    city: displayCity,
    country:
      countryOverride ||
      (geo.country && geo.country !== 'Unknown' && geo.country !== 'International' ? geo.country : ''),
    tier: 'VIP',
    campaign: campaign || 'concierge',
    phone: 'direct',
    agent: targetAgent.name,
    persona: personaOverride || config.personaName,
    brand: config.brandName,
  });
  if (customText) {
    messageText = `${messageText}\nNote: ${customText}`;
  }

  const cleanAgentPhone = cleanPhoneDigits(targetAgent.phone);
  const whatsappUrl = `https://wa.me/${cleanAgentPhone}?text=${encodeURIComponent(messageText)}`;
  const devSummary = summarizeUaForLedger(ua);

  const fbclid = getQueryParamValue(sp, 'fbclid').slice(0, 200);
  const utmSource = getQueryParamValue(sp, 'utm_source').slice(0, 100);
  const utmMedium = getQueryParamValue(sp, 'utm_medium').slice(0, 100);
  const utmContent = getQueryParamValue(sp, 'utm_content').slice(0, 160);
  const utmTerm = getQueryParamValue(sp, 'utm_term').slice(0, 160);
  const referrer = (params.reqHeaders.get('referer') || '').slice(0, 300);

  let isAdminTest = Boolean(
    geo.ip && config.trustedAdminIps.includes(geo.ip)
  );
  if (!isAdminTest) {
    const staff = await getCurrentStaff().catch(() => null);
    if (staff) isAdminTest = true;
  }

  try {
    await prisma.analyticsEvent.create({
      data: {
        eventType: 'wa_redirect',
        utmCampaign: campaign || null,
        eventData: {
          leadCode,
          customerName: 'Guest',
          customerPhone: '',
          agentId: targetAgent.id,
          agentName: targetAgent.name,
          agentPhone: cleanAgentPhone,
          campaign: campaign || 'direct',
          source: utmSource || (fbclid ? 'meta_ads' : 'direct'),
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmContent: utmContent || null,
          utmTerm: utmTerm || null,
          fbclid: fbclid || null,
          referrer: referrer || null,
          qualityTier: 'vip',
          qualityScore: 85,
          residencyTier: 'instant',
          occupationTier: 'direct',
          mode: 'instant_redirect',
          city: geo.city,
          country: geo.country,
          countryCode: geo.countryCode,
          flag: geo.flag,
          ip: geo.ip,
          device: devSummary,
          isAdminTest,
          referrerStripped: true,
          instantServerRedirect: true,
          timestamp: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.warn('[stealth-router] Non-fatal instant redirect log error:', err);
  }

  return whatsappUrl;
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
