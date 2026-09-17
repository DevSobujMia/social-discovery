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

function isAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(window.navigator.userAgent);
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
    if (typeof window === 'undefined') return;

    if ((window as any).__pwaInstallPrompt) {
      setDeferred((window as any).__pwaInstallPrompt);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      (window as any).__pwaInstallPrompt = event;
      setDeferred(event as BeforeInstallPromptEvent);
    };

    const onPromptReady = () => {
      if ((window as any).__pwaInstallPrompt) {
        setDeferred((window as any).__pwaInstallPrompt);
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('heartlink:pwa-prompt-ready', onPromptReady);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('heartlink:pwa-prompt-ready', onPromptReady);
    };
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
    const delay = softTeaser ? 400 : 1000;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [armed, forceVisible, softTeaser]);

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
    const promptEvent =
      deferred ||
      (typeof window !== 'undefined'
        ? ((window as any).__pwaInstallPrompt as BeforeInstallPromptEvent | undefined)
        : null);

    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (typeof window !== 'undefined') (window as any).__pwaInstallPrompt = null;
        setDeferred(null);
        setVisible(false);
        if (choice.outcome === 'dismissed') dismiss();
        return;
      } catch {
        // Fall back to guide if prompt was invalidated
      }
    }
    setShowIOSGuide(true);
  }, [deferred, dismiss]);

  if (!visible) return null;

  const who = senderName?.trim() || 'She';
  const ios = isIOS();
  const android = isAndroid();

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
                {android ? 'Install on Android' : ios ? 'Add to Home Screen' : 'Install City Host'}
              </h3>
              <p className="text-xs text-surface-400 mt-1">
                {android
                  ? 'Add City Host to your home screen for 1-click access and reply alerts.'
                  : ios
                  ? 'iPhone needs Share → Add to Home Screen in Safari.'
                  : 'Install City Host app for instant chat and notifications.'}
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
                {android ? (
                  <>
                    Tap <span className="font-bold text-white text-sm">⋮</span> (Menu) in top-right of your browser
                  </>
                ) : ios ? (
                  <>
                    Tap <Share className="w-4 h-4 text-brand-400" /> <span className="font-semibold text-white">Share</span> in Safari
                  </>
                ) : (
                  <>
                    Click the <Download className="w-4 h-4 text-brand-400" /> <span className="font-semibold text-white">Install</span> icon in browser address bar
                  </>
                )}
              </span>
            </li>
            <li className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/70 border border-surface-700/60">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <span className="text-xs text-surface-200 flex items-center gap-1.5">
                {android ? (
                  <>
                    Choose <Plus className="w-4 h-4 text-brand-400" /> <span className="font-semibold text-white">Install app</span> or <span className="font-semibold text-white">Add to Home screen</span>
                  </>
                ) : ios ? (
                  <>
                    Choose <Plus className="w-4 h-4 text-brand-400" /> <span className="font-semibold text-white">Add to Home Screen</span>
                  </>
                ) : (
                  <>
                    Click <span className="font-semibold text-white">Install</span>
                  </>
                )}
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

  if (softTeaser || compact) {
    return (
      <button
        type="button"
        onClick={install}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-900 border border-surface-700 hover:border-brand-500/40 transition cursor-pointer text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Download className="w-3.5 h-3.5 text-brand-400 shrink-0" />
          <span className="text-xs font-semibold text-white truncate">
            One click install this app
          </span>
        </span>
        <span className="text-[10px] font-bold text-brand-300 shrink-0">Install</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:max-w-xs z-50">
      <div className="glass-card px-3 py-2 flex items-center gap-2 border-brand-500/40">
        <Download className="w-4 h-4 text-brand-300 shrink-0" />
        <p className="flex-1 min-w-0 text-xs font-semibold text-white truncate">
          {senderName ? `${who} replied — ` : ''}One click install this app
        </p>
        <button
          onClick={install}
          className="shrink-0 text-[10px] font-bold text-brand-300 hover:text-brand-200 cursor-pointer"
        >
          Install
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-surface-500 hover:text-white cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
