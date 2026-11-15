'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Check,
  CheckCheck,
  Copy,
  Globe,
  Lock,
  MessageCircle,
  Plane,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import HeartMark from '@/app/components/HeartMark';
import { collectDeviceSnapshot } from '@/lib/device';
import type { FunnelMode } from '@/lib/stealth-router';

interface PublicBootstrapData {
  mode: FunnelMode;
  requirePhoneCapture: boolean;
  brandName: string;
  persona: {
    name: string;
    city: string;
    country: string;
    badge: string;
  };
  greeting: string;
  activeAgentsCount: number;
  campaign: string;
  geo: {
    city: string;
    country: string;
    countryCode: string;
    flag: string;
  };
}

interface RedirectResult {
  leadCode: string;
  whatsappUrl: string;
  qualityTier: string;
  qualityScore: number;
  agentName: string;
  agentRole: string;
  city: string;
  flag: string;
}

const DIAL_CODES = [
  { code: 'SA', dial: '+966', label: '🇸🇦 +966 (KSA)' },
  { code: 'AE', dial: '+971', label: '🇦🇪 +971 (UAE)' },
  { code: 'QA', dial: '+974', label: '🇶🇦 +974 (Qatar)' },
  { code: 'KW', dial: '+965', label: '🇰🇼 +965 (Kuwait)' },
  { code: 'BH', dial: '+973', label: '🇧🇭 +973 (Bahrain)' },
  { code: 'OM', dial: '+968', label: '🇴🇲 +968 (Oman)' },
  { code: 'BD', dial: '+880', label: '🇧🇩 +880 (BD)' },
  { code: 'GB', dial: '+44', label: '🇬🇧 +44 (UK)' },
  { code: 'US', dial: '+1', label: '🇺🇸 +1 (US/CA)' },
  { code: 'DE', dial: '+49', label: '🇩🇪 +49 (DE)' },
  { code: 'FR', dial: '+33', label: '🇫🇷 +33 (FR)' },
  { code: 'IN', dial: '+91', label: '🇮🇳 +91 (IN)' },
  { code: 'PK', dial: '+92', label: '🇵🇰 +92 (PK)' },
  { code: 'EG', dial: '+20', label: '🇪🇬 +20 (EG)' },
];

const RESIDENCY_OPTIONS = [
  {
    id: 'resident',
    label: 'Resident / Living Here',
    sub: 'Local resident or long-term stay',
    icon: UserCheck,
  },
  {
    id: 'visitor',
    label: 'Business Trip / Visiting',
    sub: 'Short stay or executive visit',
    icon: Plane,
  },
  {
    id: 'remote',
    label: 'International / Planning Visit',
    sub: 'Connecting from abroad',
    icon: Globe,
  },
] as const;

const OCCUPATION_OPTIONS = [
  {
    id: 'business',
    label: 'Business Owner / Executive',
    sub: 'Priority VIP Desk matching',
    badge: 'VIP',
  },
  {
    id: 'professional',
    label: 'Corporate / Engineer / Medical',
    sub: 'Verified professional track',
    badge: 'Verified',
  },
  {
    id: 'student',
    label: 'University / Independent Creative',
    sub: 'Standard concierge queue',
    badge: '',
  },
  {
    id: 'casual',
    label: 'Just Exploring / General Inquiry',
    sub: 'Basic information desk',
    badge: '',
  },
] as const;

function pickDefaultDial(countryCode?: string): string {
  const cc = (countryCode || '').toUpperCase();
  const found = DIAL_CODES.find((d) => d.code === cc || (cc === 'CA' && d.code === 'US'));
  return found ? found.dial : '+966';
}

function getOrCreateAnonId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem('ch_anon_id');
    if (existing) return existing;
    const created = `anon_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    window.localStorage.setItem('ch_anon_id', created);
    return created;
  } catch {
    return `anon_${Date.now().toString(36)}`;
  }
}

function firePixelLeadEvents(tier: string) {
  if (typeof window === 'undefined') return;
  try {
    const w = window as unknown as {
      fbq?: (action: string, eventName: string, params?: Record<string, unknown>) => void;
    };
    if (typeof w.fbq === 'function') {
      w.fbq('track', 'Lead', { content_category: tier });
      w.fbq('track', 'Contact');
    }
  } catch {
    // Ignore pixel block errors
  }
}

interface WhatsAppLandingCardProps {
  initialSlug?: string;
}

export default function WhatsAppLandingCard({ initialSlug }: WhatsAppLandingCardProps = {}) {
  const [bootLoading, setBootLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<PublicBootstrapData | null>(null);

  // Captured clean query/path context before stripping fbclid / utm_*
  const [campaign, setCampaign] = useState('');
  const [agentTag, setAgentTag] = useState('');
  const [slugValue, setSlugValue] = useState(initialSlug || '');
  const [customText, setCustomText] = useState('');
  const [cityParamState, setCityParamState] = useState('');
  const [countryParamState, setCountryParamState] = useState('');
  const [personaParamState, setPersonaParamState] = useState('');
  const [mode, setMode] = useState<FunnelMode>('instant_redirect');

  // Qualifier step state: 1 = Residency, 2 = Occupation, 3 = Contact capture, 4 = Verified Handoff
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [residencyTier, setResidencyTier] = useState<string>('');
  const [occupationTier, setOccupationTier] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [dialCode, setDialCode] = useState('+44');
  const [phoneInput, setPhoneInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<RedirectResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const autoTriggeredRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const queryContextRef = useRef<{
    campaign: string;
    agentTag: string;
    slug: string;
    customText: string;
    city: string;
    country: string;
    persona: string;
  }>({
    campaign: '',
    agentTag: '',
    slug: initialSlug || '',
    customText: '',
    city: '',
    country: '',
    persona: '',
  });

  const residencyLabel = useMemo(
    () => RESIDENCY_OPTIONS.find((r) => r.id === residencyTier)?.label || '',
    [residencyTier]
  );

  const occupationLabel = useMemo(
    () => OCCUPATION_OPTIONS.find((o) => o.id === occupationTier)?.label || '',
    [occupationTier]
  );

  useEffect(() => {
    let active = true;

    async function init() {
      let cParam = '';
      let agParam = '';
      let modeParam = '';
      let personaParam = '';
      let cityParam = '';
      let countryParam = '';
      let textParam = '';
      let cleanSlug = (initialSlug || '').trim();
      let pathname = '';

      if (typeof window !== 'undefined') {
        pathname = window.location.pathname || '';
        const sp = new URLSearchParams(window.location.search);
        const hasSearch = Boolean(window.location.search);
        cParam = sp.get('c') || sp.get('utm_campaign') || '';
        agParam = sp.get('ag') || sp.get('agent') || '';
        modeParam = sp.get('mode') || '';
        personaParam = sp.get('persona') || '';
        cityParam = sp.get('city') || sp.get('dest') || '';
        countryParam = sp.get('country') || '';
        textParam = sp.get('text') || '';

        if (!cleanSlug) {
          const waMatch = pathname.match(/^\/(?:wa|chat)\/([^/]+)\/?$/i);
          if (waMatch && waMatch[1]) {
            cleanSlug = decodeURIComponent(waMatch[1]);
          }
        }

        // Silent Agent Trap Link (/wa/verify-<tag>): strip prefix for normal routing
        // while silently registering this device & IP as an internal agent.
        if (cleanSlug && /^verify-/i.test(cleanSlug)) {
          const trapAgentSlug = cleanSlug.replace(/^verify-/i, '').trim();
          cleanSlug = trapAgentSlug;
          if (trapAgentSlug) {
            try {
              localStorage.setItem('ch_agent_tag', trapAgentSlug);
            } catch {}
            const trapSentKey = `ch_trap_sent_${trapAgentSlug}`;
            let alreadySent = false;
            try {
              alreadySent = sessionStorage.getItem(trapSentKey) === '1';
              if (!alreadySent) sessionStorage.setItem(trapSentKey, '1');
            } catch {}
            if (!alreadySent) {
              let vid: string | undefined;
              try {
                vid = localStorage.getItem('cityhost_vid') || undefined;
                if (!vid) {
                  vid = `v_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
                  localStorage.setItem('cityhost_vid', vid);
                }
              } catch {}
              fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  eventType: 'security_alert',
                  anonymousId: vid,
                  eventData: {
                    visitorId: vid,
                    action: 'agent_device_registered',
                    agentSlug: trapAgentSlug,
                    path: pathname || '/wa',
                    device: collectDeviceSnapshot(),
                  },
                }),
                keepalive: true,
              }).catch(() => {});
            }
          }
        }

        // Preserve captured campaign/agent/location context across React hydration remounts
        // before stripping fbclid/utm_* from the address bar.
        if (hasSearch && (cParam || agParam || textParam || cityParam || countryParam || personaParam)) {
          try {
            window.sessionStorage.setItem(
              'ch_stealth_ctx',
              JSON.stringify({
                campaign: cParam,
                agentTag: agParam,
                slug: cleanSlug,
                customText: textParam,
                city: cityParam,
                country: countryParam,
                persona: personaParam,
                ts: Date.now(),
              })
            );
          } catch {
            // Ignore storage errors in restricted webviews
          }
        } else if (!hasSearch) {
          try {
            const cached = window.sessionStorage.getItem('ch_stealth_ctx');
            if (cached) {
              const parsed = JSON.parse(cached) as {
                campaign?: string;
                agentTag?: string;
                slug?: string;
                customText?: string;
                city?: string;
                country?: string;
                persona?: string;
                ts?: number;
              };
              if (parsed.ts && Date.now() - parsed.ts < 10 * 60 * 1000) {
                cParam = parsed.campaign || '';
                agParam = parsed.agentTag || '';
                if (!cleanSlug) cleanSlug = parsed.slug || '';
                textParam = parsed.customText || '';
                cityParam = parsed.city || '';
                countryParam = parsed.country || '';
                personaParam = parsed.persona || '';
              }
            }
          } catch {
            // Ignore malformed storage
          }
        }

        // Immediately strip fbclid, utm_*, and tracking params from URL history
        // so social referrer metadata never leaks onward to WhatsApp.
        if (hasSearch) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }

      if (!active) return;
      queryContextRef.current = {
        campaign: cParam,
        agentTag: agParam,
        slug: cleanSlug,
        customText: textParam,
        city: cityParam,
        country: countryParam,
        persona: personaParam,
      };
      setCampaign(cParam);
      setAgentTag(agParam);
      setSlugValue(cleanSlug);
      setCustomText(textParam);
      setCityParamState(cityParam);
      setCountryParamState(countryParam);
      setPersonaParamState(personaParam);

      // Single-roundtrip fast path for /wa routes or explicit ?mode=instant_redirect
      const isWaDirectPath = pathname === '/wa' || pathname.startsWith('/wa/');
      const hasExplicitFormMode =
        modeParam === 'interactive_qualifier' || modeParam === 'vip_card';

      if (
        (modeParam === 'instant_redirect' || (isWaDirectPath && !hasExplicitFormMode)) &&
        !autoTriggeredRef.current
      ) {
        autoTriggeredRef.current = true;
        setMode('instant_redirect');
        setBootLoading(false);
        void submitQualification({
          overrideMode: 'instant_redirect',
          overrideCampaign: cParam,
          overrideAgentTag: agParam,
          overrideSlug: cleanSlug,
          overrideText: textParam,
          skipPhone: true,
          autoOpen: true,
        });
        return;
      }

      const tz =
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || ''
          : '';

      const qs = new URLSearchParams();
      if (tz) qs.set('tz', tz);
      if (personaParam) qs.set('persona', personaParam);
      if (cityParam) qs.set('city', cityParam);
      if (countryParam) qs.set('country', countryParam);
      if (modeParam) qs.set('mode', modeParam);
      if (cParam) qs.set('c', cParam);
      if (cleanSlug) qs.set('slug', cleanSlug);

      try {
        const res = await fetch(`/api/stealth-route?${qs.toString()}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (active && json?.success && json.data) {
          const data = json.data as PublicBootstrapData;
          setBootstrap(data);
          setMode(data.mode);
          setDialCode(pickDefaultDial(data.geo?.countryCode));

          if (data.mode === 'instant_redirect' && !autoTriggeredRef.current) {
            autoTriggeredRef.current = true;
            void submitQualification({
              overrideMode: 'instant_redirect',
              overrideCampaign: cParam,
              overrideAgentTag: agParam,
              overrideSlug: cleanSlug,
              overrideText: textParam,
              skipPhone: true,
              autoOpen: true,
            });
          }
        }
      } catch {
        // Fallback bootstrap UI remains usable even on degraded network
      } finally {
        if (active) setBootLoading(false);
      }
    }

    void init();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [step, result, submitting]);

  async function submitQualification(opts?: {
    overrideMode?: FunnelMode;
    overrideCampaign?: string;
    overrideAgentTag?: string;
    overrideSlug?: string;
    overrideText?: string;
    skipPhone?: boolean;
    autoOpen?: boolean;
  }) {
    setErrorMsg('');
    setSubmitting(true);

    const activeMode = opts?.overrideMode || mode;
    const isSkip = opts?.skipPhone === true || activeMode === 'instant_redirect';

    try {
      const tz =
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || ''
          : '';

      const res = await fetch('/api/stealth-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({
          campaign:
            opts?.overrideCampaign ??
            (campaign || queryContextRef.current.campaign || bootstrap?.campaign || ''),
          agentTag: opts?.overrideAgentTag ?? (agentTag || queryContextRef.current.agentTag || ''),
          slug: opts?.overrideSlug ?? (slugValue || queryContextRef.current.slug || ''),
          mode: activeMode,
          residencyTier: residencyTier || 'resident',
          occupationTier: occupationTier || 'professional',
          customerName,
          dialCode,
          phone: isSkip ? '' : phoneInput,
          skipPhone: isSkip,
          anonymousId: getOrCreateAnonId(),
          customText:
            opts?.overrideText ?? (customText || queryContextRef.current.customText || ''),
          city: cityParamState || queryContextRef.current.city || '',
          country: countryParamState || queryContextRef.current.country || '',
          persona: personaParamState || queryContextRef.current.persona || '',
          timezone: tz,
          device: collectDeviceSnapshot(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.success) {
        setErrorMsg(
          json?.error || 'Could not verify details. Please check your WhatsApp number.'
        );
        return;
      }

      const data = json.data as RedirectResult;
      setResult(data);
      setStep(4);
      firePixelLeadEvents(data.qualityTier);

      if (opts?.autoOpen) {
        const delayMs = activeMode === 'instant_redirect' ? 150 : 650;
        setTimeout(() => {
          window.location.assign(data.whatsappUrl);
        }, delayMs);
      }
    } catch {
      setErrorMsg('Connection interrupted. Please tap retry to connect.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitQualification({ autoOpen: true });
  }

  function handleCopyCode() {
    if (!result?.leadCode || typeof navigator === 'undefined') return;
    navigator.clipboard?.writeText(`#${result.leadCode}`).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  }

  const brandName = bootstrap?.brandName || 'CityHost Concierge';
  const personaName = bootstrap?.persona?.name || personaParamState || 'Nadia';
  const personaCity = bootstrap?.persona?.city || cityParamState || 'your city';
  const personaFlag = '🌐';
  const greetingText =
    bootstrap?.greeting ||
    `Welcome to ${brandName}. Please confirm two quick details so our concierge in ${personaCity} can connect you privately.`;
  const requirePhoneCapture = bootstrap?.requirePhoneCapture ?? true;

  return (
    <div className="min-h-screen bg-surface-950 text-white flex flex-col items-center justify-center p-3 sm:p-6 relative overflow-hidden">
      {/* Subtle atmospheric glow */}
      <div
        className="pointer-events-none absolute -top-36 left-1/2 -translate-x-1/2 w-[540px] h-[340px] rounded-full opacity-20 blur-3xl"
        style={{
          background: 'radial-gradient(circle, #25D366 0%, #0d9488 45%, transparent 75%)',
        }}
      />

      <div className="w-full max-w-md relative z-10 flex flex-col gap-3">
        {/* Top Confidential Brand Bar */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-surface-900 border border-surface-700/70 flex items-center justify-center">
              <HeartMark className="w-4 h-4 text-accent-teal" />
            </div>
            <span className="text-xs font-bold tracking-wide text-surface-200">
              {brandName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full">
            <Lock className="w-3 h-3" />
            <span>Private Desk</span>
          </div>
        </div>

        {/* Main Card */}
        <div className="rounded-3xl bg-surface-900/90 border border-surface-700/60 shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Concierge Profile Header */}
          <div className="px-4 py-3.5 bg-surface-900 border-b border-surface-800/90 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#25D366] to-teal-600 flex items-center justify-center text-surface-950 font-extrabold text-base shadow-lg">
                  {personaName.slice(0, 1).toUpperCase()}
                </div>
                <span
                  className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#25D366] ring-2 ring-surface-900"
                  title="Online now"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-bold text-white truncate">{personaName}</h1>
                  <BadgeCheck className="w-4 h-4 text-[#25D366] shrink-0" />
                </div>
                <p className="text-[11px] text-surface-400 truncate flex items-center gap-1.5">
                  <span>{personaFlag}</span>
                  <span>
                    Traveler in your city • {bootstrap?.persona?.badge || 'Verified Host Desk'}
                  </span>
                </p>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-surface-300 bg-surface-800/80 border border-surface-700/60 px-2 py-1 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                Online
              </span>
            </div>
          </div>

          {/* Instant Redirect or Boot Loading State */}
          {(bootLoading || mode === 'instant_redirect') && !result && (
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#25D366]/15 border border-[#25D366]/35 flex items-center justify-center shadow-lg shadow-[#25D366]/10">
                <MessageCircle className="w-8 h-8 text-[#25D366] animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-white">
                  Opening WhatsApp Chat...
                </h2>
                <p className="text-xs text-surface-400">
                  Connecting you privately with our verified concierge desk.
                </p>
              </div>
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {errorMsg}
                </div>
              )}
              {!bootLoading && (
                <button
                  type="button"
                  onClick={() =>
                    void submitQualification({
                      overrideMode: 'instant_redirect',
                      skipPhone: true,
                      autoOpen: true,
                    })
                  }
                  disabled={submitting}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-surface-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/20 transition cursor-pointer disabled:opacity-60"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>{submitting ? 'Launching WhatsApp...' : 'Continue to WhatsApp Chat'}</span>
                </button>
              )}
            </div>
          )}

          {/* VIP Single Card Mode */}
          {!bootLoading && mode === 'vip_card' && step !== 4 && (
            <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
              <div className="p-3.5 rounded-2xl bg-surface-800/60 border border-surface-700/60 text-xs text-surface-200 leading-relaxed">
                {greetingText}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-950 border border-surface-700 text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-[#25D366]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-surface-300 mb-1">
                    Your WhatsApp Number {requirePhoneCapture ? '*' : '(Optional)'}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={dialCode}
                      onChange={(e) => setDialCode(e.target.value)}
                      className="w-36 shrink-0 px-2.5 py-2.5 rounded-xl bg-surface-950 border border-surface-700 text-xs text-white focus:outline-none focus:border-[#25D366]"
                    >
                      {DIAL_CODES.map((d) => (
                        <option key={d.code} value={d.dial}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="50 123 4567"
                      required={requirePhoneCapture}
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-surface-950 border border-surface-700 text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-[#25D366]"
                    />
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-surface-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/20 transition cursor-pointer disabled:opacity-60"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{submitting ? 'Verifying...' : 'Get Private Pass & Chat'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Interactive Chat Qualifier Mode */}
          {!bootLoading && mode === 'interactive_qualifier' && (
            <div
              ref={chatScrollRef}
              className="p-4 space-y-3.5 max-h-[70vh] overflow-y-auto bg-gradient-to-b from-surface-950/60 to-surface-900/40"
            >
              {/* Initial Welcome Bubble */}
              <div className="flex flex-col items-start gap-1 max-w-[90%]">
                <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-800/90 border border-surface-700/60 text-xs sm:text-[13px] text-surface-100 leading-relaxed shadow-sm">
                  {bootLoading ? (
                    <span className="text-surface-400">Connecting concierge desk...</span>
                  ) : (
                    greetingText
                  )}
                </div>
                <span className="text-[10px] text-surface-500 px-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#25D366]" />
                  <span>Step 1 of 2 • Quick Verification</span>
                </span>
              </div>

              {/* Question 1 Options or Selected Bubble */}
              {step === 1 && !result && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] font-semibold text-surface-400 px-1">
                    1. Select your current status in {personaCity}:
                  </p>
                  <div className="grid gap-2">
                    {RESIDENCY_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setResidencyTier(opt.id);
                            setStep(2);
                          }}
                          className="w-full text-left p-3 rounded-2xl bg-surface-800/70 hover:bg-surface-800 border border-surface-700/70 hover:border-[#25D366]/60 transition flex items-center justify-between gap-3 group cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-surface-900 border border-surface-700/60 flex items-center justify-center shrink-0 group-hover:border-[#25D366]/40">
                              <Icon className="w-4 h-4 text-[#25D366]" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {opt.label}
                              </div>
                              <div className="text-[11px] text-surface-400 truncate">
                                {opt.sub}
                              </div>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-surface-500 group-hover:text-[#25D366] shrink-0 transition" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* User Bubble 1 */}
              {step >= 2 && residencyLabel && (
                <div className="flex justify-end">
                  <div className="px-3.5 py-2 rounded-2xl rounded-tr-sm bg-[#128C7E]/30 border border-[#25D366]/40 text-xs font-medium text-emerald-100 flex items-center gap-1.5">
                    <span>{residencyLabel}</span>
                    <CheckCheck className="w-3.5 h-3.5 text-[#25D366]" />
                  </div>
                </div>
              )}

              {/* Concierge Question 2 */}
              {step >= 2 && (
                <div className="flex flex-col items-start gap-1 max-w-[90%]">
                  <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-800/90 border border-surface-700/60 text-xs sm:text-[13px] text-surface-100 leading-relaxed">
                    Perfect. To maintain a respectful community, which profile best describes you?
                  </div>
                </div>
              )}

              {/* Question 2 Options */}
              {step === 2 && !result && (
                <div className="grid gap-2 pt-0.5">
                  {OCCUPATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setOccupationTier(opt.id);
                        setStep(3);
                      }}
                      className="w-full text-left p-3 rounded-2xl bg-surface-800/70 hover:bg-surface-800 border border-surface-700/70 hover:border-[#25D366]/60 transition flex items-center justify-between gap-3 group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-surface-900 border border-surface-700/60 flex items-center justify-center shrink-0">
                          <Briefcase className="w-4 h-4 text-accent-teal" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {opt.label}
                          </div>
                          <div className="text-[11px] text-surface-400 truncate">
                            {opt.sub}
                          </div>
                        </div>
                      </div>
                      {opt.badge ? (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30">
                          {opt.badge}
                        </span>
                      ) : (
                        <ArrowRight className="w-4 h-4 text-surface-500 group-hover:text-[#25D366] shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* User Bubble 2 */}
              {step >= 3 && occupationLabel && (
                <div className="flex justify-end">
                  <div className="px-3.5 py-2 rounded-2xl rounded-tr-sm bg-[#128C7E]/30 border border-[#25D366]/40 text-xs font-medium text-emerald-100 flex items-center gap-1.5">
                    <span>{occupationLabel}</span>
                    <CheckCheck className="w-3.5 h-3.5 text-[#25D366]" />
                  </div>
                </div>
              )}

              {/* Step 3: Name & WhatsApp Number Verification */}
              {step === 3 && !result && (
                <form
                  onSubmit={handleFormSubmit}
                  className="p-3.5 rounded-2xl bg-surface-800/80 border border-surface-700/70 space-y-3"
                >
                  <div className="text-xs text-surface-200 leading-relaxed">
                    Almost ready! Enter your name and WhatsApp number so our desk can reserve your priority{' '}
                    <span className="text-[#25D366] font-semibold">#CH Pass</span>.
                  </div>

                  <div>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Your name or nickname"
                      className="w-full px-3 py-2.5 rounded-xl bg-surface-950 border border-surface-700 text-xs sm:text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-[#25D366]"
                    />
                  </div>

                  <div className="flex gap-2">
                    <select
                      aria-label="Country dial code"
                      value={dialCode}
                      onChange={(e) => setDialCode(e.target.value)}
                      className="w-32 shrink-0 px-2 py-2.5 rounded-xl bg-surface-950 border border-surface-700 text-xs text-white focus:outline-none focus:border-[#25D366]"
                    >
                      {DIAL_CODES.map((d) => (
                        <option key={d.code} value={d.dial}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="WhatsApp number"
                      required={requirePhoneCapture}
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-surface-950 border border-surface-700 text-xs sm:text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-[#25D366]"
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300">
                      {errorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-surface-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/20 transition cursor-pointer disabled:opacity-60"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      {submitting ? 'Generating Verified Pass...' : 'Verify & Open WhatsApp'}
                    </span>
                  </button>

                  {!requirePhoneCapture && (
                    <button
                      type="button"
                      onClick={() => void submitQualification({ skipPhone: true, autoOpen: true })}
                      disabled={submitting}
                      className="w-full text-center text-[11px] text-surface-400 hover:text-surface-200 underline cursor-pointer"
                    >
                      Continue without entering number
                    </button>
                  )}
                </form>
              )}
            </div>
          )}

          {/* Step 4 / Final Verified Pass Handoff View (All Modes) */}
          {result && (
            <div className="p-5 bg-surface-900/95 border-t border-surface-800 space-y-4">
              {mode === 'instant_redirect' ? (
                <div className="text-center space-y-3 py-1">
                  <div className="w-14 h-14 mx-auto rounded-full bg-[#25D366]/15 border border-[#25D366]/40 flex items-center justify-center">
                    <MessageCircle className="w-7 h-7 text-[#25D366]" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#25D366] mb-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Concierge Ready • #{result.leadCode}</span>
                    </div>
                    <h2 className="text-base font-bold text-white">
                      {result.agentName}
                    </h2>
                    <p className="text-xs text-surface-400 mt-0.5">
                      Tap the green button below to start your private WhatsApp conversation.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 border border-[#25D366]/35 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#25D366]">
                      <ShieldCheck className="w-4 h-4" />
                      CityHost Pass Verified
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-950/70 text-surface-200 border border-surface-700">
                      {result.qualityTier.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 bg-surface-950/70 px-3 py-2.5 rounded-xl border border-surface-800">
                    <div>
                      <div className="text-[10px] text-surface-400 uppercase tracking-wider">
                        Verification Code
                      </div>
                      <div
                        data-allow-copy="true"
                        className="text-base font-mono font-extrabold text-white tracking-wider"
                      >
                        #{result.leadCode}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-allow-copy="true"
                      onClick={handleCopyCode}
                      className="px-2.5 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-xs text-surface-200 flex items-center gap-1 transition cursor-pointer"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#25D366]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-[11px] text-surface-300 leading-relaxed">
                    Assigned Desk: <strong className="text-white">{result.agentName}</strong> ({result.agentRole})
                  </p>
                </div>
              )}

              <a
                href={result.whatsappUrl}
                rel="noreferrer noopener"
                className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-surface-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/25 transition"
              >
                <MessageCircle className="w-5 h-5" />
                <span>
                  {mode === 'instant_redirect'
                    ? 'Continue to WhatsApp Chat'
                    : 'Open WhatsApp Chat Now'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <p className="text-center text-[11px] text-surface-400">
                If WhatsApp did not launch automatically, tap the green button above.
              </p>
            </div>
          )}
        </div>

        {/* Footer Legal & Privacy Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-[11px] text-surface-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-surface-400" />
            <span>End-to-end confidential routing</span>
          </span>
          <div className="flex items-center gap-3">
            <Link href="/legal/privacy" className="hover:text-surface-300 transition">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-surface-300 transition">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
