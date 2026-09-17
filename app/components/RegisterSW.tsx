'use client';

import { useEffect } from 'react';

/**
 * Register the service worker and capture the PWA beforeinstallprompt event
 * as early as possible so 1-click install works reliably across all views.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Capture global PWA beforeinstallprompt
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      (window as any).__pwaInstallPrompt = event;
      window.dispatchEvent(new CustomEvent('heartlink:pwa-prompt-ready'));
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if ('serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      const register = () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            // Check for service worker updates immediately on page load
            reg.update().catch(() => {});
          })
          .catch(() => {
            // Installability is optional; never block the app.
          });
      };

      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  return null;
}

