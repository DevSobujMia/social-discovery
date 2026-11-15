/**
 * Comprehensive Geolocation and IP Resolution Engine for City Host
 *
 * Provides multi-tier location accuracy:
 * 1. Edge CDN headers (Cloudflare, Vercel, Fastly, AWS)
 * 2. Explicit Ad Campaign targeting parameters (adCountry, adCity, utm)
 * 3. Fast cached public IP lookup for direct production visits
 * 4. Client Timezone & Locale inference fallback
 */

const COUNTRY_NAME_MAP: Record<string, string> = {
  SA: 'Saudi Arabia',
  AE: 'United Arab Emirates',
  KW: 'Kuwait',
  QA: 'Qatar',
  OM: 'Oman',
  BH: 'Bahrain',
  BD: 'Bangladesh',
  IN: 'India',
  PK: 'Pakistan',
  US: 'United States',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  NL: 'Netherlands',
  TR: 'Turkey',
  EG: 'Egypt',
  MY: 'Malaysia',
  ID: 'Indonesia',
  PH: 'Philippines',
  SG: 'Singapore',
  TH: 'Thailand',
  VN: 'Vietnam',
  ZA: 'South Africa',
  NG: 'Nigeria',
  KE: 'Kenya',
  BR: 'Brazil',
  MX: 'Mexico',
  RU: 'Russia',
  UA: 'Ukraine',
  JP: 'Japan',
  KR: 'South Korea',
  CN: 'China',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  CH: 'Switzerland',
  AT: 'Austria',
  BE: 'Belgium',
  IE: 'Ireland',
  NZ: 'New Zealand',
};

const TIMEZONE_GEO_MAP: Record<string, { country: string; countryCode: string; city: string }> = {
  'Asia/Riyadh': { country: 'Saudi Arabia', countryCode: 'SA', city: 'Riyadh' },
  'Asia/Dubai': { country: 'United Arab Emirates', countryCode: 'AE', city: 'Dubai' },
  'Asia/Kuwait': { country: 'Kuwait', countryCode: 'KW', city: 'Kuwait City' },
  'Asia/Qatar': { country: 'Qatar', countryCode: 'QA', city: 'Doha' },
  'Asia/Bahrain': { country: 'Bahrain', countryCode: 'BH', city: 'Manama' },
  'Asia/Muscat': { country: 'Oman', countryCode: 'OM', city: 'Muscat' },
  'Asia/Dhaka': { country: 'Bangladesh', countryCode: 'BD', city: 'Dhaka' },
  'Asia/Kolkata': { country: 'India', countryCode: 'IN', city: 'New Delhi' },
  'Asia/Calcutta': { country: 'India', countryCode: 'IN', city: 'Kolkata' },
  'Asia/Karachi': { country: 'Pakistan', countryCode: 'PK', city: 'Karachi' },
  'Asia/Islamabad': { country: 'Pakistan', countryCode: 'PK', city: 'Islamabad' },
  'Asia/Singapore': { country: 'Singapore', countryCode: 'SG', city: 'Singapore' },
  'Asia/Kuala_Lumpur': { country: 'Malaysia', countryCode: 'MY', city: 'Kuala Lumpur' },
  'Asia/Jakarta': { country: 'Indonesia', countryCode: 'ID', city: 'Jakarta' },
  'Asia/Bangkok': { country: 'Thailand', countryCode: 'TH', city: 'Bangkok' },
  'Asia/Manila': { country: 'Philippines', countryCode: 'PH', city: 'Manila' },
  'Asia/Tokyo': { country: 'Japan', countryCode: 'JP', city: 'Tokyo' },
  'Asia/Seoul': { country: 'South Korea', countryCode: 'KR', city: 'Seoul' },
  'Europe/London': { country: 'United Kingdom', countryCode: 'GB', city: 'London' },
  'Europe/Berlin': { country: 'Germany', countryCode: 'DE', city: 'Berlin' },
  'Europe/Paris': { country: 'France', countryCode: 'FR', city: 'Paris' },
  'Europe/Rome': { country: 'Italy', countryCode: 'IT', city: 'Rome' },
  'Europe/Madrid': { country: 'Spain', countryCode: 'ES', city: 'Madrid' },
  'Europe/Amsterdam': { country: 'Netherlands', countryCode: 'NL', city: 'Amsterdam' },
  'Europe/Istanbul': { country: 'Turkey', countryCode: 'TR', city: 'Istanbul' },
  'America/New_York': { country: 'United States', countryCode: 'US', city: 'New York' },
  'America/Chicago': { country: 'United States', countryCode: 'US', city: 'Chicago' },
  'America/Los_Angeles': { country: 'United States', countryCode: 'US', city: 'Los Angeles' },
  'America/Toronto': { country: 'Canada', countryCode: 'CA', city: 'Toronto' },
  'Australia/Sydney': { country: 'Australia', countryCode: 'AU', city: 'Sydney' },
  'Australia/Melbourne': { country: 'Australia', countryCode: 'AU', city: 'Melbourne' },
  'Africa/Cairo': { country: 'Egypt', countryCode: 'EG', city: 'Cairo' },
  'Africa/Johannesburg': { country: 'South Africa', countryCode: 'ZA', city: 'Johannesburg' },
};

/** Convert 2-letter ISO country code to Emoji Flag */
export function getCountryFlag(code?: string | null): string {
  if (!code || code.length !== 2) return '🌐';
  const clean = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '🌐';
  const codePoints = clean.split('').map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/** Get full country name from 2-letter code */
export function getCountryName(code?: string | null, fallback = 'Unknown Location'): string {
  if (!code) return fallback;
  const upper = code.trim().toUpperCase();
  return COUNTRY_NAME_MAP[upper] || upper;
}

/** Parse and sanitize client IP from incoming request headers */
export function extractClientIp(headers: Headers): string {
  const candidates = [
    headers.get('cf-connecting-ip'),
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for'),
    headers.get('x-client-ip'),
    headers.get('fastly-client-ip'),
    headers.get('true-client-ip'),
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    // In comma-separated proxies: "client, proxy1, proxy2"
    const first = raw.split(',')[0].trim();
    if (!first) continue;
    // Strip port if IPv4 with port: "192.168.1.1:8080"
    const ip = first.includes(':') && !first.includes('::') ? first.split(':')[0] : first;
    if (ip && ip.toLowerCase() !== 'unknown') {
      return ip;
    }
  }

  return '127.0.0.1';
}

/** Check if IP is localhost, loopback, or private intranet */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.trim().toLowerCase();
  if (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === 'localhost' ||
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    clean.startsWith('169.254.')
  ) {
    return true;
  }
  if (clean.startsWith('172.')) {
    const parts = clean.split('.');
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

// In-memory cache for IP lookups (prevents repeat external lookups, max 5000 entries)
const ipLookupCache = new Map<string, { country: string; countryCode: string; city: string; flag: string }>();

/** Fast external IP geo lookup with strict 1.5s timeout and memory cache */
export async function lookupPublicIp(ip: string): Promise<{
  country: string;
  countryCode: string;
  city: string;
  flag: string;
} | null> {
  if (!ip || isPrivateIp(ip)) return null;

  if (ipLookupCache.has(ip)) {
    return ipLookupCache.get(ip)!;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CityHost-GeoResolver/1.0' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success' && data.countryCode) {
        const result = {
          country: data.country || getCountryName(data.countryCode),
          countryCode: String(data.countryCode).toUpperCase(),
          city: data.city || '',
          flag: getCountryFlag(data.countryCode),
        };

        if (ipLookupCache.size > 5000) ipLookupCache.clear();
        ipLookupCache.set(ip, result);
        return result;
      }
    }
  } catch {
    // Fail silently to fallbacks
  }

  return null;
}

export interface GeoLocationResult {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  flag: string;
  source: 'edge' | 'ad-param' | 'ip-lookup' | 'timezone' | 'fallback';
}

/**
 * Resolve full, accurate geolocation for a visitor.
 */
export async function resolveVisitorGeo(
  headers: Headers,
  hints?: {
    country?: string | null;
    city?: string | null;
    timezone?: string | null;
    ip?: string | null;
  }
): Promise<GeoLocationResult> {
  const ip = hints?.ip || extractClientIp(headers);

  // 1. Edge CDN Headers (Vercel, Cloudflare, AWS)
  const edgeCountry = (
    headers.get('cf-ipcountry') ||
    headers.get('x-vercel-ip-country') ||
    headers.get('x-geo-country') ||
    headers.get('x-country-code')
  )?.trim()?.toUpperCase();

  const edgeCityRaw =
    headers.get('cf-ipcity') ||
    headers.get('x-vercel-ip-city') ||
    headers.get('x-geo-city');

  const edgeCity = edgeCityRaw ? decodeURIComponent(edgeCityRaw).trim() : null;

  if (edgeCountry && edgeCountry !== 'XX' && edgeCountry.length === 2) {
    return {
      ip,
      country: getCountryName(edgeCountry),
      countryCode: edgeCountry,
      city: edgeCity || hints?.city || 'Major City',
      flag: getCountryFlag(edgeCountry),
      source: 'edge',
    };
  }

  // 2. Explicit Ad Parameters (dynamic country/city configured in ad links)
  const rawAdCountry = hints?.country?.trim() || '';
  const adCountry = rawAdCountry.toUpperCase();
  const adCity = hints?.city?.trim();

  if (rawAdCountry) {
    if (adCountry.length === 2) {
      return {
        ip,
        country: getCountryName(adCountry),
        countryCode: adCountry,
        city: adCity || 'Central',
        flag: getCountryFlag(adCountry),
        source: 'ad-param',
      };
    }
    return {
      ip,
      country: rawAdCountry,
      countryCode: 'UN',
      city: adCity || 'your city',
      flag: '🌐',
      source: 'ad-param',
    };
  }

  // 3. Fast Public IP Lookup if IP is public
  if (!isPrivateIp(ip)) {
    const lookedUp = await lookupPublicIp(ip);
    if (lookedUp) {
      return {
        ip,
        ...lookedUp,
        source: 'ip-lookup',
      };
    }
  }

  // 4. Client Timezone Mapping (High accuracy for real visitor mobile devices)
  if (hints?.timezone && TIMEZONE_GEO_MAP[hints.timezone]) {
    const tzMatch = TIMEZONE_GEO_MAP[hints.timezone];
    return {
      ip,
      country: tzMatch.country,
      countryCode: tzMatch.countryCode,
      city: tzMatch.city,
      flag: getCountryFlag(tzMatch.countryCode),
      source: 'timezone',
    };
  }

  // 5. Default Fallback
  return {
    ip,
    country: 'International',
    countryCode: 'UN',
    city: 'your city',
    flag: '🌐',
    source: 'fallback',
  };
}
