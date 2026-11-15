'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  MousePointerClick,
  Globe,
  RefreshCw,
  Search,
  X,
  Smartphone,
  Monitor,
  ChevronDown,
  ChevronUp,
  MapPin,
  Layers,
  Compass,
  ShieldAlert,
  Shield,
  Headphones,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';

interface VisitorAnalyticsViewProps {
  adminFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

type ActorRoleType = 'customer' | 'agent' | 'spy' | 'admin';

function getRoleBadgeMeta(role?: ActorRoleType, linkedAgentName?: string | null) {
  switch (role) {
    case 'spy':
      return {
        label: linkedAgentName ? `SUSPECTED SPY (${linkedAgentName})` : 'SUSPECTED SPY',
        emoji: '🕵️',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        cardBorder: 'border-rose-500/45 bg-rose-950/10 hover:border-rose-400/60',
      };
    case 'agent':
      return {
        label: linkedAgentName ? `AGENT: ${linkedAgentName}` : 'AGENT',
        emoji: '🎧',
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        cardBorder: 'border-amber-500/35 hover:border-amber-400/50',
      };
    case 'admin':
      return {
        label: 'ADMIN',
        emoji: '🛡️',
        badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        cardBorder: 'border-purple-500/30 hover:border-purple-400/50',
      };
    default:
      return {
        label: 'REAL CUSTOMER',
        emoji: '👤',
        badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        cardBorder: 'border-surface-800 hover:border-surface-700',
      };
  }
}

function formatSecurityActionLabel(action?: string): { label: string; colorClass: string } {
  switch (action) {
    case 'admin_probe':
      return { label: 'Admin Probe (/admin)', colorClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    case 'devtools_shortcut':
      return { label: 'DevTools / View Source', colorClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    case 'right_click':
      return { label: 'Right-Click Blocked', colorClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    case 'text_copy':
      return { label: 'Copy Content Blocked', colorClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40' };
    case 'agent_device_registered':
      return { label: 'Agent Trap Link Opened', colorClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' };
    default:
      return { label: action || 'Security Alert', colorClass: 'bg-surface-800 text-surface-300 border-surface-700' };
  }
}

function formatEventDateTime(d?: string | Date | null): string {
  if (!d) return '—';
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return String(d);
  }
}

function formatEventRelativeTime(d?: string | Date | null): string {
  if (!d) return '';
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
}

export default function VisitorAnalyticsView({ adminFetch }: VisitorAnalyticsViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [range, setRange] = useState<'today' | '24h' | '7d' | '30d' | 'all'>('7d');
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'all' | ActorRoleType>('all');
  const [subTab, setSubTab] = useState<'journeys' | 'alerts' | 'clicks' | 'top' | 'geo'>('journeys');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [expandedVisitors, setExpandedVisitors] = useState<Record<string, boolean>>({});
  const [taggingVisitorId, setTaggingVisitorId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (range) params.set('range', range);
      if (search) params.set('search', search);
      if (roleFilter !== 'all') params.set('role', roleFilter);

      const res = await adminFetch(`/api/admin/visitor-analytics?${params.toString()}`);
      const resJson = await res.json();
      if (resJson.success) {
        setData(resJson.data);
      }
    } catch (err) {
      console.error('[VisitorAnalytics] Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, range, search, roleFilter]);

  const handleTagActor = async (
    target: { visitorId: string; ip?: string; linkedAgentName?: string | null },
    role: ActorRoleType
  ) => {
    if (!target.visitorId && !target.ip) return;
    setTaggingVisitorId(target.visitorId || target.ip || 'tagging');
    try {
      const res = await adminFetch('/api/admin/visitor-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tag_actor',
          visitorId: target.visitorId,
          ip: target.ip,
          role,
          ...(target.linkedAgentName ? { agentName: target.linkedAgentName } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (json?.success) {
        await fetchData();
      }
    } catch (err) {
      console.error('[VisitorAnalytics] Failed to tag actor:', err);
    } finally {
      setTaggingVisitorId(null);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // Live Auto-Refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const toggleExpanded = (vid: string) => {
    setExpandedVisitors((prev) => ({
      ...prev,
      [vid]: !prev[vid],
    }));
  };

  const summary = data?.summary || {};
  const roleCounts = data?.roleCounts || {
    all: data?.visitors?.length || 0,
    customer: 0,
    agent: 0,
    spy: 0,
    admin: 0,
  };
  const visitors = data?.visitors || [];
  const securityAlerts = data?.securityAlerts || [];
  const recentClicks = data?.recentClicks || [];
  const topClicks = data?.topClicks || [];
  const geoStats = data?.geoStats || {};
  const deviceStats = data?.deviceStats || {};

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>Live Visitors & Click Tracker</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                Real-Time Telemetry
              </span>
            </h2>
          </div>
          <p className="text-xs text-surface-400 mt-1">
            See exactly how many people visited, when they arrived, where they are from (Country, City, IP), device specs, and who clicked where.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Time Range Selector */}
          <div className="flex items-center bg-surface-900 rounded-xl p-1 border border-surface-800">
            {(['today', '24h', '7d', '30d', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                  range === r
                    ? 'bg-accent-teal text-surface-950 shadow-sm'
                    : 'text-surface-400 hover:text-white'
                }`}
              >
                {r === '24h' ? '24 Hours' : r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : r}
              </button>
            ))}
          </div>

          {/* Auto-Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              autoRefresh
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-surface-800 text-surface-400 border-surface-700 hover:text-white'
            }`}
            title="Toggle 10s auto-refresh"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-ping' : 'bg-surface-500'}`} />
            <span>{autoRefresh ? 'Live: ON (10s)' : 'Live: OFF'}</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchData}
            className="p-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white border border-surface-700 transition"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-accent-teal' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-[11px] text-surface-400 font-medium">Total Unique Visitors</p>
          <p className="text-2xl font-extrabold text-white mt-1">
            {summary.totalVisitors ?? '0'}
          </p>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-accent-teal font-semibold">
            <span>+{summary.todayVisitors ?? 0} today</span>
            <span className="text-surface-500 font-normal">· {summary.totalSessions ?? 0} sessions</span>
          </div>
        </div>

        <div className="glass-card p-4">
          <p className="text-[11px] text-surface-400 font-medium">Total Clicks Tracked</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">
            {summary.totalClicks ?? '0'}
          </p>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-semibold">
            <span>+{summary.todayClicks ?? 0} today</span>
            <span className="text-surface-500 font-normal">· {summary.totalPageViews ?? 0} views</span>
          </div>
        </div>

        <div className="glass-card p-4">
          <p className="text-[11px] text-surface-400 font-medium">Top Visitor Location</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl">{summary.topCountry?.flag || '🇸🇦'}</span>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-white truncate">
                {summary.topCountry?.country || 'Saudi Arabia'}
              </p>
              <p className="text-[10px] text-surface-400 truncate">
                {summary.topCity?.city || 'Riyadh'} ({summary.topCountry?.percentage || 0}%)
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <p className="text-[11px] text-surface-400 font-medium">Mobile & In-App Traffic</p>
          <p className="text-2xl font-extrabold text-indigo-400 mt-1">
            {summary.mobilePercentage ?? 0}%
          </p>
          <span className="text-[10px] text-indigo-300/80 mt-1 inline-block">
            {summary.inAppPercentage ?? 0}% Facebook/IG In-App
          </span>
        </div>
      </div>

      {/* Role Filter Pills (Customer vs Agent vs Suspected Spy vs Admin) */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { id: 'all' as const, label: 'All Visitors', count: roleCounts.all ?? visitors.length, icon: Users, activeCls: 'bg-accent-teal text-surface-950 border-accent-teal' },
          { id: 'customer' as const, label: '👤 Real Customers', count: roleCounts.customer ?? 0, icon: UserCheck, activeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
          { id: 'agent' as const, label: '🎧 Agents', count: roleCounts.agent ?? 0, icon: Headphones, activeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
          { id: 'spy' as const, label: '🕵️ Suspected Spies', count: roleCounts.spy ?? 0, icon: ShieldAlert, activeCls: 'bg-rose-500/25 text-rose-300 border-rose-500/50' },
          { id: 'admin' as const, label: '🛡️ Admin', count: roleCounts.admin ?? 0, icon: Shield, activeCls: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
        ].map((pill) => {
          const isActive = roleFilter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => {
                setRoleFilter(pill.id);
                if (subTab !== 'journeys') setSubTab('journeys');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? pill.activeCls
                  : 'bg-surface-900/70 text-surface-300 border-surface-800 hover:border-surface-700 hover:text-white'
              }`}
            >
              <span>{pill.label}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${isActive ? 'bg-black/20' : 'bg-surface-800 text-surface-300'}`}>
                {pill.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sub-tabs & Search Toolbar */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-surface-900/60 p-2.5 rounded-2xl border border-surface-800">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setSubTab('journeys')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subTab === 'journeys'
                ? 'bg-accent-teal/20 text-accent-teal border border-accent-teal/30 font-bold'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Visitor Journeys ({visitors.length})</span>
          </button>

          <button
            onClick={() => setSubTab('alerts')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subTab === 'alerts'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
                : securityAlerts.length > 0
                  ? 'text-rose-300/90 hover:text-rose-200 hover:bg-rose-500/10 border border-rose-500/20'
                  : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Spy &amp; Security Alerts ({securityAlerts.length})</span>
          </button>

          <button
            onClick={() => setSubTab('clicks')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
              subTab === 'clicks'
                ? 'bg-accent-teal/20 text-accent-teal border border-accent-teal/30 font-bold'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <MousePointerClick className="w-3.5 h-3.5" />
            <span>Live Click Stream ({recentClicks.length})</span>
          </button>

          <button
            onClick={() => setSubTab('top')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
              subTab === 'top'
                ? 'bg-accent-teal/20 text-accent-teal border border-accent-teal/30 font-bold'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Top Clicked Elements</span>
          </button>

          <button
            onClick={() => setSubTab('geo')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
              subTab === 'geo'
                ? 'bg-accent-teal/20 text-accent-teal border border-accent-teal/30 font-bold'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Geo & Devices</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search IP, city, button..."
            className="w-full bg-surface-950 border border-surface-700/80 rounded-xl pl-9 pr-7 py-1.5 text-xs text-white placeholder-surface-500 focus:outline-none focus:border-accent-teal transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* View 1: Visitor Journeys & Sessions */}
      {subTab === 'journeys' && (
        <div className="space-y-3">
          {visitors.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <Users className="w-8 h-8 text-surface-500 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-white">No visitor sessions recorded yet</p>
              <p className="text-xs text-surface-400 mt-1">
                When people land from Facebook ads or visit the site, their sessions, location, and clicks will show here instantly.
              </p>
            </div>
          ) : (
            visitors.map((v: any) => {
              const isExpanded = Boolean(expandedVisitors[v.visitorId]);
              const roleMeta = getRoleBadgeMeta(v.actorRole, v.linkedAgentName);
              const isTagging = taggingVisitorId === v.visitorId;
              return (
                <div
                  key={v.visitorId}
                  className={`glass-card p-4 transition border space-y-3 ${roleMeta.cardBorder}`}
                >
                  {/* Visitor Summary Header */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl shrink-0">{v.flag || '🌐'}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">
                            {v.city ? `${v.city}, ` : ''}{v.country}
                          </span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${roleMeta.badgeClass}`}>
                            <span>{roleMeta.emoji}</span>
                            <span>{roleMeta.label}</span>
                            {v.spyScore > 0 && (
                              <span className="ml-1 opacity-90">({v.spyScore}pt)</span>
                            )}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-surface-800 text-surface-300 border border-surface-700">
                            IP: {v.ip}
                          </span>
                          {v.user && (
                            <span className="badge-teal text-[10px] font-bold px-1.5 py-0.5">
                              Lead: {v.user.profile?.displayName || v.user.phone || 'Active'}
                            </span>
                          )}
                          {v.utmCampaign && (
                            <span className="badge-brand text-[10px] font-mono px-1.5 py-0.5">
                              Campaign: {v.utmCampaign}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-surface-400 flex-wrap">
                          <span>ID: <code className="text-[10px] text-surface-300">{v.visitorId.substring(0, 16)}...</code></span>
                          <span>•</span>
                          <span>Arrived: {formatEventDateTime(v.firstSeenAt)}</span>
                          <span>({formatEventRelativeTime(v.lastActiveAt)})</span>
                        </div>
                      </div>
                    </div>

                    {/* Clicks & Toggle Button */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <div className="text-right">
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${
                          v.clicksCount > 0
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-surface-800 text-surface-400 border-surface-700'
                        }`}>
                          {v.clicksCount} Clicks
                        </span>
                      </div>

                      <button
                        onClick={() => toggleExpanded(v.visitorId)}
                        className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-xs font-semibold text-white border border-surface-700 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Hide Clicks' : 'View Clicks'}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Spy Reasons Warning Bar */}
                  {Array.isArray(v.spyReasons) && v.spyReasons.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-200 flex-wrap">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="font-bold text-rose-300">Suspicious Activity:</span>
                      <span>{v.spyReasons.join(' • ')}</span>
                    </div>
                  )}

                  {/* Device & Technical Specs + Visited Pages + Manual Role Actions */}
                  <div className="flex flex-col gap-2 bg-surface-900/60 p-2.5 rounded-xl border border-surface-800/80 text-[11px] text-surface-300">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1 text-white font-semibold">
                        {v.deviceType === 'Mobile' || v.deviceType === 'phone' ? <Smartphone className="w-3.5 h-3.5 text-indigo-400" /> : <Monitor className="w-3.5 h-3.5 text-sky-400" />}
                        <span>{v.deviceType}</span>
                      </span>
                      <span>•</span>
                      <span className="text-surface-300 font-medium">OS: {v.os}</span>
                      <span>•</span>
                      <span className="text-surface-300 font-medium">Browser: {v.browser}</span>
                      <span>•</span>
                      <span className="text-surface-400">Screen: {v.screen}</span>
                      {v.landingPage && (
                        <>
                          <span>•</span>
                          <span className="text-surface-400 truncate max-w-xs" title={v.landingPage}>
                            URL: {v.landingPage}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap pt-1.5 border-t border-surface-800/70">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {Array.isArray(v.visitedPaths) && v.visitedPaths.length > 0 && (
                          <>
                            <span className="text-[10px] text-surface-500 font-semibold">Pages Visited:</span>
                            {v.visitedPaths.map((p: string, idx: number) => (
                              <code
                                key={`${v.visitorId}-p-${idx}`}
                                className="px-1.5 py-0.5 rounded bg-surface-800 text-surface-200 border border-surface-700 text-[10px]"
                              >
                                {p}
                              </code>
                            ))}
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-surface-500">Tag as:</span>
                        {v.actorRole !== 'agent' && (
                          <button
                            type="button"
                            disabled={isTagging}
                            onClick={() => void handleTagActor(v, 'agent')}
                            className="px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-bold cursor-pointer disabled:opacity-40"
                          >
                            Mark Agent
                          </button>
                        )}
                        {v.actorRole !== 'spy' && (
                          <button
                            type="button"
                            disabled={isTagging}
                            onClick={() => void handleTagActor(v, 'spy')}
                            className="px-2 py-0.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10px] font-bold cursor-pointer disabled:opacity-40"
                          >
                            Mark Spy
                          </button>
                        )}
                        {v.actorRole !== 'admin' && (
                          <button
                            type="button"
                            disabled={isTagging}
                            onClick={() => void handleTagActor(v, 'admin')}
                            className="px-2 py-0.5 rounded-md bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-[10px] font-bold cursor-pointer disabled:opacity-40"
                          >
                            Mark Admin
                          </button>
                        )}
                        {v.actorRole !== 'customer' && (
                          <button
                            type="button"
                            disabled={isTagging}
                            onClick={() => void handleTagActor(v, 'customer')}
                            className="px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold cursor-pointer disabled:opacity-40"
                          >
                            Mark Customer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Step-by-Step Click Timeline */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-surface-800">
                      <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                        <MousePointerClick className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Click Journey Timeline ({v.clicks.length} actions recorded):</span>
                      </h4>

                      {v.clicks.length === 0 ? (
                        <p className="text-xs text-surface-500 italic p-3 bg-surface-900/40 rounded-xl">
                          Visitor browsed the page without clicking any interactive elements yet.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {v.clicks.map((c: any, idx: number) => (
                            <div
                              key={c.id || idx}
                              className="flex items-start sm:items-center justify-between gap-3 p-2.5 rounded-xl bg-surface-900/80 border border-surface-800 text-xs"
                            >
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="w-5 h-5 rounded-full bg-accent-teal/15 text-accent-teal text-[10px] font-extrabold flex items-center justify-center shrink-0">
                                  #{idx + 1}
                                </span>
                                <span className="text-surface-400 font-mono text-[10px]">
                                  {formatEventDateTime(c.time)}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-surface-800 text-surface-300 font-mono text-[10px] uppercase">
                                  {c.targetTag || 'CLICK'}
                                </span>
                                <span className="text-white font-bold">
                                  &ldquo;{c.targetText}&rdquo;
                                </span>
                                {c.section && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-800 text-surface-400 border border-surface-700">
                                    {c.section}
                                  </span>
                                )}
                              </div>

                              <div className="text-[10px] text-surface-500 font-mono shrink-0">
                                path: {c.path || '/'}
                                {c.coords && ` (${c.coords.x}, ${c.coords.y})`}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* View 1b: Spy & Security Alerts Feed */}
      {subTab === 'alerts' && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-surface-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Real-Time Spy, Agent Trap &amp; Security Alerts</span>
              </h3>
              <p className="text-[11px] text-surface-400 mt-0.5">
                Logs DevTools / View Source shortcuts (F12, Ctrl+U), blocked right-clicks, copied page text, unauthorized /admin probes, and silent Agent Trap Link registrations.
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30">
              {securityAlerts.length} events
            </span>
          </div>

          {securityAlerts.length === 0 ? (
            <div className="p-10 text-center">
              <Shield className="w-8 h-8 text-emerald-400/60 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">No suspicious inspect or spy activity yet</p>
              <p className="text-xs text-surface-400 mt-1">
                Whenever any visitor or agent attempts F12/Ctrl+U/Right-Click/Copy or opens a Trap Link, it will appear here instantly.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-surface-800/70">
              {securityAlerts.map((alert: any) => {
                const actionMeta = formatSecurityActionLabel(alert.action);
                const roleMeta = getRoleBadgeMeta(alert.actorRole, alert.linkedAgentName);
                return (
                  <div
                    key={alert.id}
                    className="p-3.5 hover:bg-surface-900/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${actionMeta.colorClass}`}>
                          {actionMeta.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${roleMeta.badgeClass}`}>
                          <span>{roleMeta.emoji}</span>
                          <span>{roleMeta.label}</span>
                        </span>
                        {alert.detail && (
                          <code className="px-2 py-0.5 rounded bg-surface-800 text-surface-200 border border-surface-700 text-[10px]">
                            {alert.detail}
                          </code>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-surface-400 flex-wrap">
                        <span>{alert.flag || '🌐'} {alert.city}, {alert.country}</span>
                        <span>•</span>
                        <span className="font-mono text-surface-300">IP: {alert.ip}</span>
                        <span>•</span>
                        <span>{alert.deviceType} • {alert.os} • {alert.browser}</span>
                        <span>•</span>
                        <code className="text-[10px] text-surface-300">{alert.path}</code>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <span className="text-[11px] text-surface-400 whitespace-nowrap">
                        {formatEventDateTime(alert.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleTagActor(alert, 'agent')}
                        className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-bold cursor-pointer"
                      >
                        Agent
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTagActor(alert, 'spy')}
                        className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10px] font-bold cursor-pointer"
                      >
                        Spy
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTagActor(alert, 'customer')}
                        className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View 2: Live Click Stream (Raw) */}
      {subTab === 'clicks' && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-surface-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MousePointerClick className="w-4 h-4 text-emerald-400" />
                <span>Live Real-Time Click Log</span>
              </h3>
              <p className="text-[11px] text-surface-400">
                Every single button, link, or card clicked across the site in chronological order.
              </p>
            </div>
            <span className="badge-teal text-[10px] font-bold">
              {recentClicks.length} Recent Clicks
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-900/80 text-surface-400 text-[10px] uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4">Visitor & Location</th>
                  <th className="py-2.5 px-4">What Was Clicked</th>
                  <th className="py-2.5 px-4">Section / Container</th>
                  <th className="py-2.5 px-4">Page Path</th>
                  <th className="py-2.5 px-4">Device & OS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {recentClicks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-surface-500">
                      No clicks recorded in this time range.
                    </td>
                  </tr>
                ) : (
                  recentClicks.map((clk: any) => (
                    <tr key={clk.id} className="hover:bg-surface-800/40 transition">
                      <td className="py-2.5 px-4 whitespace-nowrap text-surface-400 font-mono text-[11px]">
                        {formatEventDateTime(clk.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{clk.flag || '🌐'}</span>
                          <span className="font-semibold text-white">{clk.city ? `${clk.city}, ` : ''}{clk.country}</span>
                        </div>
                        <p className="text-[10px] font-mono text-surface-500">IP: {clk.ip}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-surface-800 text-[9px] uppercase font-mono text-surface-300">
                            {clk.targetTag || 'CLICK'}
                          </span>
                          <span className="font-bold text-white">
                            &ldquo;{clk.targetText}&rdquo;
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-800 text-surface-300 border border-surface-700">
                          {clk.section || 'General'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px] text-surface-400">
                        {clk.path || '/'}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-surface-300 text-[11px]">
                        <span className="font-medium text-white">{clk.os}</span>
                        <span className="text-surface-500 block text-[10px]">{clk.browser}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 3: Top Clicked Targets */}
      {subTab === 'top' && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-teal" />
            <span>Most Clicked Elements Ranking (Click Heatmap)</span>
          </h3>
          <p className="text-xs text-surface-400 mb-4">
            Ranked list of what visitors click on the site most frequently.
          </p>

          {topClicks.length === 0 ? (
            <p className="text-xs text-surface-500 text-center py-6">No click data yet</p>
          ) : (
            <div className="space-y-2.5">
              {topClicks.map((tc: any, index: number) => {
                const maxCount = topClicks[0]?.clicksCount || 1;
                const pct = Math.round((tc.clicksCount / maxCount) * 100);

                return (
                  <div
                    key={index}
                    className="p-3 rounded-xl bg-surface-900/70 border border-surface-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                          index === 0
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : index === 1
                            ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30'
                            : index === 2
                            ? 'bg-amber-700/20 text-amber-500 border border-amber-700/30'
                            : 'bg-surface-800 text-surface-400'
                        }`}>
                          #{index + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>&ldquo;{tc.targetText}&rdquo;</span>
                            <span className="text-[9px] font-mono px-1 rounded bg-surface-800 text-surface-400 uppercase">
                              {tc.targetTag}
                            </span>
                          </p>
                          <p className="text-[10px] text-surface-400">
                            Section: <span className="text-surface-300">{tc.section}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-extrabold text-emerald-400">
                          {tc.clicksCount} clicks
                        </span>
                        <span className="text-[10px] text-surface-500 block">
                          {tc.uniqueVisitorsCount} unique visitors
                        </span>
                      </div>
                    </div>

                    {/* Relative Progress Bar */}
                    <div className="w-full bg-surface-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-accent-teal to-emerald-400 h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View 4: Geo & Device Analytics */}
      {subTab === 'geo' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Countries Breakdown */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              <span>Visitors by Country</span>
            </h3>
            <div className="space-y-2">
              {!geoStats.countries || geoStats.countries.length === 0 ? (
                <p className="text-xs text-surface-500">No geo data yet</p>
              ) : (
                geoStats.countries.map((c: any) => (
                  <div key={c.countryCode} className="p-2.5 rounded-xl bg-surface-900/60 border border-surface-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{c.flag}</span>
                      <div>
                        <p className="text-xs font-bold text-white">{c.country}</p>
                        <p className="text-[10px] text-surface-400">{c.percentage}% of traffic</p>
                      </div>
                    </div>
                    <span className="badge-teal text-xs font-bold px-2 py-0.5">
                      {c.count} Visits
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cities Breakdown */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>Visitors by City</span>
            </h3>
            <div className="space-y-2">
              {!geoStats.cities || geoStats.cities.length === 0 ? (
                <p className="text-xs text-surface-500">No city data yet</p>
              ) : (
                geoStats.cities.map((ct: any, i: number) => (
                  <div key={i} className="p-2.5 rounded-xl bg-surface-900/60 border border-surface-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">{ct.city || 'Unknown'}</p>
                      <p className="text-[10px] text-surface-400">{ct.country}</p>
                    </div>
                    <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-surface-800">
                      {ct.count} Visits
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Device Types Breakdown */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              <span>Device Types</span>
            </h3>
            <div className="space-y-2">
              {deviceStats.deviceTypes?.map((dt: any) => (
                <div key={dt.name} className="p-2.5 rounded-xl bg-surface-900/60 border border-surface-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{dt.name}</span>
                  <span className="text-xs text-surface-300 font-semibold">{dt.count} ({dt.percent}%)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Browsers & OS Breakdown */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <span>Browsers & In-App Environments</span>
            </h3>
            <div className="space-y-2">
              {deviceStats.browserStats?.map((b: any) => (
                <div key={b.name} className="p-2.5 rounded-xl bg-surface-900/60 border border-surface-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{b.name}</span>
                  <span className="text-xs text-surface-300 font-semibold">{b.count} ({b.percent}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
