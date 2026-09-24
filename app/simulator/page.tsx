'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Smartphone,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Send,
  Eye,
  CheckCircle2,
  Clock,
  MessageSquare,
  Users,
  MapPin,
  ChevronRight,
  ArrowLeft,
  Copy,
  Check,
  Globe,
  Sliders
} from 'lucide-react';
import { AdMockup, type AdFormat, type AdHook, type AdPlatform } from './components/AdMockups';
import { publishChatSync } from '@/lib/chat-sync';

interface ModelOption {
  displayName: string;
  age: number;
  city: string;
  country: string;
  photo: string;
  userId: string;
  bio?: string;
  gender?: string | null;
}

function isFemaleModel(m: { gender?: string | null; displayName?: string }) {
  const g = (m.gender || '').toLowerCase();
  if (g === 'male') return false;
  if (g === 'female') return true;
  // Defaults and unnamed API rows: ads never show men.
  return true;
}

const DEFAULT_MODELS: ModelOption[] = [
  {
    displayName: 'Emma',
    age: 26,
    city: 'Dubai',
    country: 'United Arab Emirates',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
    userId: 'emma_default',
    bio: 'Traveling to Dubai soon for shopping, architecture & rooftop sunsets! Looking for a friendly partner.',
  },
  {
    displayName: 'Alina',
    age: 24,
    city: 'Paris',
    country: 'France',
    photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80',
    userId: 'alina_default',
    bio: 'Heading to Paris next month. Passionate about art museums, cafes, and city strolls.',
  },
  {
    displayName: 'Maya',
    age: 27,
    city: 'Bangkok',
    country: 'Thailand',
    photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=80',
    userId: 'maya_default',
    bio: 'Excited to explore Bangkok night markets and temples. Ready to meet fellow wanderers!',
  },
  {
    displayName: 'Elena',
    age: 25,
    city: 'Rome',
    country: 'Italy',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&auto=format&fit=crop&q=80',
    userId: 'elena_default',
    bio: 'Planning a trip to Rome and Florence. Italian food, history, and great conversations.',
  },
];

const POPULAR_CITIES = [
  { city: 'Dubai', country: 'United Arab Emirates' },
  { city: 'Bangkok', country: 'Thailand' },
  { city: 'Paris', country: 'France' },
  { city: 'Rome', country: 'Italy' },
  { city: 'Tokyo', country: 'Japan' },
  { city: 'London', country: 'United Kingdom' },
  { city: 'Bali', country: 'Indonesia' },
  { city: 'New York', country: 'United States' },
];

function canScrollY(node: HTMLElement, deltaY: number) {
  const overflowY = window.getComputedStyle(node).overflowY;
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false;
  if (node.scrollHeight <= node.clientHeight + 1) return false;
  if (deltaY < 0 && node.scrollTop > 0) return true;
  if (deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
  return false;
}

function wheelConsumedByInnerScroll(start: EventTarget | null, stopAt: ParentNode | null, deltaY: number) {
  let node: HTMLElement | null = start instanceof HTMLElement ? start : null;
  while (node && node !== stopAt && node !== document.body && node !== document.documentElement) {
    if (canScrollY(node, deltaY)) return true;
    node = node.parentElement;
  }
  return false;
}

export default function AdsSimulatorPage() {
  const [platform, setPlatform] = useState<AdPlatform>('instagram');
  const [format, setFormat] = useState<AdFormat>('stories');
  const [hook, setHook] = useState<AdHook>('in_town');
  const [selectedCity, setSelectedCity] = useState('Dubai');
  const [selectedCountry, setSelectedCountry] = useState('United Arab Emirates');
  const [availableModels, setAvailableModels] = useState<ModelOption[]>(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(DEFAULT_MODELS[0]);
  const [campaignName, setCampaignName] = useState('dubai_in_town_women');
  
  // Simulator View State: 'ad_preview' or 'live_journey'
  const [viewState, setViewState] = useState<'ad_preview' | 'live_journey'>('ad_preview');
  const [iframeKey, setIframeKey] = useState(1);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const phoneFrameRef = useRef<HTMLDivElement>(null);
  const landingIframeRef = useRef<HTMLIFrameElement>(null);

  // Admin Observer / Telemetry state
  const [adminLeads, setAdminLeads] = useState<any[]>([]);
  const [adminConversations, setAdminConversations] = useState<any[]>([]);
  const [operatorReplyText, setOperatorReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replySuccessToast, setReplySuccessToast] = useState<string | null>(null);

  // Let the document own mouse-wheel on this long desktop page
  useEffect(() => {
    document.documentElement.classList.add('simulator-page');
    document.body.classList.add('simulator-page');
    return () => {
      document.documentElement.classList.remove('simulator-page');
      document.body.classList.remove('simulator-page');
    };
  }, []);

  // Phone chrome / ad mockup used to eat wheel events (overflow-y-auto).
  // Forward unused wheel to the page so desktop mouse scroll feels normal.
  useEffect(() => {
    const frame = phoneFrameRef.current;
    if (!frame) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (target?.closest('iframe')) return;
      if (wheelConsumedByInnerScroll(e.target, frame, e.deltaY)) return;
      e.preventDefault();
      window.scrollBy({ top: e.deltaY, left: e.deltaX });
    };

    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [viewState]);

  // Same-origin landing iframe also traps wheel even when its app is overflow:hidden.
  useEffect(() => {
    if (viewState !== 'live_journey') return;
    const iframe = landingIframeRef.current;
    if (!iframe) return;

    let attachedWin: Window | null = null;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const doc = iframe.contentDocument;
      if (!doc) return;
      if (wheelConsumedByInnerScroll(e.target, doc.documentElement, e.deltaY)) return;
      e.preventDefault();
      window.scrollBy({ top: e.deltaY, left: e.deltaX });
    };

    const attach = () => {
      const win = iframe.contentWindow;
      if (!win || attachedWin === win) return;
      if (attachedWin) attachedWin.removeEventListener('wheel', onWheel);
      attachedWin = win;
      win.addEventListener('wheel', onWheel, { passive: false });
    };

    iframe.addEventListener('load', attach);
    attach();
    return () => {
      iframe.removeEventListener('load', attach);
      attachedWin?.removeEventListener('wheel', onWheel);
    };
  }, [viewState, iframeKey]);

  // Fetch real discoverable models from API to enhance selection
  useEffect(() => {
    async function loadModels() {
      try {
        const res = await fetch('/api/profiles?gender=female&limit=20');
        const data = await res.json();
        if (data.success && Array.isArray(data.data?.profiles) && data.data.profiles.length > 0) {
          const mapped: ModelOption[] = data.data.profiles
            .map((p: any) => ({
              displayName: p.displayName || 'Traveler',
              age: p.age || 26,
              city: p.city || 'Dubai',
              country: p.country || 'United Arab Emirates',
              photo: p.photo || p.photos?.[0]?.filePath || DEFAULT_MODELS[0].photo,
              userId: p.userId || p.id,
              bio: p.bio,
              gender: p.gender,
            }))
            .filter(isFemaleModel);
          if (mapped.length) {
            setAvailableModels(mapped);
            setSelectedModel(mapped[0]);
          }
        }
      } catch {
        // Fall back to DEFAULT_MODELS
      }
    }
    loadModels();
  }, []);

  // Poll recent admin leads and conversations for live observer
  const adminTelemetryDeadRef = useRef(false);
  const refreshAdminTelemetry = useCallback(async () => {
    if (adminTelemetryDeadRef.current) return;
    try {
      // 1. Fetch CRM Leads
      const leadsRes = await fetch('/api/admin/users?stage=all&limit=8', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (leadsRes.status === 401) {
        adminTelemetryDeadRef.current = true;
        return;
      }
      const leadsData = await leadsRes.json();
      if (leadsData.success && Array.isArray(leadsData.data?.users)) {
        setAdminLeads(leadsData.data.users);
      }

      // 2. Fetch Conversations
      const convRes = await fetch('/api/admin/conversations', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (convRes.status === 401) {
        adminTelemetryDeadRef.current = true;
        return;
      }
      const convData = await convRes.json();
      if (convData.success && Array.isArray(convData.data?.conversations)) {
        setAdminConversations(convData.data.conversations);
      }
    } catch {
      // Non-critical telemetry poll
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshAdminTelemetry();
    }, 0);
    const interval = setInterval(refreshAdminTelemetry, 3500);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [refreshAdminTelemetry]);

  // Compute realistic target landing URL
  const targetLandingUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set('utm_source', platform);
    params.set(
      'utm_medium',
      format === 'stories' ? 'stories' : format === 'reels' || platform === 'tiktok' ? 'reels' : 'feed'
    );
    params.set('utm_campaign', campaignName || 'travel_partners');
    params.set('utm_content', `${selectedCity.toLowerCase()}_${hook}`);
    params.set('city', selectedCity);
    params.set('g', 'female');
    return `/?${params.toString()}`;
  }, [platform, format, hook, campaignName, selectedCity]);

  const handleCopyUrl = () => {
    if (typeof window !== 'undefined') {
      const fullUrl = `${window.location.origin}${targetLandingUrl}`;
      navigator.clipboard.writeText(fullUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleStartJourney = () => {
    setViewState('live_journey');
    setIframeKey((prev) => prev + 1);
  };

  const handleResetJourney = () => {
    setViewState('ad_preview');
    setIframeKey((prev) => prev + 1);
  };

  // Operator Send Quick Reply
  const handleOperatorReply = async (convId: string) => {
    if (!operatorReplyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/admin/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: operatorReplyText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setOperatorReplyText('');
        setReplySuccessToast('Reply delivered to customer screen in real time! ✨');
        setTimeout(() => setReplySuccessToast(null), 3500);
        refreshAdminTelemetry();
        publishChatSync({
          type: 'conversation_updated',
          conversationId: convId,
          preview: operatorReplyText.trim(),
          source: 'staff',
        });
      }
    } catch {
      // ignore
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 text-surface-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-surface-800 bg-surface-900/90 backdrop-blur-md sticky top-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Admin</span>
            </Link>
            <div className="h-4 w-px bg-surface-750" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-500 to-accent-teal flex items-center justify-center text-white shadow-md">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white flex items-center gap-1.5">
                  Real Ads & Customer Journey Simulator
                  <span className="px-2 py-0.5 rounded-full bg-brand-500/20 border border-brand-500/40 text-[10px] text-brand-300 font-semibold uppercase">
                    Interactive
                  </span>
                </h1>
                <p className="text-[11px] text-surface-400">
                  Experience ads from customer perspective & monitor live Admin CRM telemetry
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshAdminTelemetry}
              className="px-2.5 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Refresh Telemetry"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <Link
              href={targetLandingUrl}
              target="_blank"
              className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
            >
              <span>Open in New Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Interactive Controls & Workspace */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6 flex-1 flex flex-col">
        {/* Campaign Configuration Toolbar */}
        <div className="rounded-2xl border border-surface-800 bg-surface-900/60 p-4 backdrop-blur-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Platform Selector */}
          <div>
            <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1.5">
              1. Social Platform
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-surface-950 rounded-xl border border-surface-800">
              {(['instagram', 'facebook', 'tiktok'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPlatform(p);
                    if (p === 'tiktok') setFormat('reels');
                    if (p === 'facebook') setFormat('feed');
                    if (p === 'instagram') setFormat('stories');
                  }}
                  className={`py-1.5 text-xs font-bold rounded-lg capitalize transition cursor-pointer ${
                    platform === p
                      ? 'bg-brand-500 text-white shadow'
                      : 'text-surface-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Destination City */}
          <div>
            <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1.5">
              2. Target Destination
            </label>
            <select
              value={selectedCity}
              onChange={(e) => {
                const found = POPULAR_CITIES.find((c) => c.city === e.target.value);
                setSelectedCity(e.target.value);
                if (found) setSelectedCountry(found.country);
              }}
              className="w-full py-2 px-3 bg-surface-950 rounded-xl border border-surface-800 text-xs text-white font-medium focus:border-brand-500 outline-none"
            >
              {POPULAR_CITIES.map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city} ({c.country})
                </option>
              ))}
            </select>
          </div>

          {/* Target Profile */}
          <div>
            <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1.5">
              3. Featured Traveler Profile
            </label>
            <select
              value={selectedModel.displayName}
              onChange={(e) => {
                const found = availableModels.find((m) => m.displayName === e.target.value);
                if (found) setSelectedModel(found);
              }}
              className="w-full py-2 px-3 bg-surface-950 rounded-xl border border-surface-800 text-xs text-white font-medium focus:border-brand-500 outline-none"
            >
              {availableModels.map((m) => (
                <option key={m.userId} value={m.displayName}>
                  {m.displayName} ({m.age}) · visiting {selectedCity}
                </option>
              ))}
            </select>
          </div>

          {/* Campaign Tag */}
          <div>
            <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1.5">
              4. Campaign Name (UTM)
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full py-2 px-3 bg-surface-950 rounded-xl border border-surface-800 text-xs text-white font-mono focus:border-brand-500 outline-none"
              placeholder="e.g. summer_campaign_q3"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-surface-800 bg-surface-900/60 p-4 grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          <div>
            <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1.5">
              Placement (highest CTR first)
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-surface-950 rounded-xl border border-surface-800">
              {(
                [
                  { id: 'stories' as const, label: 'Stories', hint: 'Best' },
                  { id: 'reels' as const, label: 'Reels', hint: 'Scale' },
                  { id: 'feed' as const, label: 'Feed', hint: 'Cheap' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={platform === 'tiktok' && f.id !== 'reels'}
                  onClick={() => setFormat(f.id)}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition cursor-pointer disabled:opacity-30 ${
                    format === f.id
                      ? 'bg-white text-surface-950'
                      : 'text-surface-400 hover:text-white'
                  }`}
                >
                  {f.label}
                  <span className="block text-[9px] font-medium opacity-70">{f.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1.5">
              Winning hook
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-surface-950 rounded-xl border border-surface-800">
              {(
                [
                  { id: 'in_town' as const, label: 'In town' },
                  { id: 'say_hi' as const, label: 'Say hi' },
                  { id: 'dinner' as const, label: 'Dinner' },
                ] as const
              ).map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setHook(h.id)}
                  className={`py-2 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                    hook === h.id
                      ? 'bg-brand-500 text-white'
                      : 'text-surface-400 hover:text-white'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2.5 text-[11px] text-surface-300 leading-relaxed">
            <p className="font-bold text-emerald-300 mb-1">Ads show women only</p>
            Male travel profiles stay on the site — some visitors look for men. Creatives never use male photos.
          </div>
        </div>

        {/* Dynamic UTM Link Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl bg-surface-900/40 border border-surface-800/80 text-xs">
          <div className="flex items-center gap-2 overflow-hidden text-surface-300">
            <Globe className="w-3.5 h-3.5 text-accent-teal shrink-0" />
            <span className="font-semibold text-white shrink-0">Simulated URL:</span>
            <span className="font-mono text-[11px] text-accent-teal truncate max-w-xl">
              {targetLandingUrl}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="px-2.5 py-1 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer shrink-0"
          >
            {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedUrl ? 'Copied' : 'Copy Link'}</span>
          </button>
        </div>

        {/* Split-Screen Workspace: Customer Mobile View vs. Admin CRM Telemetry */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
          {/* ============================================================ */}
          {/* LEFT: CUSTOMER MOBILE VIEWPORT                                */}
          {/* ============================================================ */}
          <div className="lg:col-span-6 xl:col-span-5 flex flex-col items-center lg:sticky lg:top-20 lg:self-start">
            {/* Viewport Control Bar */}
            <div className="w-full max-w-[420px] flex items-center justify-between mb-3 px-2">
              <div className="flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-brand-400" />
                <span className="text-xs font-bold text-white">
                  {viewState === 'ad_preview' ? 'Step 1: Social Media Ad' : 'Step 2: Customer Landing'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {viewState === 'live_journey' ? (
                  <button
                    type="button"
                    onClick={handleResetJourney}
                    className="px-2.5 py-1 rounded-lg bg-surface-800 hover:bg-surface-700 text-xs font-semibold text-surface-300 hover:text-white transition cursor-pointer"
                  >
                    View Ad Mockup
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartJourney}
                    className="px-2.5 py-1 rounded-lg bg-brand-500 hover:bg-brand-400 text-xs font-bold text-white transition shadow cursor-pointer"
                  >
                    Click Ad & Enter
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIframeKey((k) => k + 1)}
                  className="p-1 rounded-lg text-surface-400 hover:text-white transition cursor-pointer"
                  title="Reload viewport"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Realistic Mobile Frame */}
            <div
              ref={phoneFrameRef}
              className="w-full max-w-[400px] h-[680px] sm:h-[720px] rounded-[42px] p-3 bg-gradient-to-b from-surface-700 via-surface-900 to-black shadow-2xl border-4 border-surface-700 relative overflow-hidden flex flex-col"
            >
              {/* Phone Camera Notch */}
              <div className="w-32 h-4.5 bg-black rounded-full mx-auto mb-2 shrink-0 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-surface-900/80 mr-3" />
                <div className="w-2 h-2 rounded-full bg-surface-950" />
              </div>

              {/* Viewport Screen Body */}
              <div className="w-full flex-1 min-h-0 rounded-[32px] overflow-hidden bg-surface-950 relative border border-surface-850">
                {viewState === 'ad_preview' ? (
                  <div className="w-full h-full overflow-hidden p-2 sm:p-3 flex items-center justify-center">
                    <div className="w-full origin-center scale-[0.92] sm:scale-100">
                      <AdMockup
                        platform={platform}
                        format={format}
                        hook={hook}
                        city={selectedCity}
                        country={selectedCountry}
                        targetProfile={selectedModel}
                        campaignName={campaignName}
                        onAdClick={handleStartJourney}
                      />
                    </div>
                  </div>
                ) : (
                  <iframe
                    key={iframeKey}
                    ref={landingIframeRef}
                    src={targetLandingUrl}
                    title="Customer Landing Funnel"
                    className="w-full h-full border-0"
                  />
                )}
              </div>

              {/* Phone Home Bar */}
              <div className="w-28 h-1 bg-surface-500 rounded-full mx-auto mt-2 shrink-0 opacity-40" />
            </div>

            <p className="text-[11px] text-surface-400 text-center mt-3 max-w-xs">
              {viewState === 'ad_preview'
                ? '👆 Tap the ad creative or CTA to simulate a real customer arriving from social media.'
                : '✨ Complete the match, submit your name, and test live chatting & the verification gate!'}
            </p>
          </div>

          {/* ============================================================ */}
          {/* RIGHT: REAL-TIME ADMIN CRM OBSERVER & TELEMETRY              */}
          {/* ============================================================ */}
          <div className="lg:col-span-6 xl:col-span-7 space-y-4">
            {/* Click-max playbook */}
            <div className="rounded-2xl border border-surface-800 bg-surface-900/70 p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">How to set ads for maximum clicks</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] leading-relaxed">
                <div className="p-3 rounded-xl bg-surface-950 border border-surface-800">
                  <p className="font-bold text-white mb-1">1. Placement</p>
                  Instagram Stories first, then Reels. Feed is cheaper but slower. One woman, close-up face, city in the first 1 second.
                </div>
                <div className="p-3 rounded-xl bg-surface-950 border border-surface-800">
                  <p className="font-bold text-white mb-1">2. Targeting</p>
                  Men 23–38, city + nearby, expats/travel interest. Language English. Do not mix genders in one ad set.
                </div>
                <div className="p-3 rounded-xl bg-surface-950 border border-surface-800">
                  <p className="font-bold text-white mb-1">3. Copy</p>
                  Specific &gt; generic. “She’s in Dubai this week” beats “find travel partners”. CTA: Say hi on City Host.
                </div>
                <div className="p-3 rounded-xl bg-surface-950 border border-surface-800">
                  <p className="font-bold text-white mb-1">4. Never</p>
                  No couples, no dating framing, no WhatsApp number on the creative.
                </div>
              </div>
            </div>

            {/* Direct WA vs site inbox */}
            <div className="rounded-2xl border border-surface-800 bg-surface-900/70 p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Click-to-WhatsApp vs site inbox</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] leading-relaxed">
                <div className="p-3 rounded-xl bg-surface-950 border border-amber-500/25">
                  <p className="font-bold text-amber-300 mb-1">Ads → WhatsApp / Telegram</p>
                  More clicks, cheaper CPC. Then: mixed chats, burned numbers, no UTM, no incomplete/complete, Meta policy risk, one agent drowning.
                </div>
                <div className="p-3 rounded-xl bg-surface-950 border border-emerald-500/30">
                  <p className="font-bold text-emerald-300 mb-1">Ads → City Host inbox (your setup)</p>
                  Slightly fewer clicks. Far less hassle: attribution, one CRM, verify on message 3, still collect WA after they chat. Best for small ads + scale.
                </div>
              </div>
              <p className="text-[11px] text-surface-400">
                Recommendation: keep the site inbox as the front door. Collect WhatsApp only after they already talked — quality over raw click volume.
              </p>
            </div>

            {/* Real-time Journey Progress Steps */}
            <div className="rounded-2xl border border-surface-800 bg-surface-900/70 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                    LIVE
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">End-to-End Funnel Architecture</h3>
                    <p className="text-[11px] text-surface-400">What happens behind the scenes from ad click to verified lead</p>
                  </div>
                </div>
                <Link
                  href="/admin"
                  className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1"
                >
                  <span>Open Full CRM</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {/* Step 1 */}
                <div className="p-3 rounded-xl bg-surface-950/80 border border-surface-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>1. Ad & Attribution</span>
                  </div>
                  <p className="text-surface-300 text-[11px] leading-relaxed">
                    Visitor taps ad on {platform}. UTM tags ({campaignName}) and edge geo location ({selectedCity}) are captured instantly.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-3 rounded-xl bg-surface-950/80 border border-surface-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-brand-400 font-bold text-[11px]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>2. Zero-Signup Chat</span>
                  </div>
                  <p className="text-surface-300 text-[11px] leading-relaxed">
                    Visitor submits name, conversation opens with {selectedModel.displayName}. Appears in Admin CRM as &quot;Incomplete Lead&quot;.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="p-3 rounded-xl bg-surface-950/80 border border-surface-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-sky-400 font-bold text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>3. Verified Gate (Msg 3)</span>
                  </div>
                  <p className="text-surface-300 text-[11px] leading-relaxed">
                    On 3rd message, verification prompts for WhatsApp/Phone. Once verified, lead completes with blue shield badge.
                  </p>
                </div>
              </div>
            </div>

            {/* Live Master Inbox & Real-Time Bidirectional Reply */}
            <div className="rounded-2xl border border-surface-800 bg-surface-900/70 p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-brand-400" />
                  <h3 className="text-sm font-bold text-white">Live Master Inbox (Operator View)</h3>
                </div>
                <span className="text-[11px] text-surface-400">
                  {adminConversations.length} Active Thread(s)
                </span>
              </div>

              {adminConversations.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-surface-800 rounded-xl bg-surface-950/40 text-xs text-surface-400">
                  No active conversations yet. Start a chat inside the mobile frame to see messages stream here in real time!
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Latest Conversation Card */}
                  {adminConversations.slice(0, 2).map((c) => (
                    <div
                      key={c.id}
                      className="p-3.5 rounded-xl bg-surface-950 border border-surface-800 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand-500/20 text-brand-400 font-bold text-xs flex items-center justify-center">
                            {c.customer?.displayName?.[0] || 'V'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-white">
                                {c.customer?.displayName || 'Ad Visitor'}
                              </span>
                              <span className="text-[10px] text-surface-400">→ talking to</span>
                              <span className="text-[11px] font-semibold text-brand-300">
                                {c.profile?.displayName || selectedModel.displayName}
                              </span>
                            </div>
                            <p className="text-[10px] text-surface-400">
                              City: {c.customer?.geoCity || selectedCity} · Stage: {c.customer?.leadStage || 'incomplete'}
                            </p>
                          </div>
                        </div>
                        {c.totalUnread > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-surface-950 text-[10px] font-bold">
                            {c.totalUnread} new
                          </span>
                        )}
                      </div>

                      <div className="p-2 rounded-lg bg-surface-900 border border-surface-800/80 text-xs text-surface-200 font-mono">
                        &quot;{c.lastMessage?.content || 'Customer joined chat'}&quot;
                      </div>

                      {/* Operator Quick Reply Action */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={operatorReplyText}
                          onChange={(e) => setOperatorReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleOperatorReply(c.id);
                          }}
                          placeholder={`Reply as ${c.profile?.displayName || selectedModel.displayName}...`}
                          className="flex-1 py-1.5 px-3 bg-surface-900 rounded-lg border border-surface-750 text-xs text-white outline-none focus:border-brand-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleOperatorReply(c.id)}
                          disabled={sendingReply || !operatorReplyText.trim()}
                          className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Reply</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {replySuccessToast && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{replySuccessToast}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live CRM Leads Telemetry Feed */}
            <div className="rounded-2xl border border-surface-800 bg-surface-900/70 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent-teal" />
                  <h3 className="text-sm font-bold text-white">Live CRM Leads Captured</h3>
                </div>
                <span className="text-[11px] text-surface-400">Latest 5 Leads</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 text-[10px] font-bold text-surface-400 uppercase tracking-wider">
                      <th className="py-2 px-2.5">Visitor</th>
                      <th className="py-2 px-2.5">Channel / Contact</th>
                      <th className="py-2 px-2.5">Stage</th>
                      <th className="py-2 px-2.5">UTM Campaign</th>
                      <th className="py-2 px-2.5">Badge</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/60">
                    {adminLeads.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-surface-500">
                          Waiting for incoming visitor traffic...
                        </td>
                      </tr>
                    ) : (
                      adminLeads.slice(0, 5).map((u) => {
                        const contact = u.whatsapp || u.phone || (u.telegram ? `@${u.telegram}` : null);
                        return (
                          <tr key={u.id} className="hover:bg-surface-850/50 transition">
                            <td className="py-2.5 px-2.5 font-bold text-white">
                              {u.profile?.displayName || u.email || 'Visitor'}
                              {u.age ? <span className="text-surface-400 font-normal ml-1">({u.age})</span> : ''}
                            </td>
                            <td className="py-2.5 px-2.5">
                              {contact ? (
                                <span className="font-mono text-[11px] text-sky-300">{contact}</span>
                              ) : (
                                <span className="text-surface-500 italic text-[11px]">Pending verification</span>
                              )}
                            </td>
                            <td className="py-2.5 px-2.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                  u.leadStage === 'complete'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {u.leadStage || 'incomplete'}
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 font-mono text-[11px] text-surface-400">
                              {u.utmAttributions?.[0]?.utmCampaign || campaignName}
                            </td>
                            <td className="py-2.5 px-2.5">
                              {u.isVerifiedLead ? (
                                <ShieldCheck className="w-4 h-4 text-sky-400" />
                              ) : (
                                <span className="text-surface-600">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
