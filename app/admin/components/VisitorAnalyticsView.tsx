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
} from 'lucide-react';

interface VisitorAnalyticsViewProps {
  adminFetch: (url: string, init?: RequestInit) => Promise<Response>;
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
  const [subTab, setSubTab] = useState<'journeys' | 'clicks' | 'top' | 'geo'>('journeys');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [expandedVisitors, setExpandedVisitors] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (range) params.set('range', range);
      if (search) params.set('search', search);

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
  }, [adminFetch, range, search]);

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
  const visitors = data?.visitors || [];
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

      {/* Sub-tabs & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-900/60 p-2.5 rounded-2xl border border-surface-800">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setSubTab('journeys')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
              subTab === 'journeys'
                ? 'bg-accent-teal/20 text-accent-teal border border-accent-teal/30 font-bold'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Visitor Journeys ({visitors.length})</span>
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
              return (
                <div
                  key={v.visitorId}
                  className="glass-card p-4 transition border border-surface-800 hover:border-surface-700 space-y-3"
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

                  {/* Device & Technical Specs */}
                  <div className="flex items-center gap-2 text-[11px] bg-surface-900/60 p-2.5 rounded-xl border border-surface-800/80 flex-wrap text-surface-300">
                    <span className="flex items-center gap-1 text-white font-semibold">
                      {v.deviceType === 'Mobile' ? <Smartphone className="w-3.5 h-3.5 text-indigo-400" /> : <Monitor className="w-3.5 h-3.5 text-sky-400" />}
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
