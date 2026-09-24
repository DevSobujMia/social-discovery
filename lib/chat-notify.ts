/**
 * Browser / PWA chat alerts.
 *
 * Native Notification + the installed service worker, so a reply still
 * surfaces when the tab is in the background. Dedupes the same preview
 * so the inbox poll does not spam.
 */

const TAG_PREFIX = 'cityhost-chat-';
const lastShown = new Map<string, string>();

export async function ensureChatNotifyPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') {
    window.dispatchEvent(new CustomEvent('cityhost:sync-push'));
    return true;
  }
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      window.dispatchEvent(new CustomEvent('cityhost:sync-push'));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function chatNotifyPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function setChatAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const badge = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && badge.setAppBadge) {
      void badge.setAppBadge(count);
    } else if (badge.clearAppBadge) {
      void badge.clearAppBadge();
    }
  } catch {
    // Badge API is optional.
  }
}

function playPing(): void {
  if (typeof window === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    // Autoplay can be blocked until a tap.
  }
}

export function notifyIncomingChat(opts: {
  conversationId: string;
  title: string;
  body: string;
  viewingThisChat: boolean;
  url?: string;
  icon?: string | null;
}): void {
  if (typeof window === 'undefined') return;

  const viewing =
    opts.viewingThisChat && document.visibilityState === 'visible';
  if (viewing) return;

  const body = (opts.body || 'New message').trim() || 'New message';
  const prev = lastShown.get(opts.conversationId);
  if (prev === body) return;
  lastShown.set(opts.conversationId, body);

  playPing();

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const title = (opts.title || 'City Host').trim() || 'City Host';
  const url =
    opts.url || `/?tab=messenger&chat=${encodeURIComponent(opts.conversationId)}`;
  const icon = opts.icon || '/icon-192.png';

  const show = (reg?: ServiceWorkerRegistration | null) => {
    const options: any = {
      body: body.slice(0, 140),
      icon,
      badge: '/icon-192.png',
      tag: `${TAG_PREFIX}${opts.conversationId}`,
      renotify: true,
      silent: false,
      vibrate: [150, 80, 150],
      data: { url, conversationId: opts.conversationId },
      actions: [
        { action: 'reply', type: 'text', title: 'Reply', placeholder: 'Type a reply...' },
        { action: 'open', title: 'Open Chat' },
      ],
    };
    if (reg?.showNotification) {
      void reg.showNotification(title, options);
      return;
    }
    try {
      new Notification(title, options);
    } catch {
      // Some browsers only allow SW-backed notifications.
    }
  };

  if (navigator.serviceWorker?.ready) {
    void navigator.serviceWorker.ready.then((reg) => show(reg)).catch(() => show());
    return;
  }
  show();
}
