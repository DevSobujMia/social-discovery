'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Share, X } from 'lucide-react';

/**
 * Home-screen install prompt.
 *
 * Timing is the whole trick. Asking on cold arrival gets refused.
 * Soft teaser can appear after a match (low pressure). Full toast arms
 * once they messaged or got a reply — that is when install converts.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'heartlink_install_dismissed';
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    iosStandalone === true
  );
}

function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return (
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
  );
}

function wasRecentlyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = parseInt(raw, 10);
    if (isNaN(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function InstallPrompt({
  armed,
  senderName,
  forceVisible = false,
  compact = false,
  softTeaser = false,
}: {
  /** Turn on once the lead has a reason to come back (message / reply). */
  armed: boolean;
  /** Whose reply arrived, used to make the copy concrete. */
  senderName?: string | null;
  /** Show inside verify modal regardless of reply timing. */
  forceVisible?: boolean;
  /** Inline card instead of floating toast. */
  compact?: boolean;
  /** Quieter match-page teaser — still one-click when Chromium allows. */
  softTeaser?: boolean;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // SW is registered globally via RegisterSW; keep a soft fallback here
    // for older bundles that only mount InstallPrompt.
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (navigator.serviceWorker.controller) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unavailable service worker only costs us installability.
    });
  }, []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  useEffect(() => {
    if (!armed && !forceVisible) return;
    if (isStandalone()) return;
    if (!forceVisible && wasRecentlyDismissed()) return;

    if (forceVisible) {
      setVisible(true);
      return;
    }

    // Soft teaser: show quickly on match page once SW/prompt is ready.
    // Full toast: wait a beat so it does not fight the chat UI.
    const delay = softTeaser ? 600 : 1200;
    if (deferred || isIOS() || softTeaser) {
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    }
  }, [armed, deferred, forceVisible, softTeaser]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setShowIOSGuide(false);
    if (forceVisible) return;
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Dismissal is a nicety; ignore storage failures.
    }
  }, [forceVisible]);

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      setVisible(false);
      if (choice.outcome === 'dismissed') dismiss();
      return;
    }
    setShowIOSGuide(true);
  }, [deferred, dismiss]);

  if (!visible) return null;

  const who = senderName?.trim() || 'She';

  if (showIOSGuide) {
    return (
      <div className={compact || softTeaser ? '' : 'modal-overlay'} onClick={compact || softTeaser ? undefined : dismiss}>
        <div
          className={`${compact || softTeaser ? 'rounded-2xl border border-surface-700 bg-surface-900 p-4' : 'modal-content max-w-sm w-full p-5'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-white">
                Add to Home Screen
              </h3>
              <p className="text-xs text-surface-400 mt-1">
                iPhone needs Share → Add to Home Screen. Then reply alerts work like an app.
              </p>
            </div>
            {!compact && !softTeaser && (
              <button
                onClick={dismiss}
                aria-label="Close"
                className="text-surface-400 hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <ol className="space-y-3">
            <li className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/70 border border-surface-700/60">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <span className="text-xs text-surface-200 flex items-center gap-1.5">
                Tap
                <Share className="w-4 h-4 text-brand-400" />
                <span className="font-semibold text-white">Share</span>
                in Safari
              </span>
            </li>
            <li className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/70 border border-surface-700/60">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <span className="text-xs text-surface-200 flex items-center gap-1.5">
                Choose
                <Plus className="w-4 h-4 text-brand-400" />
                <span className="font-semibold text-white">Add to Home Screen</span>
              </span>
            </li>
          </ol>

          <button
            onClick={dismiss}
            className="btn-secondary w-full py-2.5 text-xs font-semibold mt-4 cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  if (softTeaser) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-700/80 bg-surface-900/40 px-3.5 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <Download className="w-4 h-4 text-emerald-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white">Never miss a reply</p>
          <p className="text-[11px] text-surface-500 leading-snug mt-0.5">
            Install Heartlink — one tap on Android, Home Screen on iPhone.
          </p>
        </div>
        <button
          type="button"
          onClick={install}
          className="shrink-0 text-[11px] font-bold text-emerald-300 hover:text-emerald-200 px-2 py-1.5"
        >
          Install
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="rounded-2xl border border-surface-700 bg-surface-800/60 p-3.5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center shrink-0">
          <Download className="w-4 h-4 text-brand-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Install this app</p>
          <p className="text-[11px] text-surface-400 mt-0.5 leading-relaxed">
            One-tap home screen. Come back when she replies — free, no store.
          </p>
          <button
            type="button"
            onClick={install}
            className="mt-2.5 btn-secondary py-2 px-3 text-xs font-semibold cursor-pointer"
          >
            Install in one click
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:max-w-sm z-50">
      <div className="glass-card p-4 flex items-start gap-3 border-brand-500/40">
        <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-brand-300" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">
            {senderName ? `${who} replied` : 'Stay in the chat'}
          </p>
          <p className="text-xs text-surface-300 mt-0.5 leading-relaxed">
            Install Heartlink on your home screen — open in one tap when a reply lands.
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={install}
              className="btn-primary py-2 px-3.5 text-xs font-semibold cursor-pointer"
            >
              Install app
            </button>
            <button
              onClick={dismiss}
              className="btn-ghost py-2 px-2.5 text-xs cursor-pointer"
            >
              Not now
            </button>
          </div>
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-surface-500 hover:text-white cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
