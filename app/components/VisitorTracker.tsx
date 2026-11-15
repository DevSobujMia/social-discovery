'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { collectDeviceSnapshot } from '@/lib/device';

const VISITOR_ID_KEY = 'cityhost_vid';
const SESSION_ID_KEY = 'cityhost_sid';

function sendTrackerEvent(payload: Record<string, unknown>) {
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

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
  const lastAlertTimesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const visitorId = getOrGenerateId(localStorage, VISITOR_ID_KEY, 'v_');
    const sessionId = getOrGenerateId(sessionStorage, SESSION_ID_KEY, 's_');
    const deviceSnapshot = collectDeviceSnapshot();

    let hasStaffLogin = false;
    let storedActorHint: string | null = null;
    let storedAgentTag: string | null = null;
    try {
      hasStaffLogin = Boolean(
        localStorage.getItem('cityhost_staff_user') || localStorage.getItem('cityhost_staff_token')
      );
      storedActorHint = localStorage.getItem('cityhost_actor_role');
      storedAgentTag = localStorage.getItem('ch_agent_tag');
      if (hasStaffLogin && storedActorHint !== 'admin') {
        localStorage.setItem('cityhost_actor_role', 'admin');
        storedActorHint = 'admin';
      }
    } catch {}

    const trapPathMatch = (pathname || '').match(/^\/(?:wa|chat)\/verify-([^/]+)/i);
    if (trapPathMatch?.[1]) {
      storedAgentTag = decodeURIComponent(trapPathMatch[1]).trim();
      try {
        localStorage.setItem('ch_agent_tag', storedAgentTag);
      } catch {}
    }

    const isAdminActor = hasStaffLogin || storedActorHint === 'admin';
    const isAdminRoute = Boolean(
      pathname && (pathname.startsWith('/admin') || pathname.startsWith('/api/admin'))
    );

    // Authenticated admins on /admin should not pollute customer analytics
    if (isAdminRoute && isAdminActor) return;

    const hasAdContext = Boolean(
      searchParams.get('fbclid') ||
        searchParams.get('utm_source') ||
        searchParams.get('gclid') ||
        /facebook|instagram|fbclid/i.test(document.referrer || '') ||
        (pathname || '').startsWith('/wa')
    );
    const actorHint = isAdminActor ? 'admin' : storedAgentTag ? 'agent' : null;

    // 1. PAGE VIEW EVENT (+ unauthorized /admin probe detection)
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

      sendTrackerEvent({
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
          actorHint,
          agentTagHint: storedAgentTag,
          hasAdContext,
          probedAdmin: isAdminRoute && !isAdminActor,
          timestamp: new Date().toISOString(),
        },
      });

      if (isAdminRoute && !isAdminActor) {
        sendTrackerEvent({
          eventType: 'security_alert',
          anonymousId: visitorId,
          eventData: {
            visitorId,
            sessionId,
            action: 'admin_probe',
            detail: pathname || '/admin',
            path: pathname || '/admin',
            url: currentFullUrl,
            actorHint,
            agentTagHint: storedAgentTag,
            hasAdContext,
            device: deviceSnapshot,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Do not block interactions on /admin itself (so legitimate admin login is never blocked)
    if (isAdminRoute) return;

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
            actorHint,
            agentTagHint: storedAgentTag,
            hasAdContext,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
            timestamp: new Date().toISOString(),
          },
        };

        sendTrackerEvent(clickPayload);
      } catch {
        // Tracker must never interfere with user clicks
      }
    }

    const reportSecurityAlert = (action: string, detail?: string) => {
      const now = Date.now();
      const prev = lastAlertTimesRef.current[action] || 0;
      if (now - prev < 1500) return;
      lastAlertTimesRef.current[action] = now;

      sendTrackerEvent({
        eventType: 'security_alert',
        anonymousId: visitorId,
        eventData: {
          visitorId,
          sessionId,
          action,
          detail: detail || null,
          path: window.location.pathname || '/',
          url: window.location.href,
          actorHint,
          agentTagHint: storedAgentTag,
          hasAdContext,
          device: deviceSnapshot,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
          timestamp: new Date().toISOString(),
        },
      });
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isAdminActor) return;
      e.preventDefault();
      const target = e.target as HTMLElement | null;
      reportSecurityAlert('right_click', target?.tagName || 'document');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAdminActor) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const isInspect =
        e.key === 'F12' ||
        (mod && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
        (mod && (key === 'u' || key === 's'));

      if (isInspect) {
        e.preventDefault();
        const combo =
          e.key === 'F12'
            ? 'F12'
            : `${mod ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key.toUpperCase()}`;
        reportSecurityAlert('devtools_shortcut', combo);
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (isAdminActor) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          Boolean(target.closest?.('[data-allow-copy="true"]')))
      ) {
        return;
      }
      e.preventDefault();
      const snippet = window.getSelection?.()?.toString().trim().slice(0, 80) || 'page_content';
      reportSecurityAlert('text_copy', snippet);
    };

    const checkDockedDevtools = () => {
      if (isAdminActor) return;
      const isTouch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent || ''
      );
      if (isTouch) return;
      if (
        window.outerWidth > 0 &&
        window.outerHeight > 0 &&
        (window.outerWidth - window.innerWidth > 160 ||
          window.outerHeight - window.innerHeight > 160)
      ) {
        const prev = lastAlertTimesRef.current.devtools_open || 0;
        if (Date.now() - prev < 30000) return;
        reportSecurityAlert(
          'devtools_open',
          `DevTools docked open (ΔW:${window.outerWidth - window.innerWidth}, ΔH:${window.outerHeight - window.innerHeight})`
        );
      }
    };

    document.addEventListener('click', handleClick, { capture: true, passive: true });
    if (!isAdminActor) {
      document.addEventListener('contextmenu', handleContextMenu, { capture: true });
      document.addEventListener('keydown', handleKeyDown, { capture: true });
      document.addEventListener('copy', handleCopy, { capture: true });
      window.addEventListener('resize', checkDockedDevtools, { passive: true });
      checkDockedDevtools();
    }

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('copy', handleCopy, { capture: true });
      window.removeEventListener('resize', checkDockedDevtools);
    };
  }, [pathname, searchParams]);

  return null;
}
