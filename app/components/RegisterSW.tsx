'use client';

import { useEffect } from 'react';

/**
 * Register the service worker as early as possible so installability and
 * offline shell work even before InstallPrompt mounts.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Installability is optional; never block the app.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
