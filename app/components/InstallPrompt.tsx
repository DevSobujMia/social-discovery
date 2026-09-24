'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Share, X, Check, Globe } from 'lucide-react';
import HeartMark from './HeartMark';

/**
 * City Host PWA Install & Home-Screen Shortcut System
 *
 * Rules:
 * 1. 1-Click direct install first: When clicked, immediately triggers native
 *    browser installation prompt without opening any intermediate modals.
 * 2. Automatic Detection: If the device/browser cannot install in 1 click
 *    (e.g. iOS Safari, In-App browser, or prompt dismissed/unavailable), the
 *    button dynamically updates to: "App didn't install? Click to add shortcut"
 * 3. 1-Tap Shortcut Action: Clicking "Add Shortcut" immediately triggers the native
 *    device shortcut system (iOS Share Sheet for Add to Home Screen, Chrome intent
 *    for in-app browsers, or direct browser shortcut).
 * 4. 100% English: No Bengali or foreign text anywhere.
 * 5. Standalone Awareness: If already installed, displays verified active state.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'cityhost_install_dismissed';
const CHAT_BANNER_DISMISS_KEY = 'cityhost_chat_banner_dismissed';
const CHAT_DISMISS_COOLDOWN_MS = 3.5 * 60 * 60 * 1000;
const GENERAL_DISMISS_DAYS = 7;

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    iosStandalone === true ||
    (typeof document !== 'undefined' && document.referrer?.includes('android-app://'))
  );
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return (
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
  );
}

export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(window.navigator.userAgent);
}

export function isInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /Instagram|FBAN|FBAV|FB_IAB|Facebook|Line\/|TikTok|Bytedance|Snapchat|WhatsApp/i.test(
    ua
  );
}

function wasRecentlyDismissed(key = DISMISS_KEY): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const at = parseInt(raw, 10);
    if (isNaN(at)) return false;
    const cooldown =
      key === CHAT_BANNER_DISMISS_KEY
        ? CHAT_DISMISS_COOLDOWN_MS
        : GENERAL_DISMISS_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - at < cooldown;
  } catch {
    return false;
  }
}

export default function InstallPrompt({
  armed = true,
  senderName,
  forceVisible = false,
  permanent = false,
  compact = false,
  bannerMode = false,
}: {
  armed?: boolean;
  senderName?: string | null;
  forceVisible?: boolean;
  permanent?: boolean;
  compact?: boolean;
  bannerMode?: boolean;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(permanent || forceVisible);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [shortcutNeeded, setShortcutNeeded] = useState(false);
  const [hintMessage, setHintMessage] = useState<string | null>(null);

  // Check standalone mode once on client
  const [isAlreadyInstalled, setIsAlreadyInstalled] = useState(false);
  useEffect(() => {
    setIsAlreadyInstalled(isStandalone());
  }, []);

  // Sync with global beforeinstallprompt event
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

    const onAppInstalled = () => {
      (window as any).__pwaInstallPrompt = null;
      setDeferred(null);
      setInstalled(true);
      setShortcutNeeded(false);
      setHintMessage('App installed successfully!');
      if (!permanent) {
        setTimeout(() => setVisible(false), 2500);
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('cityhost:pwa-prompt-ready', onPromptReady);
    window.addEventListener('heartlink:pwa-prompt-ready', onPromptReady);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('cityhost:pwa-prompt-ready', onPromptReady);
      window.removeEventListener('heartlink:pwa-prompt-ready', onPromptReady);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [permanent]);

  // Visibility logic
  useEffect(() => {
    if (permanent) {
      setVisible(true);
      return;
    }

    if (forceVisible) {
      setVisible(true);
      return;
    }

    if (!armed) {
      setVisible(false);
      return;
    }

    if (isStandalone()) {
      setVisible(false);
      return;
    }

    const dismissKey = bannerMode ? CHAT_BANNER_DISMISS_KEY : DISMISS_KEY;
    if (wasRecentlyDismissed(dismissKey)) {
      setVisible(false);
      return;
    }

    setVisible(true);
  }, [armed, forceVisible, bannerMode, permanent]);

  const dismiss = useCallback(() => {
    if (permanent) return;
    setVisible(false);
    const dismissKey = bannerMode ? CHAT_BANNER_DISMISS_KEY : DISMISS_KEY;
    try {
      window.localStorage.setItem(dismissKey, String(Date.now()));
    } catch {
      // ignore storage errors
    }
  }, [permanent, bannerMode]);

  /**
   * DIRECT 1-CLICK INSTALL:
   * First attempt native browser prompt immediately.
   * If native prompt is not available or rejected/unsupported,
   * automatically switch to shortcut mode so the user can add a home screen shortcut.
   */
  const handleInstallClick = useCallback(async () => {
    let promptEvent =
      deferred ||
      (typeof window !== 'undefined'
        ? ((window as any).__pwaInstallPrompt as BeforeInstallPromptEvent | undefined)
        : null);

    // If prompt hasn't arrived on desktop/Android, give it a tiny 250ms breath
    if (!promptEvent && typeof window !== 'undefined' && !isIOS() && !isInAppBrowser()) {
      setInstalling(true);
      await new Promise((resolve) => setTimeout(resolve, 250));
      promptEvent =
        (window as any).__pwaInstallPrompt as BeforeInstallPromptEvent | undefined;
      setInstalling(false);
    }

    // Direct 1-Click Native Install
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (typeof window !== 'undefined') (window as any).__pwaInstallPrompt = null;
        setDeferred(null);

        if (choice?.outcome === 'accepted') {
          setInstalled(true);
          setHintMessage('App installed successfully!');
          if (!permanent) setTimeout(() => setVisible(false), 2000);
          return;
        }

        // If user dismissed the prompt, switch to shortcut mode
        setShortcutNeeded(true);
        setHintMessage('Install canceled. Click "Add Shortcut" to add it to your home screen.');
        return;
      } catch (err) {
        console.warn('Direct prompt failed:', err);
      }
    }

    // Direct 1-click install is not supported on this device/browser (e.g. iOS Safari, In-App)
    // Seamlessly update to Shortcut mode
    setShortcutNeeded(true);

    // On iOS Safari, immediately trigger the native Share Sheet for frictionless action
    if (isIOS()) {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: 'City Host',
            text: 'City Host — Travellers visiting your city',
            url: window.location.href,
          });
          setHintMessage('In the share menu, tap "Add to Home Screen"');
          return;
        } catch {
          // User closed share sheet
        }
      }
      setHintMessage('Tap the Share icon [↑] below and select "Add to Home Screen"');
      return;
    }

    // On In-App Android browser, immediately launch real Chrome
    if (isInAppBrowser() && isAndroid()) {
      const host = typeof window !== 'undefined' ? window.location.host : 'cityhost.live';
      const path = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      const intentUrl = `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;end`;
      try {
        window.location.href = intentUrl;
        setHintMessage('Opening in Chrome to add shortcut...');
        return;
      } catch {}
    }

    setHintMessage('Click "Add Shortcut" below to add City Host to your home screen.');
  }, [deferred, permanent]);

  /**
   * ADD SHORTCUT ACTION:
   * Triggers device shortcut mechanisms directly without multi-step menus.
   */
  const handleShortcutClick = useCallback(async () => {
    // 1. If native prompt became available, try it
    const promptEvent =
      deferred ||
      (typeof window !== 'undefined'
        ? ((window as any).__pwaInstallPrompt as BeforeInstallPromptEvent | undefined)
        : null);

    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          setInstalled(true);
          setHintMessage('App installed successfully!');
          return;
        }
      } catch {}
    }

    // 2. iOS Safari: Native share sheet opens the Add to Home Screen action
    if (isIOS()) {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: 'City Host',
            text: 'City Host — Travellers visiting your city',
            url: window.location.href,
          });
          setHintMessage('In the share sheet, tap "Add to Home Screen"');
          return;
        } catch {}
      }
      setHintMessage('Tap Share [↑] in Safari, then tap "Add to Home Screen"');
      return;
    }

    // 3. Android In-App Browser: open in native Chrome
    if (isInAppBrowser() && isAndroid()) {
      const host = typeof window !== 'undefined' ? window.location.host : 'cityhost.live';
      const path = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      const intentUrl = `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;end`;
      try {
        window.location.href = intentUrl;
        setHintMessage('Opening in Chrome to add shortcut...');
        return;
      } catch {}
    }

    // 4. Android Chrome: guide to menu shortcut
    if (isAndroid()) {
      setHintMessage('Tap ⋮ (top right menu) and tap "Add to Home screen"');
      return;
    }

    // 5. Desktop Chrome / Edge
    if (typeof window !== 'undefined' && !isIOS() && !isAndroid()) {
      setHintMessage('Press Ctrl+D (Cmd+D on Mac) to bookmark, or click the install icon in the URL bar');
      return;
    }

    // 6. Generic Fallback: Copy link
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setHintMessage('Link copied! Open Chrome or Safari and tap "Add to Home screen"');
      }
    } catch {
      setHintMessage('Open in Chrome or Safari and select "Add to Home Screen"');
    }
  }, [deferred]);

  if (!visible) return null;

  // COMPACT INLINE CARD MODE (Profile Page - Single Clean Row)
  if (compact) {
    if (installed || isAlreadyInstalled) {
      return (
        <div className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-surface-900 border border-surface-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-white truncate">
              App installed on this device
            </span>
          </div>
          <span className="shrink-0 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/25">
            Installed
          </span>
        </div>
      );
    }

    return (
      <div className="w-full space-y-1.5">
        <div className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-surface-900 border border-surface-700/80 hover:border-brand-500/50 transition shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-brand-500/20 border border-brand-500/40 flex items-center justify-center shrink-0">
              <HeartMark className="w-4 h-4 text-brand-400" />
            </div>
            <p className="text-xs sm:text-sm font-semibold text-white truncate">
              {shortcutNeeded
                ? "App didn't install? Click here to add shortcut"
                : 'Install app in one click'}
            </p>
          </div>

          {shortcutNeeded ? (
            <button
              type="button"
              onClick={handleShortcutClick}
              className="shrink-0 text-[11px] font-bold text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 active:scale-95 px-3 py-1.5 rounded-lg shadow-md shadow-brand-500/30 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Shortcut</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleInstallClick}
              disabled={installing}
              className="shrink-0 text-[11px] font-bold text-brand-300 bg-brand-500/15 hover:bg-brand-500 hover:text-white active:scale-95 px-3 py-1.5 rounded-lg border border-brand-500/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{installing ? 'Opening...' : 'Install'}</span>
            </button>
          )}
        </div>

        {hintMessage && (
          <div className="px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-300 text-[11px] font-medium flex items-center justify-between gap-2 animate-fade-in">
            <span className="truncate">{hintMessage}</span>
            <button
              type="button"
              onClick={() => setHintMessage(null)}
              className="text-surface-400 hover:text-white p-0.5"
              aria-label="Close hint"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // TOP CHAT BANNER MODE (Chat Screen)
  if (bannerMode) {
    if (installed || isAlreadyInstalled) return null;

    return (
      <div className="w-full space-y-1 shrink-0 z-10 animate-fade-in">
        <div className="px-3 py-2 bg-gradient-to-r from-surface-950 via-surface-900 to-surface-950 border-b border-brand-500/30 flex items-center justify-between gap-2 text-xs shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-brand-500/20 border border-brand-500/40 flex items-center justify-center shrink-0">
              <HeartMark className="w-4 h-4 text-brand-400" />
            </div>
            <p className="text-white font-medium truncate text-[11px] sm:text-xs">
              {shortcutNeeded
                ? "App didn't install? Click here to add shortcut"
                : 'Install app for instant reply alerts & faster chat'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {shortcutNeeded ? (
              <button
                type="button"
                onClick={handleShortcutClick}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 active:scale-95 text-white font-bold text-[11px] transition cursor-pointer shadow-md shadow-brand-500/30 flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Shortcut</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={installing}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 active:scale-95 text-white font-bold text-[11px] transition cursor-pointer shadow-md shadow-brand-500/30 flex items-center gap-1 shrink-0 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{installing ? '...' : 'Install'}</span>
              </button>
            )}

            {!permanent && (
              <button
                type="button"
                onClick={dismiss}
                className="p-1 text-surface-400 hover:text-white rounded-lg transition cursor-pointer shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {hintMessage && (
          <div className="mx-3 px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-300 text-[11px] font-medium flex items-center justify-between gap-2 animate-fade-in">
            <span className="truncate">{hintMessage}</span>
            <button
              type="button"
              onClick={() => setHintMessage(null)}
              className="text-surface-400 hover:text-white p-0.5"
              aria-label="Close hint"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
