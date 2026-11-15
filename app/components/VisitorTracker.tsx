'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { collectDeviceSnapshot } from '@/lib/device';

const VISITOR_ID_KEY = 'cityhost_vid';
const SESSION_ID_KEY = 'cityhost_sid';

function getOrGenerateId(storage: Storage, key: string, prefix = 'v_'): string {
  try {
    let id = storage.getItem(key);
    if (!id || id.length < 8) {
      id = `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
      storage.setItem(key, id);
    }
    return id;
  } catch {
    return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Universal Visitor & Click Tracking Component for City Host
 *
 * Automatically records:
 * 1. Exact Page Views (device, screen, location hints, referrer, campaign)
 * 2. Every single interaction & click (what button, what text, where on page, coordinates, timestamp)
 */
export default function VisitorTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPath = useRef<string | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickTargetRef = useRef<string>('');

  useEffect(() => {
    // Exclude admin pages to prevent admin actions polluting customer analytics
    if (typeof window === 'undefined') return;
    if (pathname && (pathname.startsWith('/admin') || pathname.startsWith('/api/admin'))) return;

    const visitorId = getOrGenerateId(localStorage, VISITOR_ID_KEY, 'v_');
    const sessionId = getOrGenerateId(sessionStorage, SESSION_ID_KEY, 's_');
    const deviceSnapshot = collectDeviceSnapshot();

    // 1. PAGE VIEW EVENT
    const currentFullUrl = window.location.href;
    if (lastTrackedPath.current !== currentFullUrl) {
      lastTrackedPath.current = currentFullUrl;

      const utmData = {
        utm_source: searchParams.get('utm_source') || null,
        utm_medium: searchParams.get('utm_medium') || null,
        utm_campaign: searchParams.get('utm_campaign') || null,
        utm_content: searchParams.get('utm_content') || null,
        utm_term: searchParams.get('utm_term') || null,
        referrer: document.referrer || null,
        landing_page: currentFullUrl,
      };

      const adHints = {
        country: searchParams.get('c') || searchParams.get('country') || null,
        city: searchParams.get('city') || searchParams.get('dest') || null,
        gender: searchParams.get('g') || searchParams.get('gender') || null,
      };

      const pageViewPayload = {
        eventType: 'page_view',
        anonymousId: visitorId,
        utmCampaign: utmData.utm_campaign || undefined,
        utm: utmData,
        eventData: {
          visitorId,
          sessionId,
          url: currentFullUrl,
          path: pathname || '/',
          title: document.title,
          referrer: document.referrer || null,
          device: deviceSnapshot,
          screen: `${window.screen?.width || 0}×${window.screen?.height || 0}`,
          viewport: `${window.innerWidth}×${window.innerHeight}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
          language: navigator.language || null,
          adHints,
          timestamp: new Date().toISOString(),
        },
      };

      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageViewPayload),
        keepalive: true,
      }).catch(() => {});
    }

    // 2. UNIVERSAL CLICK LISTENER
    function handleClick(e: MouseEvent) {
      try {
        const rawTarget = e.target as HTMLElement | null;
        if (!rawTarget) return;

        // Find nearest interactive or informative ancestor
        const interactive = rawTarget.closest<HTMLElement>(
          'button, a, [role="button"], input, select, textarea, [data-action], [data-profile-id], .cursor-pointer, card, tr'
        ) || rawTarget;

        // Extract button or element text label
        let label =
          interactive.getAttribute('data-action') ||
          interactive.getAttribute('aria-label') ||
          interactive.getAttribute('title') ||
          interactive.innerText ||
          interactive.getAttribute('placeholder') ||
          '';

        // Clean label
        label = label.replace(/\s+/g, ' ').trim();
        if (label.length > 90) {
          label = label.substring(0, 90) + '...';
        }

        // If no text, check if there's an image with alt or icon
        if (!label) {
          const img = interactive.querySelector('img');
          if (img && img.alt) {
            label = `Image: ${img.alt}`;
          } else {
            label = interactive.tagName.toLowerCase();
          }
        }

        const tag = interactive.tagName.toUpperCase();
        const elementId = interactive.id || undefined;
        const href = interactive.getAttribute('href') || undefined;

        // Detect section / context
        let section = 'Page Body';
        if (interactive.closest('header') || interactive.closest('nav')) {
          section = 'Navigation Bar';
        } else if (interactive.closest('[role="dialog"]') || interactive.closest('.fixed.inset-0')) {
          section = 'Modal / Dialog';
        } else if (interactive.closest('[data-profile-id]') || interactive.closest('.profile-card')) {
          const pCard = interactive.closest('[data-profile-id]') || interactive.closest('.profile-card');
          const pName = pCard?.querySelector('h2, h3, .profile-name')?.textContent?.trim();
          section = pName ? `Profile Card (${pName})` : 'Profile Card';
        } else if (interactive.closest('.chat-panel') || interactive.closest('[data-chat]')) {
          section = 'Chat Window';
        } else if (interactive.closest('.filter-bar') || interactive.closest('[data-filter]')) {
          section = 'Filters & Search';
        } else if (interactive.closest('footer')) {
          section = 'Footer';
        }

        // Debounce rapid repeat clicks on exact same element (within 350ms)
        const now = Date.now();
        const clickSig = `${tag}:${elementId || ''}:${label}`;
        if (clickSig === lastClickTargetRef.current && now - lastClickTimeRef.current < 350) {
          return;
        }
        lastClickTimeRef.current = now;
        lastClickTargetRef.current = clickSig;

        const clickPayload = {
          eventType: 'click',
          anonymousId: visitorId,
          eventData: {
            visitorId,
            sessionId,
            targetText: label,
            targetTag: tag,
            targetId: elementId,
            targetHref: href,
            section,
            path: window.location.pathname,
            url: window.location.href,
            coords: {
              x: Math.round(e.clientX),
              y: Math.round(e.clientY),
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
            },
            device: {
              deviceClass: deviceSnapshot?.deviceClass || 'phone',
              os: deviceSnapshot?.os || 'Unknown',
              browser: deviceSnapshot?.browser || 'Browser',
              isInAppBrowser: deviceSnapshot?.isInAppBrowser || false,
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
            timestamp: new Date().toISOString(),
          },
        };

        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clickPayload),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Tracker must never interfere with user clicks
      }
    }

    document.addEventListener('click', handleClick, { capture: true, passive: true });

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [pathname, searchParams]);

  return null;
}
