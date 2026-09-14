/**
 * Server-side helpers for lead device snapshots stored on `User.deviceMeta`.
 */

export type StoredDeviceMeta = {
  collectedAt?: string;
  updatedAt?: string;
  userAgent?: string;
  platform?: string;
  os?: string;
  browser?: string;
  deviceClass?: 'phone' | 'tablet' | 'desktop' | 'unknown';
  isMobile?: boolean;
  isStandalone?: boolean;
  isInAppBrowser?: boolean;
  inAppBrowser?: string | null;
  language?: string;
  languages?: string[];
  timezone?: string;
  screen?: string;
  viewport?: string;
  pixelRatio?: number;
  touchPoints?: number;
  connection?: string | null;
  cookiesEnabled?: boolean;
  /** How many times we refreshed this snapshot from the client. */
  touchCount?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Merge an incoming client snapshot into the stored JSON (keep first-seen + latest). */
export function mergeDeviceMeta(
  existing: unknown,
  incoming: unknown
): StoredDeviceMeta | null {
  const next = asRecord(incoming);
  if (!next) return (asRecord(existing) as StoredDeviceMeta) || null;

  const prev = (asRecord(existing) as StoredDeviceMeta) || {};
  const now = new Date().toISOString();

  const pickString = (key: string, max = 120): string | undefined => {
    const v = next[key];
    if (typeof v !== 'string') return undefined;
    const trimmed = v.trim().slice(0, max);
    return trimmed || undefined;
  };

  const pickBool = (key: string): boolean | undefined => {
    const v = next[key];
    return typeof v === 'boolean' ? v : undefined;
  };

  const pickNum = (key: string): number | undefined => {
    const v = next[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };

  const deviceClassRaw = pickString('deviceClass', 20);
  const deviceClass =
    deviceClassRaw === 'phone' ||
    deviceClassRaw === 'tablet' ||
    deviceClassRaw === 'desktop' ||
    deviceClassRaw === 'unknown'
      ? deviceClassRaw
      : prev.deviceClass;

  const languages = Array.isArray(next.languages)
    ? next.languages.filter((x): x is string => typeof x === 'string').slice(0, 5)
    : prev.languages;

  return {
    ...prev,
    collectedAt: prev.collectedAt || pickString('collectedAt', 40) || now,
    updatedAt: now,
    userAgent: pickString('userAgent', 512) || prev.userAgent,
    platform: pickString('platform', 80) || prev.platform,
    os: pickString('os', 80) || prev.os,
    browser: pickString('browser', 60) || prev.browser,
    deviceClass,
    isMobile: pickBool('isMobile') ?? prev.isMobile,
    isStandalone: pickBool('isStandalone') ?? prev.isStandalone,
    isInAppBrowser: pickBool('isInAppBrowser') ?? prev.isInAppBrowser,
    inAppBrowser:
      typeof next.inAppBrowser === 'string'
        ? next.inAppBrowser.slice(0, 40)
        : next.inAppBrowser === null
          ? null
          : prev.inAppBrowser,
    language: pickString('language', 40) || prev.language,
    languages,
    timezone: pickString('timezone', 80) || prev.timezone,
    screen: pickString('screen', 40) || prev.screen,
    viewport: pickString('viewport', 40) || prev.viewport,
    pixelRatio: pickNum('pixelRatio') ?? prev.pixelRatio,
    touchPoints: pickNum('touchPoints') ?? prev.touchPoints,
    connection:
      typeof next.connection === 'string'
        ? next.connection.slice(0, 40)
        : next.connection === null
          ? null
          : prev.connection,
    cookiesEnabled: pickBool('cookiesEnabled') ?? prev.cookiesEnabled,
    touchCount: (prev.touchCount || 0) + 1,
  };
}

/** Compact labels for the admin Lead Collection table. */
export function summarizeDeviceMeta(
  meta: unknown,
  geo?: { country?: string | null; city?: string | null }
): {
  label: string;
  detail: string;
  quality: 'strong' | 'ok' | 'weak' | 'unknown';
  qualityNote: string;
  fields: { key: string; value: string }[];
} {
  const m = asRecord(meta) as StoredDeviceMeta | null;
  if (!m || (!m.os && !m.browser && !m.userAgent)) {
    return {
      label: 'Unknown device',
      detail: 'No browser snapshot yet',
      quality: 'unknown',
      qualityNote: 'Visitor has not sent device details',
      fields: [],
    };
  }

  const os = m.os || 'Unknown OS';
  const browser = m.browser || 'Unknown browser';
  const deviceClass = m.deviceClass || 'unknown';
  const label = `${os} · ${browser}`;
  const location = [geo?.city, geo?.country].filter(Boolean).join(', ');

  const fields: { key: string; value: string }[] = [
    { key: 'Device', value: deviceClass },
    { key: 'OS', value: os },
    { key: 'Browser', value: browser },
  ];
  if (m.isInAppBrowser && m.inAppBrowser) {
    fields.push({ key: 'In-app', value: String(m.inAppBrowser) });
  }
  if (m.isStandalone) fields.push({ key: 'PWA', value: 'Installed' });
  if (m.language) fields.push({ key: 'Language', value: m.language });
  if (m.timezone) fields.push({ key: 'Timezone', value: m.timezone });
  if (m.screen) fields.push({ key: 'Screen', value: m.screen });
  if (m.connection) fields.push({ key: 'Network', value: m.connection });
  if (location) fields.push({ key: 'Geo', value: location });
  if (m.updatedAt) {
    fields.push({
      key: 'Last seen device',
      value: new Date(m.updatedAt).toLocaleString(),
    });
  }

  let quality: 'strong' | 'ok' | 'weak' | 'unknown' = 'ok';
  let qualityNote = 'Normal browser session';

  if (m.isInAppBrowser) {
    quality = 'weak';
    qualityNote = `Opened inside ${m.inAppBrowser || 'an'} in-app browser — often lower install / return rates`;
  } else if (m.isStandalone) {
    quality = 'strong';
    qualityNote = 'Installed PWA — higher intent to return';
  } else if (deviceClass === 'desktop') {
    quality = 'ok';
    qualityNote = 'Desktop visitor — less typical for mobile ad traffic';
  } else if (deviceClass === 'phone' && (browser === 'Chrome' || browser === 'Safari')) {
    quality = 'strong';
    qualityNote = 'Real mobile browser — good for chat + install';
  }

  const detailParts = [
    deviceClass,
    m.isStandalone ? 'PWA' : null,
    m.isInAppBrowser ? `in-app:${m.inAppBrowser}` : null,
    m.language || null,
    location || null,
  ].filter(Boolean);

  return {
    label,
    detail: detailParts.join(' · '),
    quality,
    qualityNote,
    fields,
  };
}
