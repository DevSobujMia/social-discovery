'use client';

import { useEffect } from 'react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function syncPushSubscription(reg?: ServiceWorkerRegistration | null) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!('PushManager' in window) || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const swReg = reg || (await navigator.serviceWorker.ready);
    if (!swReg || !swReg.pushManager) return;

    const vapidKey =
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      'BBOjm0rqo1zAZmMX43AK6HW5-Moua8Khbbs-XLn_8OaDv0JWmteLFqDvcWbD42Ihbak6mEGRyW2Av0MMRIPHRvg';

    let sub = await swReg.pushManager.getSubscription();
    if (!sub) {
      sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    if (sub) {
      const userToken = localStorage.getItem('cityhost_user_token');
      const staffToken = localStorage.getItem('cityhost_staff_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (staffToken) headers['Authorization'] = `Bearer ${staffToken}`;
      else if (userToken) headers['Authorization'] = `Bearer ${userToken}`;

      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ subscription: sub }),
      });
    }
  } catch (err) {
    console.warn('[Push] Subscription sync failed:', err);
  }
}

/**
 * Register the service worker and capture the PWA beforeinstallprompt event
 * as early as possible so 1-click install works reliably across all views.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // In local development, never run SW or auto-reload to prevent interfering with Next.js HMR
    if (process.env.NODE_ENV !== 'production') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const reg of regs) {
            reg.unregister();
          }
        });
      }
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      (window as any).__pwaInstallPrompt = event;
      window.dispatchEvent(new CustomEvent('cityhost:pwa-prompt-ready'));
      window.dispatchEvent(new CustomEvent('heartlink:pwa-prompt-ready'));
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    const onSyncPush = () => {
      void syncPushSubscription();
    };
    window.addEventListener('cityhost:sync-push', onSyncPush);

    if ('serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      let registration: ServiceWorkerRegistration | null = null;
      let checkingVersion = false;

      const checkVersionAndAutoUpdate = async () => {
        if (checkingVersion) return;
        checkingVersion = true;
        try {
          const res = await fetch('/api/version', {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache, no-store' },
          });
          if (res.ok) {
            const data = await res.json();
            const serverVersion = data?.version;
            if (serverVersion) {
              const localVersion = localStorage.getItem('cityhost_app_version');
              if (!localVersion) {
                localStorage.setItem('cityhost_app_version', serverVersion);
              } else if (localVersion !== serverVersion) {
                // New deployment detected! Update stored version and purge caches
                localStorage.setItem('cityhost_app_version', serverVersion);
                if ('caches' in window) {
                  try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((k) => caches.delete(k)));
                  } catch {}
                }
                if (registration?.waiting) {
                  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                // Reload to load the latest HTML/JS/CSS assets immediately
                window.location.reload();
                return;
              }
            }
          }
        } catch {
          // Ignore offline/network hiccups
        } finally {
          checkingVersion = false;
        }
      };

      const checkUpdate = () => {
        if (registration) {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          registration.update().catch(() => {});
        }
        void checkVersionAndAutoUpdate();
        void syncPushSubscription(registration);
      };

      const register = () => {
        navigator.serviceWorker
          .register('/sw.js', { updateViaCache: 'none' })
          .then((reg) => {
            registration = reg;
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                });
              }
            });
            checkUpdate();
            void syncPushSubscription(reg);
          })
          .catch(() => {
            (window as any).__pwaSwError = true;
          });
      };

      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });

      // Immediate check on initial mount
      void checkVersionAndAutoUpdate();

      const onVis = () => {
        if (document.visibilityState === 'visible') checkUpdate();
      };
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('focus', checkUpdate);
      const timer = window.setInterval(checkUpdate, 30_000);

      return () => {
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
        window.removeEventListener('cityhost:sync-push', onSyncPush);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('focus', checkUpdate);
        window.clearInterval(timer);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('cityhost:sync-push', onSyncPush);
    };
  }, []);

  return null;
}

