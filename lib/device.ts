/**
 * Browser-side device token.
 *
 * Ad traffic never registers, so the session cookie is the only thing tying a
 * visitor to their conversation — and cookies get cleared. This token lives in
 * `localStorage` as an independent second copy of that link, and
 * `POST /api/auth/device-resume` trades it back for a session.
 *
 * The token is opaque and meaningless on its own; it only matters because the
 * server has a matching `LeadIdentity` row.
 */

import { canonicalCity, extractCityFromText } from './market';

const CURRENT_PREFIX = 'cityhost_';
const LEGACY_PREFIX = 'heartlink_';

function readPrefixed(store: Storage, name: string): string | null {
  return store.getItem(CURRENT_PREFIX + name) || store.getItem(LEGACY_PREFIX + name);
}

function writePrefixed(store: Storage, name: string, value: string): void {
  store.setItem(CURRENT_PREFIX + name, value);
  // Keep the previous key in sync so returning visitors still resume.
  store.setItem(LEGACY_PREFIX + name, value);
}

function removePrefixed(store: Storage, name: string): void {
  store.removeItem(CURRENT_PREFIX + name);
  store.removeItem(LEGACY_PREFIX + name);
}

/** Browser storage with City Host keys, reading legacy Heartlink keys if needed. */
export function readBrowserStore(
  which: 'local' | 'session',
  name: string
): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const store = which === 'local' ? window.localStorage : window.sessionStorage;
    return readPrefixed(store, name);
  } catch {
    return null;
  }
}

export function writeBrowserStore(
  which: 'local' | 'session',
  name: string,
  value: string
): void {
  if (typeof window === 'undefined') return;
  try {
    const store = which === 'local' ? window.localStorage : window.sessionStorage;
    writePrefixed(store, name, value);
  } catch {
    // Storage is optional.
  }
}

export function removeBrowserStore(which: 'local' | 'session', name: string): void {
  if (typeof window === 'undefined') return;
  try {
    const store = which === 'local' ? window.localStorage : window.sessionStorage;
    removePrefixed(store, name);
  } catch {
    // Storage is optional.
  }
}

const DEVICE_KEY = 'device';
const LOGOUT_FLAG_KEY = 'logged_out';
const AD_PARAMS_KEY = 'ad_params';

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Read the device token, creating one on first visit. Returns `null` when
 * storage is unavailable (private mode, storage disabled) — callers must treat
 * the token as best-effort and never depend on it.
 */
export function getDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;

  const existing = readBrowserStore('local', DEVICE_KEY);
  if (existing && existing.length >= 8) {
    writeBrowserStore('local', DEVICE_KEY, existing);
    return existing;
  }

  const token = randomToken();
  writeBrowserStore('local', DEVICE_KEY, token);
  return token;
}

/** Replace the stored device token so a previous lead can no longer auto-resume. */
export function rotateDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = randomToken();
  writeBrowserStore('local', DEVICE_KEY, token);
  return token;
}

/** Explicit Log Out — skip device-resume until they sign in again. */
export function markExplicitLogout(): void {
  writeBrowserStore('local', LOGOUT_FLAG_KEY, '1');
  rotateDeviceToken();
}

export function clearExplicitLogout(): void {
  removeBrowserStore('local', LOGOUT_FLAG_KEY);
}

export function isExplicitLogout(): boolean {
  return readBrowserStore('local', LOGOUT_FLAG_KEY) === '1';
}

// ============================================================
// AD PARAMETERS
// ============================================================

export interface AdParams {
  /** Gender of the profiles the ad promised, e.g. `?g=female`. */
  gender: string | null;
  minAge: number | null;
  maxAge: number | null;
  /** Where the visitor is, from `?city=`. */
  city: string | null;
  /** Country code from `?c=` or `?country=`. */
  country: string | null;
  /** Destination the ad advertised, from `?dest=`. */
  destination: string | null;
  /** A specific profile to open, from `?profile=`. */
  profileId: string | null;
}

const EMPTY_AD_PARAMS: AdParams = {
  gender: null,
  minAge: null,
  maxAge: null,
  city: null,
  country: null,
  destination: null,
  profileId: null,
};

function toInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Read the targeting the ad set already encoded in the URL.
 *
 * This is what removes the form from the funnel: the operator knows who they
 * targeted, so the visitor is never asked to re-enter their own age and gender.
 */
export function readAdParams(search: string): AdParams {
  const params = new URLSearchParams(search);

  const gender = params.get('g') || params.get('gender');
  const normalizedGender =
    gender === 'female' || gender === 'male' || gender === 'other'
      ? gender
      : gender === 'f'
        ? 'female'
        : gender === 'm'
          ? 'male'
          : null;

  const cityFromUtm =
    extractCityFromText(params.get('utm_content')) ||
    extractCityFromText(params.get('utm_campaign')) ||
    extractCityFromText(params.get('utm_term'));

  return {
    gender: normalizedGender,
    minAge: toInt(params.get('amin') || params.get('minAge')),
    maxAge: toInt(params.get('amax') || params.get('maxAge')),
    city:
      canonicalCity(params.get('city')) ||
      canonicalCity(params.get('dest') || params.get('destination')) ||
      cityFromUtm,
    country: params.get('c') || params.get('country'),
    destination: canonicalCity(params.get('dest') || params.get('destination') || params.get('city')),
    profileId: params.get('profile') || params.get('profileId') || params.get('user'),
  };
}

/** Persist ad params so they survive navigation within the session. */
export function storeAdParams(params: AdParams): void {
  if (typeof window === 'undefined') return;
  const hasAnything = Object.values(params).some((v) => v !== null);
  if (!hasAnything) return;

  writeBrowserStore('session', AD_PARAMS_KEY, JSON.stringify(params));
  writeBrowserStore('local', AD_PARAMS_KEY, JSON.stringify(params));
}

/** Ad params from this URL, falling back to whatever was stored earlier. */
export function loadAdParams(search?: string): AdParams {
  if (typeof window === 'undefined') return EMPTY_AD_PARAMS;

  const fromUrl = readAdParams(search ?? window.location.search);
  if (Object.values(fromUrl).some((v) => v !== null)) {
    storeAdParams(fromUrl);
    return fromUrl;
  }

  try {
    const raw =
      readBrowserStore('session', AD_PARAMS_KEY) ||
      readBrowserStore('local', AD_PARAMS_KEY);
    if (raw) return { ...EMPTY_AD_PARAMS, ...JSON.parse(raw) };
  } catch {
    // Fall through to empty.
  }

  return EMPTY_AD_PARAMS;
}

/** Midpoint of the ad's age range, used to pre-fill the lead's own age. */
export function inferVisitorAge(params: AdParams): number | null {
  if (params.minAge && params.maxAge) {
    return Math.round((params.minAge + params.maxAge) / 2);
  }
  return params.minAge || params.maxAge || null;
}

// ============================================================
// DEVICE SNAPSHOT (lead quality for admin)
// ============================================================

export type DeviceSnapshot = {
  collectedAt: string;
  userAgent: string;
  platform: string;
  os: string;
  browser: string;
  deviceClass: 'phone' | 'tablet' | 'desktop' | 'unknown';
  isMobile: boolean;
  isStandalone: boolean;
  isInAppBrowser: boolean;
  inAppBrowser: string | null;
  language: string;
  languages: string[];
  timezone: string;
  screen: string;
  viewport: string;
  pixelRatio: number;
  touchPoints: number;
  connection: string | null;
  cookiesEnabled: boolean;
};

function detectOs(ua: string, platform: string): string {
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android\s+([\d.]+)/i);
    return m ? `Android ${m[1]}` : 'Android';
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    const m = ua.match(/OS\s+([\d_]+)/i);
    return m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
  }
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua) || platform === 'MacIntel') return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return platform || 'Unknown';
}

function detectBrowser(ua: string): { browser: string; inApp: string | null } {
  if (/Instagram/i.test(ua)) return { browser: 'Instagram', inApp: 'instagram' };
  if (/FBAN|FBAV|FB_IAB|Facebook/i.test(ua)) return { browser: 'Facebook', inApp: 'facebook' };
  if (/Line\//i.test(ua)) return { browser: 'LINE', inApp: 'line' };
  if (/TikTok|Bytedance|musical_ly/i.test(ua)) return { browser: 'TikTok', inApp: 'tiktok' };
  if (/Snapchat/i.test(ua)) return { browser: 'Snapchat', inApp: 'snapchat' };
  if (/WhatsApp/i.test(ua)) return { browser: 'WhatsApp', inApp: 'whatsapp' };
  if (/Edg\//i.test(ua)) return { browser: 'Edge', inApp: null };
  if (/OPR\/|Opera/i.test(ua)) return { browser: 'Opera', inApp: null };
  if (/SamsungBrowser/i.test(ua)) return { browser: 'Samsung Internet', inApp: null };
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return { browser: 'Chrome', inApp: null };
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return { browser: 'Safari', inApp: null };
  if (/Firefox\//i.test(ua)) return { browser: 'Firefox', inApp: null };
  return { browser: 'Other', inApp: null };
}

function detectDeviceClass(ua: string, touchPoints: number): DeviceSnapshot['deviceClass'] {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android.*Mobile/i.test(ua)) return 'phone';
  if (touchPoints > 0 && /Macintosh/i.test(ua)) return 'tablet'; // iPadOS desktop UA
  if (/Windows|Macintosh|Linux/i.test(ua)) return 'desktop';
  return touchPoints > 1 ? 'phone' : 'unknown';
}

function readConnection(): string | null {
  try {
    const conn = (
      navigator as Navigator & {
        connection?: { effectiveType?: string; type?: string; saveData?: boolean };
      }
    ).connection;
    if (!conn) return null;
    const parts = [conn.effectiveType || conn.type].filter(Boolean);
    if (conn.saveData) parts.push('save-data');
    return parts.length ? parts.join(' · ') : null;
  } catch {
    return null;
  }
}

/**
 * Capture a lightweight browser/device snapshot for lead-quality review.
 * Safe to call only in the browser; returns null when window is unavailable.
 */
export function collectDeviceSnapshot(): DeviceSnapshot | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;

  try {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const { browser, inApp } = detectBrowser(ua);
    const touchPoints = navigator.maxTouchPoints || 0;
    const deviceClass = detectDeviceClass(ua, touchPoints);
    const iosStandalone = (
      navigator as Navigator & { standalone?: boolean }
    ).standalone;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      iosStandalone === true;

    return {
      collectedAt: new Date().toISOString(),
      userAgent: ua.slice(0, 512),
      platform,
      os: detectOs(ua, platform),
      browser,
      deviceClass,
      isMobile: deviceClass === 'phone' || deviceClass === 'tablet',
      isStandalone,
      isInAppBrowser: Boolean(inApp),
      inAppBrowser: inApp,
      language: navigator.language || '',
      languages: Array.isArray(navigator.languages)
        ? navigator.languages.slice(0, 5).map(String)
        : [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen: `${window.screen?.width || 0}×${window.screen?.height || 0}`,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      pixelRatio: Number(window.devicePixelRatio?.toFixed?.(2) ?? window.devicePixelRatio) || 1,
      touchPoints,
      connection: readConnection(),
      cookiesEnabled: navigator.cookieEnabled !== false,
    };
  } catch {
    return null;
  }
}
