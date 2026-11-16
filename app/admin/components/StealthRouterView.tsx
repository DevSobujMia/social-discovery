'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Filter,
  Globe,
  Link2,
  Lock,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  AgentQualityTier,
  FunnelMode,
  StealthAgent,
  StealthConfig,
} from '@/lib/stealth-router';

interface StealthRouterViewProps {
  adminFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

interface AgentStatRow extends StealthAgent {
  totalLeads: number;
  todayLeads: number;
  vipLeads: number;
  capturedPhones: number;
  lastLeadAt: string | null;
  sharePercent: number;
  configuredPercent?: number;
  isTargetReached?: boolean;
}

const COUNTRY_FILTER_OPTIONS = [
  { id: 'ALL', label: '🌍 All Countries' },
  { id: 'TR', label: '🇹🇷 Turkey' },
  { id: 'UK', label: '🇬🇧 UK' },
  { id: 'US', label: '🇺🇸 USA' },
  { id: 'CA', label: '🇨🇦 Canada' },
  { id: 'AU', label: '🇦🇺 Australia' },
  { id: 'EU', label: '🇪🇺 Europe' },
  { id: 'AE', label: '🇦🇪 UAE' },
  { id: 'SG', label: '🇸🇬 Singapore' },
];

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
  ip: string;
  source: string;
  utmSource: string;
  utmMedium: string;
  utmContent: string;
  fbclid: string;
  referrer: string;
  scrmCustomerId: string;
  mismatchFlag: boolean;
  notes: string;
  isAdminTest: boolean;
  deviceSummary: string;
  os: string;
  browser: string;
  referrerStripped: boolean;
  createdAt: string;
}

interface SummaryStats {
  totalRedirects: number;
  todayRedirects: number;
  vipLeads: number;
  standardLeads: number;
  lowLeads: number;
  capturedPhones: number;
  phoneCaptureRate: number;
  activeAgentsCount: number;
  totalAgentsCount: number;
}

type SubTab = 'agents' | 'ledger' | 'builder' | 'automation';

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: '24h', label: 'Last 24h' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'all', label: 'All Time' },
];

const EMPTY_AGENT_FORM = {
  id: '',
  name: '',
  phone: '',
  roleLabel: 'Senior VIP Concierge',
  weight: 50,
  qualityTier: 'all' as AgentQualityTier,
  maxDailyLeads: '',
  limitEnabled: false,
  countryFilter: 'ALL',
  status: 'active' as 'active' | 'paused',
  notes: '',
};

function formatTimeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function qualityBadgeClass(tier: string): string {
  const t = tier.toLowerCase();
  if (t === 'vip') {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
  }
  if (t === 'low') {
    return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }
  return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
}

export default function StealthRouterView({ adminFetch }: StealthRouterViewProps) {
  const [subTab, setSubTab] = useState<SubTab>('agents');
  const [range, setRange] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [config, setConfig] = useState<StealthConfig | null>(null);
  const [summary, setSummary] = useState<SummaryStats>({
    totalRedirects: 0,
    todayRedirects: 0,
    vipLeads: 0,
    standardLeads: 0,
    lowLeads: 0,
    capturedPhones: 0,
    phoneCaptureRate: 0,
    activeAgentsCount: 0,
    totalAgentsCount: 0,
  });
  const [agentStats, setAgentStats] = useState<AgentStatRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  // Ledger filters
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerAgentFilter, setLedgerAgentFilter] = useState('');
  const [ledgerQualityFilter, setLedgerQualityFilter] = useState('all');
  const [includeAdminTests, setIncludeAdminTests] = useState(false);
  const [expandedLedgerId, setExpandedLedgerId] = useState<string | null>(null);
  const [currentAdminIp, setCurrentAdminIp] = useState('');

  // Agent add/edit modal state
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentForm, setAgentForm] = useState(EMPTY_AGENT_FORM);

  // Ad Link Builder state
  const [builderPath, setBuilderPath] = useState<'/wa' | '/chat' | '/whatsapp'>('/wa');
  const [builderCampaign, setBuilderCampaign] = useState('');
  const [builderAgentPin, setBuilderAgentPin] = useState('');
  const [builderMode, setBuilderMode] = useState<'' | FunnelMode>('');
  const [builderCity, setBuilderCity] = useState('');
  const [builderCountry, setBuilderCountry] = useState('');
  const [builderPersona, setBuilderPersona] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedQuickKey, setCopiedQuickKey] = useState('');
  const [copiedTrapId, setCopiedTrapId] = useState('');
  const [originUrl, setOriginUrl] = useState('https://cityhost.live');

  // Editable Automation / Funnel config draft
  const [configDraft, setConfigDraft] = useState<StealthConfig | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginUrl(window.location.origin);
    }
  }, []);

  const showBanner = (type: 'ok' | 'err', text: string) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ range });
      if (ledgerAgentFilter) qs.set('agentId', ledgerAgentFilter);
      if (ledgerQualityFilter !== 'all') qs.set('quality', ledgerQualityFilter);
      if (ledgerSearch.trim()) qs.set('search', ledgerSearch.trim());
      if (includeAdminTests) qs.set('includeAdminTests', 'true');

      const res = await adminFetch(`/api/admin/stealth-router?${qs.toString()}`);
      const json = await res.json();
      if (res.ok && json?.success && json.data) {
        setConfig(json.data.config);
        setConfigDraft((prev) => prev || json.data.config);
        setCurrentAdminIp(json.data.currentAdminIp || '');
        setSummary(json.data.summary);
        setAgentStats(json.data.agentStats || []);
        setLedger(json.data.ledger || []);
      } else {
        showBanner('err', json?.error || 'Failed to load stealth router data.');
      }
    } catch {
      showBanner('err', 'Network error while loading stealth router.');
    } finally {
      setLoading(false);
    }
  }, [adminFetch, range, ledgerAgentFilter, ledgerQualityFilter, ledgerSearch, includeAdminTests]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const generatedAdLink = useMemo(() => {
    const cleanCampaignSlug = builderCampaign
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');

    if (!builderMode) {
      if (builderAgentPin) {
        const agentIdx = agentStats.findIndex((a) => a.id === builderAgentPin);
        const pathSlug = agentIdx >= 0 ? String(agentIdx + 1) : builderAgentPin;
        const base =
          builderPath === '/whatsapp'
            ? `${originUrl}${builderPath}?ag=${encodeURIComponent(pathSlug)}`
            : `${originUrl}${builderPath}/${pathSlug}`;
        const extra = new URLSearchParams();
        if (cleanCampaignSlug && builderPath !== '/whatsapp') {
          extra.set('c', cleanCampaignSlug);
        }
        if (builderCity.trim()) extra.set('city', builderCity.trim());
        if (builderCountry.trim()) extra.set('country', builderCountry.trim());
        if (builderPersona.trim()) extra.set('persona', builderPersona.trim());
        const extraQs = extra.toString();
        if (extraQs) {
          return `${base}${base.includes('?') ? '&' : '?'}${extraQs}`;
        }
        return base;
      }
    }

    if (!builderMode && !builderCity.trim() && !builderCountry.trim() && !builderPersona.trim()) {

      if (cleanCampaignSlug && builderPath !== '/whatsapp') {
        return `${originUrl}${builderPath}/${cleanCampaignSlug}`;
      }

      if (!cleanCampaignSlug) {
        return `${originUrl}${builderPath}`;
      }
    }

    const params = new URLSearchParams();
    if (builderCampaign.trim()) params.set('c', builderCampaign.trim());
    if (builderAgentPin) params.set('ag', builderAgentPin);
    if (builderMode) params.set('mode', builderMode);
    if (builderCity.trim()) params.set('city', builderCity.trim());
    if (builderCountry.trim()) params.set('country', builderCountry.trim());
    if (builderPersona.trim()) params.set('persona', builderPersona.trim());
    const qs = params.toString();
    return `${originUrl}${builderPath}${qs ? `?${qs}` : ''}`;
  }, [
    originUrl,
    builderPath,
    builderCampaign,
    builderAgentPin,
    builderMode,
    builderCity,
    builderCountry,
    builderPersona,
    agentStats,
  ]);

  async function handleSaveAgent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/stealth-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_agent',
          agent: {
            id: agentForm.id || undefined,
            name: agentForm.name,
            phone: agentForm.phone,
            roleLabel: agentForm.roleLabel,
            weight: Number(agentForm.weight) || 50,
            qualityTier: agentForm.qualityTier,
            maxDailyLeads: agentForm.maxDailyLeads ? Number(agentForm.maxDailyLeads) : null,
            limitEnabled: agentForm.limitEnabled,
            countryFilter: agentForm.countryFilter || 'ALL',
            status: agentForm.status,
            notes: agentForm.notes,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        showBanner('err', json?.error || 'Could not save agent.');
        return;
      }
      setAgentModalOpen(false);
      setAgentForm(EMPTY_AGENT_FORM);
      setConfig(json.data.config);
      setConfigDraft(json.data.config);
      showBanner('ok', 'Agent number updated in stealth router.');
      await loadData();
    } catch {
      showBanner('err', 'Failed to save agent.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAgent(agentId: string) {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/stealth-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_agent', agentId }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        showBanner('ok', 'Agent routing status updated.');
        await loadData();
      } else {
        showBanner('err', json?.error || 'Failed to update agent.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAgent(agentId: string, name: string) {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/stealth-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_agent', agentId }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        showBanner('ok', `Removed agent "${name}".`);
        await loadData();
      } else {
        showBanner('err', json?.error || 'Cannot remove agent.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!configDraft) return;
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/stealth-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_config',
          config: configDraft,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        showBanner('err', json?.error || 'Failed to save configuration.');
        return;
      }
      setConfig(json.data.config);
      setConfigDraft(json.data.config);
      showBanner('ok', 'Funnel & Auto-Reply settings saved.');
    } catch {
      showBanner('err', 'Network error saving configuration.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetRoutingMode(
    nextMode: 'auto' | 'fixed',
    nextFixedAgentId?: string | null
  ) {
    setSaving(true);
    try {
      const targetFixedId =
        nextMode === 'fixed'
          ? nextFixedAgentId ?? config?.fixedAgentId ?? agentStats[0]?.id ?? null
          : config?.fixedAgentId ?? null;
      const res = await adminFetch('/api/admin/stealth-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_routing_mode',
          routingMode: nextMode,
          fixedAgentId: targetFixedId,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        if (json.data?.config) {
          setConfig(json.data.config);
        }
        showBanner(
          'ok',
          nextMode === 'fixed'
            ? 'Routing locked to Fixed Single WhatsApp mode.'
            : 'Switched to Auto-Dynamic weighted WhatsApp rotation.'
        );
        await loadData();
      } else {
        showBanner('err', json?.error || 'Failed to update routing mode.');
      }
    } catch {
      showBanner('err', 'Network error while updating routing mode.');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickUpdateAgent(
    agentId: string,
    patch: Record<string, unknown>,
    successMsg?: string
  ) {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/stealth-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quick_update_agent',
          agentId,
          ...patch,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        if (json.data?.config) {
          setConfig(json.data.config);
          setConfigDraft(json.data.config);
        }
        showBanner('ok', successMsg || 'Updated WhatsApp routing rule.');
        await loadData();
      } else {
        showBanner('err', json?.error || 'Failed to update agent rule.');
      }
    } catch {
      showBanner('err', 'Network error updating agent.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEqualizeWeights() {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/stealth-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'equalize_weights' }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        if (json.data?.config) {
          setConfig(json.data.config);
          setConfigDraft(json.data.config);
        }
        showBanner('ok', 'All active WhatsApp numbers balanced with equal % share.');
        await loadData();
      } else {
        showBanner('err', json?.error || 'Failed to equalize shares.');
      }
    } catch {
      showBanner('err', 'Network error equalizing shares.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSwitchToInstantDirect() {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/stealth-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_config',
          config: { ...(configDraft || config), defaultMode: 'instant_redirect' },
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        if (json.data?.config) {
          setConfig(json.data.config);
          setConfigDraft(json.data.config);
        }
        showBanner('ok', 'Instant Direct WhatsApp (0s — No Landing Page) enabled!');
        await loadData();
      } else {
        showBanner('err', json?.error || 'Failed to switch default mode.');
      }
    } catch {
      showBanner('err', 'Network error switching default mode.');
    } finally {
      setSaving(false);
    }
  }

  function openCloneAgentModal(agent: AgentStatRow) {
    setAgentForm({
      id: '',
      name: `${agent.name} (WA #2)`,
      phone: '',
      roleLabel: agent.roleLabel,
      weight: agent.weight,
      qualityTier: agent.qualityTier,
      maxDailyLeads: agent.maxDailyLeads ? String(agent.maxDailyLeads) : '',
      limitEnabled: agent.limitEnabled,
      countryFilter: agent.countryFilter || 'ALL',
      status: 'active',
      notes: agent.notes
        ? `${agent.notes} | 2nd WA of ${agent.name}`
        : `2nd WA number for ${agent.name}`,
    });
    setAgentModalOpen(true);
  }

  function openEditModal(agent: AgentStatRow) {
    setAgentForm({
      id: agent.id,
      name: agent.name,
      phone: agent.phone,
      roleLabel: agent.roleLabel,
      weight: agent.weight,
      qualityTier: agent.qualityTier,
      maxDailyLeads: agent.maxDailyLeads ? String(agent.maxDailyLeads) : '',
      limitEnabled: agent.limitEnabled,
      countryFilter: agent.countryFilter || 'ALL',
      status: agent.status,
      notes: agent.notes || '',
    });
    setAgentModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="glass-card p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Route className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">
                Confidential Ad Router & Agent Ledger
              </h2>
              <p className="text-xs text-surface-400">
                Strips Facebook/Instagram referrers, filters low-quality clicks, issues #CH-XXXX verification codes & audits every agent WhatsApp handoff.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-surface-900/80 border border-surface-700/70 rounded-xl p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  range === opt.id
                    ? 'bg-accent-teal/20 text-accent-teal border border-accent-teal/30'
                    : 'text-surface-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="btn-secondary px-3 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`px-4 py-3 rounded-2xl border text-xs font-semibold flex items-center justify-between ${
            banner.type === 'ok'
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-surface-400">
            <span>Verified WA Redirects</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{summary.totalRedirects}</div>
          <div className="text-[11px] text-emerald-400 font-medium">
            {summary.todayRedirects} routed today • Referrers 100% stripped
          </div>
        </div>

        <div className="glass-card p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-surface-400">
            <span>Captured Customer Numbers</span>
            <Phone className="w-4 h-4 text-accent-teal" />
          </div>
          <div className="text-2xl font-extrabold text-white">{summary.capturedPhones}</div>
          <div className="text-[11px] text-surface-400">
            <span className="text-accent-teal font-semibold">{summary.phoneCaptureRate}%</span>{' '}
            verified before WhatsApp open
          </div>
        </div>

        <div className="glass-card p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-surface-400">
            <span>Lead Quality Breakdown</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {summary.vipLeads}{' '}
            <span className="text-xs font-semibold text-emerald-400">VIP</span>
          </div>
          <div className="text-[11px] text-surface-400">
            {summary.standardLeads} Standard • {summary.lowLeads} Filtered/Low
          </div>
        </div>

        <div className="glass-card p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-surface-400">
            <span>Active Agent WhatsApp Desks</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {summary.activeAgentsCount}{' '}
            <span className="text-sm font-normal text-surface-400">
              / {summary.totalAgentsCount}
            </span>
          </div>
          <div className="text-[11px] text-surface-400">
            Mode: <span className="text-white font-medium">{config?.defaultMode || 'interactive_qualifier'}</span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex flex-wrap gap-2 border-b border-surface-800 pb-3">
        {[
          { id: 'agents' as SubTab, label: 'Agent WhatsApp Roster', icon: Users },
          { id: 'ledger' as SubTab, label: 'Anti-Cheat Lead Ledger', icon: ShieldAlert },
          { id: 'builder' as SubTab, label: 'Confidential Ad Links', icon: Link2 },
          { id: 'automation' as SubTab, label: 'Qualifier, Auto-Reply & Meta Ads Guide', icon: Target },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                active
                  ? 'bg-accent-teal/15 text-accent-teal border border-accent-teal/35 shadow-sm'
                  : 'bg-surface-900/60 text-surface-400 hover:text-white border border-surface-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-TAB 1: AGENT WHATSAPP ROSTER */}
      {subTab === 'agents' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                Managed Employee / Agent WhatsApp Numbers
              </h3>
              <p className="text-xs text-surface-400">
                Swap, pause, cap daily volume, or dedicate numbers to VIP traffic instantly without touching your running Facebook/Instagram ads.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAgentForm(EMPTY_AGENT_FORM);
                setAgentModalOpen(true);
              }}
              className="btn-primary px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 self-start cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Agent Number</span>
            </button>
          </div>

          {/* Routing Mode Bar: Auto-Dynamic Rotation, Equal % Split, Fixed Single WA & Instant Mode */}
          <div className="glass-card p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 border border-surface-700/70">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-surface-400 mr-1">
                Routing Mode:
              </span>
              <button
                type="button"
                data-testid="routing-mode-auto-btn"
                disabled={saving}
                onClick={() => void handleSetRoutingMode('auto')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-50 ${
                  config?.routingMode !== 'fixed'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-surface-900 text-surface-400 border-surface-700 hover:text-white'
                }`}
              >
                🔄 Auto-Dynamic Rotation
              </button>
              <button
                type="button"
                data-testid="routing-mode-fixed-btn"
                disabled={saving || agentStats.length === 0}
                onClick={() => void handleSetRoutingMode('fixed')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-50 ${
                  config?.routingMode === 'fixed'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-surface-900 text-surface-400 border-surface-700 hover:text-white'
                }`}
              >
                📌 Fixed Single WhatsApp
              </button>
              <button
                type="button"
                data-testid="equalize-weights-btn"
                disabled={saving || agentStats.length === 0}
                onClick={() => void handleEqualizeWeights()}
                title="Split random % equally across all active WhatsApp numbers"
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-indigo-500/35 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 transition cursor-pointer disabled:opacity-50"
              >
                ⚖️ Equal % Split
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {config?.defaultMode === 'instant_redirect' ? (
                <span
                  data-testid="instant-direct-badge"
                  className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/35"
                >
                  ⚡ Instant Direct WA (0s — No Landing Page)
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="enable-instant-direct-btn"
                  disabled={saving}
                  onClick={() => void handleSwitchToInstantDirect()}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 cursor-pointer disabled:opacity-50"
                >
                  ⚡ Enable Instant Direct WA (0s)
                </button>
              )}

              {config?.routingMode === 'fixed' && (
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-semibold text-amber-300 whitespace-nowrap">
                    Locked Target WA:
                  </label>
                  <select
                    data-testid="fixed-agent-select"
                    disabled={saving}
                    value={config.fixedAgentId || agentStats[0]?.id || ''}
                    onChange={(e) => void handleSetRoutingMode('fixed', e.target.value)}
                    className="input-field py-1.5 px-2.5 text-xs min-w-[200px]"
                  >
                    {agentStats.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} (+{a.phone})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-800 text-[11px] uppercase tracking-wider text-surface-400 bg-surface-900/70">
                    <th className="py-3 px-4">Agent & Country Pool</th>
                    <th className="py-3 px-4">WhatsApp Number</th>
                    <th className="py-3 px-4">Random % Share</th>
                    <th className="py-3 px-4">Target Limit Mode</th>
                    <th className="py-3 px-4">Today / Reset</th>
                    <th className="py-3 px-4">ON / OFF</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800/70 text-xs">
                  {agentStats.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 px-4 text-center">
                        <div className="max-w-md mx-auto space-y-2.5">
                          <div className="text-sm font-bold text-white">
                            No Agent WhatsApp Numbers Added Yet
                          </div>
                          <p className="text-xs text-surface-400">
                            All hardcoded/demo numbers have been removed. Click{' '}
                            <strong className="text-emerald-300">+ Add Agent Number</strong> above to add your own agent WhatsApp accounts — dynamic rotation starts immediately.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    agentStats.map((agent, idx) => (
                    <tr key={agent.id} className="hover:bg-surface-900/50 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{agent.name}</div>
                        <div className="text-[11px] text-surface-400">
                          {agent.roleLabel} • <code className="text-surface-500">{agent.id}</code>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-emerald-300 font-semibold">
                          +{agent.phone}
                        </div>
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[9px] font-bold text-emerald-300">
                          Duplicate Protected
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1">
                          <input
                            key={`${agent.id}-w-${agent.weight}`}
                            data-testid={`weight-input-${idx}`}
                            type="number"
                            min={1}
                            max={100}
                            disabled={saving}
                            defaultValue={agent.weight}
                            onBlur={(e) => {
                              const next = Math.max(
                                1,
                                Math.min(100, Math.round(Number(e.target.value) || 1))
                              );
                              if (next !== agent.weight) {
                                void handleQuickUpdateAgent(
                                  agent.id,
                                  { weight: next },
                                  `${agent.name} weight updated.`
                                );
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="w-16 bg-surface-900 border border-surface-700 rounded-lg px-2 py-1 text-xs font-bold text-white text-center"
                          />
                          <span className="text-surface-400 font-bold">%</span>
                        </div>
                        <div className="text-[10px] text-accent-teal font-semibold mt-1">
                          → {agent.configuredPercent ?? agent.sharePercent}% actual share
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            data-testid={`limit-toggle-${idx}`}
                            disabled={saving}
                            onClick={() => {
                              const nextLimitEnabled = !agent.limitEnabled;
                              void handleQuickUpdateAgent(
                                agent.id,
                                {
                                  limitEnabled: nextLimitEnabled,
                                  maxDailyLeads:
                                    nextLimitEnabled && !agent.maxDailyLeads
                                      ? 25
                                      : agent.maxDailyLeads,
                                },
                                nextLimitEnabled
                                  ? `${agent.name}: Auto-stop when target reached ON.`
                                  : `${agent.name}: Unlimited rotation (manual OFF).`
                              );
                            }}
                            className={`px-2 py-1 rounded-lg border text-[10px] font-bold text-left cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                              agent.limitEnabled
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                : 'bg-sky-500/15 border-sky-500/35 text-sky-200'
                            }`}
                          >
                            {agent.limitEnabled
                              ? '🎯 Target Limit: ON'
                              : '♾️ Unlimited (Manual Off)'}
                          </button>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-surface-400">Max:</span>
                            <input
                              key={`${agent.id}-max-${agent.maxDailyLeads ?? 'none'}`}
                              data-testid={`max-leads-input-${idx}`}
                              type="number"
                              min={0}
                              disabled={saving}
                              placeholder="∞"
                              defaultValue={agent.maxDailyLeads ?? ''}
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                const nextMax =
                                  raw && Number(raw) > 0 ? Math.floor(Number(raw)) : null;
                                const prevMax = agent.maxDailyLeads ?? null;
                                if (nextMax !== prevMax) {
                                  void handleQuickUpdateAgent(
                                    agent.id,
                                    {
                                      maxDailyLeads: nextMax,
                                      limitEnabled: nextMax !== null,
                                    },
                                    nextMax
                                      ? `${agent.name} target set to ${nextMax} leads/day.`
                                      : `${agent.name} set to unlimited.`
                                  );
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-16 bg-surface-900 border border-surface-700 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-white"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">
                          {agent.limitEnabled && agent.maxDailyLeads
                            ? `${agent.todayLeads} / ${agent.maxDailyLeads}`
                            : `${agent.todayLeads} today`}
                        </div>
                        <div className="text-[10px] text-surface-400">
                          Total: {agent.totalLeads} ({agent.sharePercent}%)
                        </div>
                        {agent.isTargetReached && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-[10px] font-bold text-rose-300">
                            🛑 Target Full
                          </span>
                        )}
                        {agent.todayLeads > 0 && (
                          <button
                            type="button"
                            data-testid={`reset-quota-${idx}`}
                            disabled={saving}
                            onClick={() =>
                              void handleQuickUpdateAgent(
                                agent.id,
                                { resetQuota: true },
                                `${agent.name} daily counter reset to 0.`
                              )
                            }
                            className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-800 hover:bg-surface-700 border border-surface-700 text-[10px] font-semibold text-surface-200 cursor-pointer disabled:opacity-40"
                          >
                            ↺ Reset 0
                          </button>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          data-testid={`agent-switch-${idx}`}
                          disabled={saving}
                          onClick={() => void handleToggleAgent(agent.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer transition disabled:opacity-40 whitespace-nowrap ${
                            agent.status === 'active'
                              ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/35'
                              : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/35'
                          }`}
                        >
                          <span>{agent.status === 'active' ? '🟢 ON' : '🔴 OFF'}</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {(() => {
                            const isPinned =
                              config?.routingMode === 'fixed' && config?.fixedAgentId === agent.id;
                            return (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  void handleSetRoutingMode(
                                    isPinned ? 'auto' : 'fixed',
                                    agent.id
                                  )
                                }
                                title={
                                  isPinned
                                    ? 'Pinned as Fixed Single WhatsApp — click to resume Auto-Dynamic'
                                    : `Lock ALL traffic exclusively to ${agent.name}`
                                }
                                className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold transition cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                                  isPinned
                                    ? 'bg-amber-500/25 border-amber-500/50 text-amber-200'
                                    : 'bg-surface-800 border-surface-700 text-surface-300 hover:text-white'
                                }`}
                              >
                                {isPinned ? '📌 Pinned' : 'Pin Fixed'}
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={() => openCloneAgentModal(agent)}
                            title={`Add a 2nd WhatsApp number for ${agent.name}`}
                            className="px-2 py-1.5 rounded-lg border bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 text-[10px] font-bold transition cursor-pointer whitespace-nowrap"
                          >
                            +2nd WA
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const trapUrl = `${originUrl}/wa/verify-${idx + 1}`;
                              navigator.clipboard?.writeText(trapUrl).catch(() => {});
                              setCopiedTrapId(agent.id);
                              setTimeout(() => setCopiedTrapId(''), 1800);
                            }}
                            title={`Copy silent Agent Trap Link (/wa/verify-${idx + 1}) — send to ${agent.name} to auto-tag their IP & phone`}
                            className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-[10px] font-bold text-indigo-300 flex items-center gap-1 cursor-pointer transition"
                          >
                            {copiedTrapId === agent.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-300">Copied</span>
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="w-3 h-3" />
                                <span>Trap Link</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(agent)}
                            title="Edit agent"
                            className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteAgent(agent.id, agent.name)}
                            disabled={saving}
                            title="Delete agent"
                            className="p-1.5 rounded-lg bg-surface-800 hover:bg-rose-500/20 text-rose-400 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ANTI-CHEAT LEAD LEDGER */}
      {subTab === 'ledger' && (
        <div className="space-y-4">
          <div className="glass-card p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                placeholder="Verify #CH-XXXX code, customer phone, agent name, city, or campaign..."
                style={{ paddingLeft: '2.35rem' }}
                className="input-field w-full text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-surface-400">
                <Filter className="w-3.5 h-3.5" />
                <select
                  value={ledgerAgentFilter}
                  onChange={(e) => setLedgerAgentFilter(e.target.value)}
                  className="input-field text-xs py-2"
                >
                  <option value="">All Agents</option>
                  {agentStats.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={ledgerQualityFilter}
                onChange={(e) => setLedgerQualityFilter(e.target.value)}
                className="input-field text-xs py-2"
              >
                <option value="all">All Tiers</option>
                <option value="vip">VIP Only</option>
                <option value="standard">Standard</option>
                <option value="low">Low / Filtered</option>
              </select>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-surface-900 border border-surface-800 text-[11px] text-surface-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeAdminTests}
                  onChange={(e) => setIncludeAdminTests(e.target.checked)}
                  className="rounded border-surface-600"
                />
                Show Admin Tests
              </label>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-800 text-[11px] uppercase tracking-wider text-surface-400 bg-surface-900/70">
                    <th className="py-3 px-4">Code & Time</th>
                    <th className="py-3 px-4">Customer & WhatsApp</th>
                    <th className="py-3 px-4">Quality Score</th>
                    <th className="py-3 px-4">Assigned Agent</th>
                    <th className="py-3 px-4">Country & Source</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800/70 text-xs">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-surface-400">
                        No verified redirects match your current filter.
                      </td>
                    </tr>
                  ) : (
                    ledger.map((row) => {
                      const isExpanded = expandedLedgerId === row.id;
                      return (
                        <React.Fragment key={row.id}>
                          <tr className={`hover:bg-surface-900/40 transition ${row.mismatchFlag ? 'bg-rose-500/5' : ''}`}>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-extrabold text-white bg-surface-800 px-2 py-0.5 rounded-md border border-surface-700">
                                  #{row.leadCode}
                                </span>
                                {row.isAdminTest && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-bold text-amber-300">
                                    ADMIN TEST
                                  </span>
                                )}
                                {row.mismatchFlag && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-[9px] font-bold text-rose-300">
                                    MISMATCH
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-surface-400 mt-1">
                                {new Date(row.createdAt).toLocaleString()} ({formatTimeAgo(row.createdAt)})
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-white">{row.customerName}</div>
                              {row.customerPhone ? (
                                <a
                                  href={`https://wa.me/${row.customerPhone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-mono text-emerald-400 hover:underline mt-0.5"
                                >
                                  <Phone className="w-3 h-3" />
                                  +{row.customerPhone}
                                </a>
                              ) : (
                                <span className="text-surface-500 text-[11px]">Pending SCRM Sync</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${qualityBadgeClass(
                                  row.qualityTier
                                )}`}
                              >
                                {row.qualityTier} • {row.qualityScore}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white">{row.agentName}</div>
                              <div className="text-[11px] font-mono text-surface-400">
                                +{row.agentPhone}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="text-surface-200">
                                {row.flag} {row.city}, {row.country}
                              </div>
                              <div className="text-[11px] text-surface-400 mt-0.5">
                                {row.source} • {row.campaign}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setExpandedLedgerId(isExpanded ? null : row.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 text-[11px] font-semibold transition cursor-pointer"
                              >
                                {isExpanded ? 'Hide Details' : 'Details'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-surface-950/80">
                              <td colSpan={6} className="px-4 py-3.5 border-t border-surface-800/60">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                                  <div className="p-2.5 rounded-xl bg-surface-900/90 border border-surface-800 space-y-1">
                                    <div className="text-surface-400 font-semibold uppercase text-[10px]">Device & Network</div>
                                    <div className="text-white font-mono">IP: {row.ip || 'unknown'}</div>
                                    <div className="text-surface-300">{row.deviceSummary}</div>
                                    <div className="text-surface-500">OS: {row.os || '—'} | Browser: {row.browser || '—'}</div>
                                  </div>
                                  <div className="p-2.5 rounded-xl bg-surface-900/90 border border-surface-800 space-y-1">
                                    <div className="text-surface-400 font-semibold uppercase text-[10px]">Ad Attribution</div>
                                    <div className="text-surface-200">Campaign: <span className="font-mono text-white">{row.campaign}</span></div>
                                    <div className="text-surface-300">UTM: {row.utmSource || '—'} / {row.utmMedium || '—'} / {row.utmContent || '—'}</div>
                                    <div className="text-surface-500 truncate">fbclid: {row.fbclid || 'none'}</div>
                                  </div>
                                  <div className="p-2.5 rounded-xl bg-surface-900/90 border border-surface-800 space-y-1">
                                    <div className="text-surface-400 font-semibold uppercase text-[10px]">SCRM & Anti-Leak</div>
                                    <div className="text-surface-200">SCRM ID: <span className="font-mono text-emerald-300">{row.scrmCustomerId || 'Not linked yet'}</span></div>
                                    <div className="text-surface-300 truncate">Referrer: {row.referrer || 'Direct / Stripped'}</div>
                                    {row.notes && <div className="text-amber-300">Note: {row.notes}</div>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: CONFIDENTIAL AD LINK BUILDER */}
      {subTab === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-accent-teal" />
              <h3 className="text-sm font-bold text-white">
                Generate Confidential Ad Destination URL
              </h3>
            </div>
            <p className="text-xs text-surface-400 leading-relaxed">
              Use this CityHost URL inside your Meta Ads Manager instead of direct <code className="text-accent-teal font-mono">wa.me</code> links. Facebook clicks hit this funnel first, strip <code className="text-accent-teal font-mono">fbclid</code> and ad metadata, qualify the visitor, and pass a clean CityHost message to your chosen agent.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Landing Path
                </label>
                <select
                  value={builderPath}
                  onChange={(e) =>
                    setBuilderPath(e.target.value as '/wa' | '/chat' | '/whatsapp')
                  }
                  className="input-field w-full text-xs"
                >
                  <option value="/wa">/wa (Ultra-Clean Short Direct URL)</option>
                  <option value="/chat">/chat (Clean Concierge URL)</option>
                  <option value="/whatsapp">/whatsapp (Direct Pass URL)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Funnel Mode Override
                </label>
                <select
                  value={builderMode}
                  onChange={(e) => setBuilderMode(e.target.value as '' | FunnelMode)}
                  className="input-field w-full text-xs"
                >
                  <option value="">Use Admin Default ({config?.defaultMode})</option>
                  <option value="instant_redirect">Instant Pass Redirect (Recommended)</option>
                  <option value="interactive_qualifier">Interactive Qualifier</option>
                  <option value="vip_card">VIP 1-Step Card</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Clean Campaign Slug (Zero ? symbols)
                </label>
                <input
                  type="text"
                  value={builderCampaign}
                  onChange={(e) => setBuilderCampaign(e.target.value)}
                  placeholder="Optional (e.g. london_vip)"
                  className="input-field w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Pin Specific Agent (Optional)
                </label>
                <select
                  value={builderAgentPin}
                  onChange={(e) => setBuilderAgentPin(e.target.value)}
                  className="input-field w-full text-xs"
                >
                  <option value="">Auto-Rotate Active Agents (Weighted)</option>
                  {agentStats.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (+{a.phone})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Ad City / Location Override (Optional)
                </label>
                <input
                  type="text"
                  value={builderCity}
                  onChange={(e) => setBuilderCity(e.target.value)}
                  placeholder="e.g. London, Paris, Toronto"
                  className="input-field w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Ad Country Override (Optional)
                </label>
                <input
                  type="text"
                  value={builderCountry}
                  onChange={(e) => setBuilderCountry(e.target.value)}
                  placeholder="e.g. United Kingdom, Canada"
                  className="input-field w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Persona / Host Name (Optional)
                </label>
                <input
                  type="text"
                  value={builderPersona}
                  onChange={(e) => setBuilderPersona(e.target.value)}
                  placeholder="e.g. Elena, Maya, Sophia"
                  className="input-field w-full text-xs"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-surface-950 border border-surface-800 space-y-2.5">
              <div className="text-[10px] uppercase tracking-wider font-bold text-surface-400">
                Paste Inside Meta Ads Website URL
              </div>
              <div className="font-mono text-xs text-emerald-300 break-all">
                {generatedAdLink}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(generatedAdLink).catch(() => {});
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 1800);
                  }}
                  className="btn-primary px-3.5 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied URL' : 'Copy Ad URL'}</span>
                </button>
                <a
                  href={generatedAdLink}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary px-3.5 py-2 text-xs flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Test Live Funnel</span>
                </a>
              </div>
            </div>

            {/* Quick Copy Clean Links (Zero ? or = symbols) */}
            <div className="p-3.5 rounded-2xl bg-surface-900/80 border border-surface-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                  Quick Copy Clean Links (Zero Symbols)
                </span>
                <span className="text-[10px] text-surface-400">Trusted by Ad Clickers</span>
              </div>
              <div className="space-y-2">
                {[
                  {
                    key: 'main',
                    label: 'Main Auto-Rotating Link',
                    url: `${originUrl}/wa`,
                  },
                  {
                    key: 'vip',
                    label: 'VIP High-Quality Link',
                    url: `${originUrl}/wa/vip`,
                  },
                  ...agentStats.map((a, idx) => ({
                    key: `agent-${a.id}`,
                    label: `Agent #${idx + 1}: ${a.name}`,
                    url: `${originUrl}/wa/${idx + 1}`,
                  })),
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-950 border border-surface-800"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] text-surface-400 truncate">{item.label}</div>
                      <div className="text-xs font-mono text-emerald-300 truncate">{item.url}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(item.url).catch(() => {});
                        setCopiedQuickKey(item.key);
                        setTimeout(() => setCopiedQuickKey(''), 1600);
                      }}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-[11px] text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copiedQuickKey === item.key ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">
                What Your Agents See vs What Stays Secret
              </h3>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
              <div className="text-[11px] font-bold uppercase text-emerald-300 flex items-center gap-1.5">
                <BadgeCheck className="w-4 h-4" />
                Agent Receives This Clean WhatsApp Message:
              </div>
              <div className="p-3 rounded-xl bg-surface-950/80 border border-surface-800 text-xs text-surface-100 font-mono leading-relaxed">
                Hi, I am connecting from CityHost (London) — Verified Pass #CH-4829A
              </div>
              <p className="text-[11px] text-emerald-200/80">
                Notice: No Facebook ad image card, no &ldquo;From Facebook Ad&rdquo; badge, and the agent believes the customer came organically from CityHost!
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-surface-900/80 border border-surface-800 space-y-2 text-xs text-surface-300">
              <div className="font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-accent-teal" />
                Anti-Theft & Anti-Cheat Protection
              </div>
              <ul className="space-y-1.5 list-disc pl-4 text-[11px] text-surface-400">
                <li>Every <code className="text-white font-mono">#CH-XXXX</code> verification pass logs the customer&apos;s phone number in Admin BEFORE WhatsApp launches.</li>
                <li>Agents cannot inflate or hide daily counts because every lead requires matching your Anti-Cheat Lead Ledger.</li>
                <li>Agents cannot inject unauthorized external client numbers since all routing happens dynamically inside Admin.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: QUALIFIER, AUTO-REPLY & META ADS BLUEPRINT */}
      {subTab === 'automation' && configDraft && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <form
            onSubmit={handleSaveConfig}
            className="xl:col-span-7 glass-card p-5 space-y-5"
          >
            <div className="flex items-center justify-between gap-3 border-b border-surface-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-accent-teal" />
                <h3 className="text-sm font-bold text-white">
                  Auto-Chat Qualifier & On-Site Warmup Configuration
                </h3>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Default Funnel Mode (/chat & /whatsapp)
                </label>
                <select
                  value={configDraft.defaultMode}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      defaultMode: e.target.value as FunnelMode,
                    })
                  }
                  className="input-field w-full text-xs"
                >
                  <option value="interactive_qualifier">Interactive Auto-Chat Qualifier</option>
                  <option value="vip_card">VIP Single Card Capture</option>
                  <option value="instant_redirect">Instant Stealth Redirect</option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-900 border border-surface-800 cursor-pointer">
                  <span className="text-xs font-semibold text-surface-200">
                    Require Customer WhatsApp Capture
                  </span>
                  <input
                    type="checkbox"
                    checked={configDraft.requirePhoneCapture}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        requirePhoneCapture: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Concierge Brand Name
                </label>
                <input
                  type="text"
                  value={configDraft.brandName}
                  onChange={(e) =>
                    setConfigDraft({ ...configDraft, brandName: e.target.value })
                  }
                  className="input-field w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Persona Name & Badge
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={configDraft.personaName}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, personaName: e.target.value })
                    }
                    className="input-field w-1/2 text-xs"
                    placeholder="Name"
                  />
                  <input
                    type="text"
                    value={configDraft.personaCity}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, personaCity: e.target.value })
                    }
                    className="input-field w-1/2 text-xs"
                    placeholder="Fallback City"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                Landing Chat Greeting (<code className="text-accent-teal">{'{brand}'}</code>,{' '}
                <code className="text-accent-teal">{'{city}'}</code>,{' '}
                <code className="text-accent-teal">{'{persona}'}</code>)
              </label>
              <textarea
                rows={2}
                value={configDraft.greetingTemplate}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, greetingTemplate: e.target.value })
                }
                className="input-field w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                Pre-filled Clean WhatsApp Message (<code className="text-accent-teal">{'{code}'}</code>,{' '}
                <code className="text-accent-teal">{'{name}'}</code>,{' '}
                <code className="text-accent-teal">{'{city}'}</code>,{' '}
                <code className="text-accent-teal">{'{tier}'}</code>,{' '}
                <code className="text-accent-teal">{'{agent}'}</code>)
              </label>
              <textarea
                rows={2}
                value={configDraft.whatsappMessageTemplate}
                onChange={(e) =>
                  setConfigDraft({
                    ...configDraft,
                    whatsappMessageTemplate: e.target.value,
                  })
                }
                className="input-field w-full text-xs font-mono"
              />
            </div>

            {/* On-site 3-step Auto Reply Section */}
            <div className="pt-3 border-t border-surface-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    On-Site Auto-Reply Warmup Engine (3-Step)
                  </h4>
                  <p className="text-[11px] text-surface-400">
                    Automatically builds rapport with users inside CityHost chat before handing off to WhatsApp (stops immediately if a real staff agent replies).
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={configDraft.autoReply.enabled}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      autoReply: {
                        ...configDraft.autoReply,
                        enabled: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] text-surface-400 mb-1">
                    Reply Step 1 (First Message — Location & Timing Check)
                  </label>
                  <input
                    type="text"
                    value={configDraft.autoReply.step1Template}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        autoReply: {
                          ...configDraft.autoReply,
                          step1Template: e.target.value,
                        },
                      })
                    }
                    className="input-field w-full text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-surface-400 mb-1">
                    Reply Step 2 (Second Message — Profession / Seriousness Filter)
                  </label>
                  <input
                    type="text"
                    value={configDraft.autoReply.step2Template}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        autoReply: {
                          ...configDraft.autoReply,
                          step2Template: e.target.value,
                        },
                      })
                    }
                    className="input-field w-full text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-surface-400 mb-1">
                    Reply Step 3 (Third Message — Verified #CH Code & Private Handoff)
                  </label>
                  <input
                    type="text"
                    value={configDraft.autoReply.step3Template}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        autoReply: {
                          ...configDraft.autoReply,
                          step3Template: e.target.value,
                        },
                      })
                    }
                    className="input-field w-full text-xs"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={configDraft.autoReply.includeStealthWaHandoff}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        autoReply: {
                          ...configDraft.autoReply,
                          includeStealthWaHandoff: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-emerald-500"
                  />
                  <span>
                    Append clean <code className="text-accent-teal font-mono">/chat?c=onsite_warmup</code> WhatsApp pass link in Step 3
                  </span>
                </label>
              </div>
            </div>
          </form>

          {/* Meta Ads High-Quality Customer Blueprint */}
          <div className="xl:col-span-5 glass-card p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-surface-800 pb-3">
              <Target className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">
                Meta Ads High-Quality Customer Blueprint
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-surface-900/90 border border-surface-800 space-y-1">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  1. Switch Objective to Leads / Website Conversions
                </div>
                <p className="text-[11px] text-surface-400 leading-relaxed">
                  Never run &ldquo;Traffic / Link Clicks&rdquo; or direct WhatsApp Click ads for cold high-value offers—Meta optimizes those for accidental clickers. Run Website Conversions optimizing for the <code className="text-emerald-300 font-mono">Lead</code> Pixel event (which this CityHost qualifier only fires AFTER step 3 phone verification!).
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-900/90 border border-surface-800 space-y-1">
                <div className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  2. Quality Audience & Placement Filtering
                </div>
                <p className="text-[11px] text-surface-400 leading-relaxed">
                  In Ad Set Placements, turn OFF Audience Network and Messenger Inbox. Target specific wealthy districts/cities + Interests like Business Executives, Frequent International Travelers, Luxury Brands, and Higher Education (or filter iOS / newer flagship devices to cut low-intent clicks by 60%+).
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-900/90 border border-surface-800 space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  3. Pre-Qualify in Ad Creative & Let /chat Filter
                </div>
                <p className="text-[11px] text-surface-400 leading-relaxed">
                  Mention &ldquo;Verified Members / Concierge Screening Required&rdquo; directly on the ad graphic so casual time-wasters skip clicking, while serious VIP clients complete the 2-tap screen on <code className="text-accent-teal font-mono">/chat</code> and route straight to your <code className="text-amber-300 font-mono">vip_only</code> agents.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-900/90 border border-surface-800 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-accent-teal" />
                  4. Rotate Agents Without Resetting Ad Learning
                </div>
                <p className="text-[11px] text-surface-400 leading-relaxed">
                  Keep one permanent CityHost destination URL (<code className="text-emerald-300 font-mono">{originUrl}/chat?c=campaign_name</code>) in Meta Ads forever. Add, swap, or pause employee WhatsApp numbers here in Admin anytime without resetting Meta&apos;s learning phase!
                </p>
              </div>
            </div>
          </div>

          {/* Admin IP Shield, SCRM Real-Time Sync & Meta CAPI */}
          <div className="xl:col-span-12 glass-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-accent-teal" />
                <h3 className="text-sm font-bold text-white">
                  Admin IP Shield, SCRM Real-Time Sync &amp; Meta Conversions API (CAPI)
                </h3>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-surface-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={configDraft.ignoreAdminTests !== false}
                  onChange={async (e) => {
                    const nextVal = e.target.checked;
                    setConfigDraft({ ...configDraft, ignoreAdminTests: nextVal });
                    await adminFetch('/api/admin/stealth-router', {
                      method: 'POST',
                      body: JSON.stringify({
                        action: 'save_config',
                        config: { ignoreAdminTests: nextVal },
                      }),
                    });
                    showBanner('ok', nextVal ? 'Admin test clicks excluded from lead counts.' : 'Admin test clicks counted normally.');
                  }}
                />
                Exclude Admin IP/Browser Tests from Lead Counts
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {/* Trusted Admin IPs */}
              <div className="p-4 rounded-2xl bg-surface-900/80 border border-surface-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-white">Trusted Admin IPs</div>
                    <div className="text-[11px] text-surface-400">
                      Your current IP: <code className="text-emerald-300 font-mono">{currentAdminIp || 'detecting...'}</code>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={saving || !currentAdminIp}
                    onClick={async () => {
                      const res = await adminFetch('/api/admin/stealth-router', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'trust_my_ip' }),
                      });
                      const json = await res.json();
                      if (res.ok && json?.success) {
                        setConfig(json.data.config);
                        setConfigDraft(json.data.config);
                        showBanner('ok', `Trusted IP saved: ${json.data.ip}`);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold hover:bg-emerald-500/30 transition cursor-pointer"
                  >
                    + Trust My Current IP
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(config?.trustedAdminIps || []).length === 0 ? (
                    <span className="text-[11px] text-surface-500">
                      No trusted IPs added yet. Click &ldquo;Trust My Current IP&rdquo; so Incognito / other browsers on your PC never pollute lead stats.
                    </span>
                  ) : (
                    (config?.trustedAdminIps || []).map((ip) => (
                      <span
                        key={ip}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-800 border border-surface-700 font-mono text-[11px] text-white"
                      >
                        {ip}
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await adminFetch('/api/admin/stealth-router', {
                              method: 'POST',
                              body: JSON.stringify({ action: 'remove_trusted_ip', ip }),
                            });
                            const json = await res.json();
                            if (res.ok && json?.success) {
                              setConfig(json.data.config);
                              setConfigDraft(json.data.config);
                              showBanner('ok', `Removed ${ip}`);
                            }
                          }}
                          className="text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* SCRM Sync + Meta CAPI */}
              <div className="p-4 rounded-2xl bg-surface-900/80 border border-surface-800 space-y-3">
                <div className="font-bold text-white">SCRM Real-Time Sync &amp; Meta CAPI</div>
                <div className="space-y-2">
                  <div>
                    <div className="text-[11px] text-surface-400 mb-1">SCRM Webhook URL</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-surface-950 border border-surface-800 text-[11px] text-emerald-300 truncate">
                        {originUrl}/api/integrations/scrm/lead-sync
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(`${originUrl}/api/integrations/scrm/lead-sync`);
                          setCopiedQuickKey('scrm-url');
                          setTimeout(() => setCopiedQuickKey(''), 1800);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-surface-800 text-surface-200 hover:text-white text-[11px] cursor-pointer"
                      >
                        {copiedQuickKey === 'scrm-url' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-surface-400 mb-1">SCRM Sync Secret (x-scrm-secret)</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-surface-950 border border-surface-800 text-[11px] text-amber-300 truncate">
                        {config?.scrmSyncSecret || 'Not generated yet'}
                      </code>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await adminFetch('/api/admin/stealth-router', {
                            method: 'POST',
                            body: JSON.stringify({ action: 'generate_scrm_secret' }),
                          });
                          const json = await res.json();
                          if (res.ok && json?.success) {
                            setConfig(json.data.config);
                            setConfigDraft(json.data.config);
                            showBanner('ok', 'Generated new SCRM sync secret.');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-accent-teal/20 border border-accent-teal/40 text-accent-teal text-[11px] font-bold cursor-pointer"
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <input
                      type="text"
                      value={configDraft.metaPixelId || ''}
                      onChange={(e) => setConfigDraft({ ...configDraft, metaPixelId: e.target.value })}
                      placeholder="Meta Pixel ID (optional)"
                      className="input-field text-[11px]"
                    />
                    <input
                      type="password"
                      value={configDraft.metaCapiToken || ''}
                      onChange={(e) => setConfigDraft({ ...configDraft, metaCapiToken: e.target.value })}
                      placeholder="Meta CAPI Access Token"
                      className="input-field text-[11px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await adminFetch('/api/admin/stealth-router', {
                        method: 'POST',
                        body: JSON.stringify({
                          action: 'save_config',
                          config: {
                            metaPixelId: configDraft.metaPixelId || '',
                            metaCapiToken: configDraft.metaCapiToken || '',
                          },
                        }),
                      });
                      const json = await res.json();
                      if (res.ok && json?.success) {
                        setConfig(json.data.config);
                        setConfigDraft(json.data.config);
                        showBanner('ok', 'Meta Pixel & CAPI settings saved.');
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-surface-800 hover:bg-surface-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    Save Meta CAPI Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT AGENT MODAL */}
      {agentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card p-5 space-y-4 border border-surface-700">
            <div className="flex items-center justify-between border-b border-surface-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {agentForm.id ? 'Edit Agent WhatsApp Desk' : 'Add New Agent WhatsApp Desk'}
              </h3>
              <button
                type="button"
                onClick={() => setAgentModalOpen(false)}
                className="text-surface-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAgent} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Agent / Desk Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={agentForm.name}
                  onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                  placeholder="e.g. Sarah VIP Desk"
                  className="input-field w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Agent WhatsApp Number (Digits with Country Code) *
                </label>
                <input
                  type="text"
                  required
                  value={agentForm.phone}
                  onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })}
                  placeholder="e.g. 447700900123"
                  className="input-field w-full text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                    Role Label
                  </label>
                  <input
                    type="text"
                    value={agentForm.roleLabel}
                    onChange={(e) => setAgentForm({ ...agentForm, roleLabel: e.target.value })}
                    className="input-field w-full text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                    Lead Quality Routing
                  </label>
                  <select
                    value={agentForm.qualityTier}
                    onChange={(e) =>
                      setAgentForm({
                        ...agentForm,
                        qualityTier: e.target.value as AgentQualityTier,
                      })
                    }
                    className="input-field w-full text-xs"
                  >
                    <option value="all">All Leads</option>
                    <option value="vip_only">VIP Leads Only</option>
                    <option value="standard_only">Standard Queue</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                    Traffic Share % (1-100)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={agentForm.weight}
                    onChange={(e) =>
                      setAgentForm({
                        ...agentForm,
                        weight: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                      })
                    }
                    className="input-field w-full text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                    Daily Target Cap
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={agentForm.maxDailyLeads}
                    onChange={(e) => setAgentForm({ ...agentForm, maxDailyLeads: e.target.value })}
                    placeholder="e.g. 25"
                    className="input-field w-full text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                    Status
                  </label>
                  <select
                    value={agentForm.status}
                    onChange={(e) =>
                      setAgentForm({
                        ...agentForm,
                        status: e.target.value as 'active' | 'paused',
                      })
                    }
                    className="input-field w-full text-xs"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                    Target Limit Mode
                  </label>
                  <select
                    value={agentForm.limitEnabled ? 'limited' : 'unlimited'}
                    onChange={(e) =>
                      setAgentForm({
                        ...agentForm,
                        limitEnabled: e.target.value === 'limited',
                      })
                    }
                    className="input-field w-full text-xs"
                  >
                    <option value="unlimited">♾️ Unlimited (Manual Off)</option>
                    <option value="limited">🎯 Stop at Target Limit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                  Private Admin Notes (Never Shown to Agent)
                </label>
                <input
                  type="text"
                  value={agentForm.notes}
                  onChange={(e) => setAgentForm({ ...agentForm, notes: e.target.value })}
                  placeholder="Commission rate, assigned shift, etc."
                  className="input-field w-full text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAgentModalOpen(false)}
                  className="btn-secondary px-4 py-2 text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary px-4 py-2 text-xs font-bold cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
