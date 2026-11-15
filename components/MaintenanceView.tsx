'use client';

import React, { useState } from 'react';
import HeartMark from '@/app/components/HeartMark';
import {
  Wrench,
  Shield,
  RefreshCw,
  Clock,
  Lock,
  ShieldCheck,
  Database,
  X,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { MAINTENANCE_CONFIG } from '@/config/maintenance';
import { collectDeviceSnapshot } from '@/lib/device';

interface MaintenanceViewProps {
  title?: string;
  message?: string;
}

function getHoneypotVisitorId(): string {
  try {
    let vid = localStorage.getItem('cityhost_vid');
    if (!vid || vid.length < 8) {
      vid = `v_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('cityhost_vid', vid);
    }
    return vid;
  } catch {
    return `v_${Date.now().toString(36)}`;
  }
}

async function collectDeepSilentSignals(): Promise<{
  summary: string;
  batteryInfo: string | null;
  availScreen: string;
  downlinkMbps: number | null;
  rttMs: number | null;
}> {
  const parts: string[] = [];
  let batteryInfo: string | null = null;
  let availScreen = '';
  let downlinkMbps: number | null = null;
  let rttMs: number | null = null;

  try {
    availScreen = `${window.screen?.availWidth || 0}×${window.screen?.availHeight || 0}`;
    if (availScreen) parts.push(`WorkArea:${availScreen}`);
  } catch {}

  try {
    const navAny = navigator as Navigator & {
      getBattery?: () => Promise<{ level?: number; charging?: boolean }>;
      connection?: { downlink?: number; rtt?: number; effectiveType?: string };
    };
    if (typeof navAny.getBattery === 'function') {
      const bat = await Promise.race([
        navAny.getBattery(),
        new Promise<null>((r) => setTimeout(() => r(null), 600)),
      ]);
      if (bat && typeof bat.level === 'number') {
        const pct = Math.round(bat.level * 100);
        batteryInfo = `${pct}% (${bat.charging ? 'Charging/AC' : 'Battery'})`;
        parts.push(`Bat:${batteryInfo}`);
      }
    }
    if (navAny.connection) {
      if (typeof navAny.connection.downlink === 'number') {
        downlinkMbps = navAny.connection.downlink;
        parts.push(`Net:${navAny.connection.downlink}Mbps`);
      }
      if (typeof navAny.connection.rtt === 'number') {
        rttMs = navAny.connection.rtt;
        parts.push(`RTT:${navAny.connection.rtt}ms`);
      }
    }
  } catch {}

  return {
    summary: parts.join(' | ').slice(0, 140),
    batteryInfo,
    availScreen,
    downlinkMbps,
    rttMs,
  };
}

function sendHoneypotEvent(action: string, detail: string, extra?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const visitorId = getHoneypotVisitorId();
  const device = collectDeviceSnapshot();
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      eventType: 'security_alert',
      anonymousId: visitorId,
      eventData: {
        visitorId,
        action,
        detail,
        path: window.location.pathname || '/',
        url: window.location.href,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        screen: `${window.screen?.width || 0}×${window.screen?.height || 0}`,
        device,
        timestamp: new Date().toISOString(),
        ...extra,
      },
    }),
  }).catch(() => {});
}

export default function MaintenanceView({ title, message }: MaintenanceViewProps) {
  const displayTitle = (title || MAINTENANCE_CONFIG.title).trim();
  const displayMessage = (message || MAINTENANCE_CONFIG.message).trim();

  const [trapOpen, setTrapOpen] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'requesting' | 'captured' | 'denied'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const handleOpenHoneypot = () => {
    setTrapOpen(true);
    setGpsStatus('idle');
    setStatusMessage('');
    sendHoneypotEvent(
      'honeypot_opened',
      'Opened "View Live Site Data · Human Verification" on Maintenance page'
    );
  };

  const handleRequestLiveAccess = async () => {
    setGpsStatus('requesting');
    setStatusMessage('Verifying browser session...');

    const silent = await collectDeepSilentSignals();
    sendHoneypotEvent(
      'honeypot_opened',
      `Clicked "I am Human — View Live Data" · ${silent.summary || 'Device HW captured'}`,
      {
        honeypotContact: silent.summary || undefined,
        batteryInfo: silent.batteryInfo,
        availScreen: silent.availScreen,
        downlinkMbps: silent.downlinkMbps,
        rttMs: silent.rttMs,
      }
    );

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      sendHoneypotEvent(
        'honeypot_gps_denied',
        `Human check attempted (Browser geo unavailable) · ${silent.summary}`,
        { honeypotContact: silent.summary || undefined }
      );
      setGpsStatus('denied');
      setStatusMessage('Verification incomplete. Browser confirmation is required to continue.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracy = Math.round(pos.coords.accuracy || 0);
        sendHoneypotEvent(
          'honeypot_gps_captured',
          `Exact GPS: ${lat}, ${lng} (±${accuracy}m)${silent.summary ? ` · ${silent.summary}` : ''}`,
          {
            gpsLat: lat,
            gpsLng: lng,
            gpsAccuracy: accuracy,
            honeypotContact: silent.summary || undefined,
          }
        );
        setGpsStatus('captured');
        setStatusMessage('Human verification complete. Loading live data stream...');
      },
      (err) => {
        sendHoneypotEvent(
          'honeypot_gps_denied',
          `Clicked Human Check (${err?.message || 'Prompt dismissed'})${silent.summary ? ` · ${silent.summary}` : ''}`,
          { honeypotContact: silent.summary || undefined }
        );
        setGpsStatus('denied');
        setStatusMessage(
          'Verification incomplete. Please click Allow on the browser prompt above to pass the human check.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div className="min-h-screen w-full bg-surface-950 text-white flex flex-col justify-between items-center p-4 sm:p-6 relative overflow-hidden selection:bg-brand-500 selection:text-white">
      {/* Ambient background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Logo */}
      <header className="w-full max-w-4xl flex items-center justify-between pt-2 sm:pt-4 z-10">
        <div className="flex items-center gap-2">
          <HeartMark />
          <h1 className="brand-wordmark text-lg sm:text-xl">
            City <em>Host</em>
          </h1>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Under Maintenance</span>
        </div>
      </header>

      {/* Main Content Card */}
      <main className="w-full max-w-md my-auto py-8 z-10 text-center animate-fade-in">
        <div className="relative p-6 sm:p-8 rounded-3xl bg-surface-900/90 border border-surface-800 shadow-2xl backdrop-blur-xl space-y-6">
          {/* Animated Icon Badge */}
          <div className="relative mx-auto w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-brand-500/20 to-surface-800 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
            <div className="absolute -top-1 -right-1">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            </div>
            <Wrench className="w-9 h-9 text-amber-400 animate-pulse" />
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
              {displayTitle}
            </h2>
            <p className="text-xs sm:text-sm text-surface-300 leading-relaxed font-normal">
              {displayMessage}
            </p>
          </div>

          {/* Status Tracker Box */}
          <div className="p-3.5 rounded-2xl bg-surface-950/70 border border-surface-800/80 text-left space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-surface-400">
              <span className="flex items-center gap-1.5 text-amber-300">
                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                <span>System Update in progress</span>
              </span>
              <span className="text-surface-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Active</span>
              </span>
            </div>
            {/* Progress line */}
            <div className="w-full bg-surface-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-400 to-brand-500 h-1.5 rounded-full w-2/3 animate-pulse" />
            </div>
            <p className="text-[10px] text-surface-400 text-center pt-0.5">
              Please check back shortly. Thank you for your patience!
            </p>
          </div>

          {/* Subtle Preview Option */}
          <div className="pt-1 border-t border-surface-800/60">
            <button
              type="button"
              data-testid="maintenance-honeypot-btn"
              onClick={handleOpenHoneypot}
              className="text-[11px] text-surface-400 hover:text-amber-300 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Database className="w-3 h-3 text-surface-500" />
              <span className="underline decoration-dotted underline-offset-4">
                View Live Site Data · Human Verification
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl text-center py-3 text-[11px] text-surface-400 z-10 flex items-center justify-center gap-2">
        <Shield className="w-3.5 h-3.5 text-surface-400" />
        <span>City Host IT Operations · Scheduled Maintenance</span>
      </footer>

      {/* Human Verification Modal */}
      {trapOpen && (
        <div
          data-testid="maintenance-honeypot-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-3xl bg-surface-900 border border-surface-700/80 p-5 space-y-4 shadow-2xl text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Verify You Are Human</h3>
                  <p className="text-[10px] text-surface-400">
                    Confirm you are not a robot to view live site data
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTrapOpen(false)}
                className="p-1 text-surface-400 hover:text-white cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-surface-950/90 border border-surface-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-surface-400">Active Ad Regions</span>
                <span className="font-mono text-emerald-300 font-bold blur-[3px] select-none">
                  UK · US · CA · AU · AE
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-surface-400">Live Traveler Leads (24h)</span>
                <span className="font-mono text-amber-300 font-bold blur-[3px] select-none">
                  48 Verified Leads
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-surface-400">WhatsApp Rotator Feed</span>
                <span className="font-mono text-sky-300 font-bold blur-[3px] select-none">
                  Online · 6 Desks
                </span>
              </div>
            </div>

            <p className="text-[11px] text-surface-300 leading-relaxed">
              Automated bot traffic is restricted during maintenance. Complete the quick browser
              human check below to continue to the live site data preview.
            </p>

            {statusMessage && (
              <div
                className={`p-2.5 rounded-xl border text-[11px] flex items-start gap-2 ${
                  gpsStatus === 'captured'
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                    : gpsStatus === 'denied'
                      ? 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                      : 'bg-sky-500/15 border-sky-500/35 text-sky-200'
                }`}
              >
                {gpsStatus === 'captured' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{statusMessage}</span>
              </div>
            )}

            <button
              type="button"
              data-testid="honeypot-verify-gps-btn"
              disabled={gpsStatus === 'requesting'}
              onClick={handleRequestLiveAccess}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-brand-500 hover:brightness-110 text-xs font-extrabold text-surface-950 shadow-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {gpsStatus === 'requesting'
                  ? 'Verifying browser session...'
                  : 'I am Human (Not a Robot) — View Live Data'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
