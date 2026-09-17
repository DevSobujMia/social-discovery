/**
 * Market intelligence for the ad funnel.
 *
 * Phase 1 targets Indian and Pakistani expatriates living in the UAE and Saudi
 * Arabia. Everything here exists so the funnel can answer three questions the
 * moment someone lands from an ad:
 *
 *   1. Which city are they in?      → which travelling profiles to show
 *   2. Where are they originally from? → which language to speak
 *   3. How expensive are they to message later? → which channel to push
 */

// ============================================================
// MARKET CONFIG
// ============================================================

export interface MarketCity {
  name: string;
  /** Lowercase spellings and transliterations that should resolve to `name`. */
  aliases: string[];
}

export interface Market {
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  countryName: string;
  cities: MarketCity[];
  /** IANA zone, used to schedule notification sends into local evening. */
  timeZone: string;
  /** Best-performing creative languages, most effective first. */
  languages: string[];
  /** Home countries of the expatriate audience we advertise to. */
  expatSegments: string[];
  /** Ad delivery must exclude local nationals for this market. */
  excludeLocals: boolean;
}

/** Country + city options on the customer profile. */
export const PROFILE_LOCATIONS: { country: string; cities: string[] }[] = [
  {
    country: 'United Arab Emirates',
    cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman'],
  },
  {
    country: 'Saudi Arabia',
    cities: ['Riyadh', 'Jeddah', 'Dammam', 'Khobar'],
  },
  { country: 'Qatar', cities: ['Doha'] },
  { country: 'Kuwait', cities: ['Kuwait City'] },
  { country: 'Bahrain', cities: ['Manama'] },
  { country: 'Oman', cities: ['Muscat'] },
  {
    country: 'India',
    cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata'],
  },
  {
    country: 'Pakistan',
    cities: ['Karachi', 'Lahore', 'Islamabad'],
  },
  {
    country: 'Bangladesh',
    cities: ['Dhaka', 'Chittagong'],
  },
  {
    country: 'United Kingdom',
    cities: ['London', 'Manchester'],
  },
  {
    country: 'United States',
    cities: ['New York', 'Los Angeles'],
  },
];

export function citiesForCountry(country?: string | null): string[] {
  if (!country) return [];
  return PROFILE_LOCATIONS.find((row) => row.country === country)?.cities ?? [];
}

export const MARKETS: Market[] = [
  {
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    cities: [
      { name: 'Dubai', aliases: ['dubai', 'dubayy', 'دبي'] },
      { name: 'Abu Dhabi', aliases: ['abu dhabi', 'abudhabi', 'أبو ظبي'] },
      { name: 'Sharjah', aliases: ['sharjah', 'الشارقة'] },
      { name: 'Ajman', aliases: ['ajman'] },
    ],
    timeZone: 'Asia/Dubai',
    languages: ['en', 'hi', 'ur'],
    expatSegments: ['IN', 'PK'],
    excludeLocals: true,
  },
  {
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    cities: [
      { name: 'Riyadh', aliases: ['riyadh', 'ar riyadh', 'الرياض'] },
      { name: 'Jeddah', aliases: ['jeddah', 'jiddah', 'جدة'] },
      { name: 'Dammam', aliases: ['dammam', 'الدمام'] },
      { name: 'Khobar', aliases: ['khobar', 'al khobar'] },
    ],
    timeZone: 'Asia/Riyadh',
    languages: ['en', 'ur', 'hi'],
    expatSegments: ['IN', 'PK'],
    excludeLocals: true,
  },
];

export function findMarket(countryCode?: string | null): Market | null {
  if (!countryCode) return null;
  const code = countryCode.trim().toUpperCase();
  return MARKETS.find((m) => m.countryCode === code) || null;
}

/**
 * Resolve a free-text city string to a canonical city name. Falls back to a
 * title-cased version of the input so unknown cities still work.
 */
export function canonicalCity(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const needle = raw.trim().toLowerCase();

  for (const market of MARKETS) {
    for (const city of market.cities) {
      if (city.name.toLowerCase() === needle || city.aliases.includes(needle)) {
        return city.name;
      }
    }
  }

  return raw
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ============================================================
// PHONE NORMALISATION
// ============================================================

/**
 * Dialling code → ISO country. Ordered longest-first at lookup time so `+971`
 * is not shadowed by `+9`. Covers the Gulf markets plus the expat home
 * countries and the main Western markets we expand into.
 */
const DIAL_CODES: Array<{ dial: string; country: string }> = [
  { dial: '971', country: 'AE' },
  { dial: '966', country: 'SA' },
  { dial: '974', country: 'QA' },
  { dial: '965', country: 'KW' },
  { dial: '968', country: 'OM' },
  { dial: '973', country: 'BH' },
  { dial: '91', country: 'IN' },
  { dial: '92', country: 'PK' },
  { dial: '880', country: 'BD' },
  { dial: '94', country: 'LK' },
  { dial: '977', country: 'NP' },
  { dial: '63', country: 'PH' },
  { dial: '20', country: 'EG' },
  { dial: '44', country: 'GB' },
  { dial: '49', country: 'DE' },
  { dial: '33', country: 'FR' },
  { dial: '34', country: 'ES' },
  { dial: '39', country: 'IT' },
  { dial: '1', country: 'US' },
];

/** National trunk-prefix length by country, used to expand local formats. */
const NATIONAL_NUMBER_LENGTH: Record<string, number> = {
  AE: 9,
  SA: 9,
  IN: 10,
  PK: 10,
  BD: 10,
};

/**
 * Normalise a phone number to `+<digits>` so the same person entering
 * `050 123 4567`, `00971501234567` and `+971 50 123 4567` collapses to one
 * identity. `defaultCountry` supplies the dialling code when the visitor typed
 * a local-format number.
 */
export function normalizePhone(
  raw: string,
  defaultCountry?: string | null
): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // 00-prefixed international form.
  if (!hasPlus && digits.startsWith('00')) {
    digits = digits.slice(2);
    return digits.length >= 7 ? `+${digits}` : null;
  }

  if (hasPlus) {
    return digits.length >= 7 ? `+${digits}` : null;
  }

  const dialFor = (country?: string | null): string | null => {
    if (!country) return null;
    const match = DIAL_CODES.find(
      (d) => d.country === country.trim().toUpperCase()
    );
    return match ? match.dial : null;
  };

  const dial = dialFor(defaultCountry);

  // Local format with a trunk 0, e.g. UAE "0501234567".
  if (digits.startsWith('0')) {
    const national = digits.replace(/^0+/, '');
    if (dial && national.length >= 6) return `+${dial}${national}`;
    return national.length >= 7 ? `+${national}` : null;
  }

  // Bare national number, e.g. UAE "501234567" or India "9876543210".
  if (dial) {
    const expected = NATIONAL_NUMBER_LENGTH[defaultCountry!.toUpperCase()];
    if (!expected || digits.length <= expected) {
      return `+${dial}${digits}`;
    }
  }

  return digits.length >= 8 ? `+${digits}` : null;
}

/** Infer the home country of a lead from their phone number. */
export function inferCountryFromPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  const sorted = [...DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length);
  for (const entry of sorted) {
    if (digits.startsWith(entry.dial)) return entry.country;
  }
  return null;
}

/** Hide the last 4 digits only. Keeps `+`, spaces, and the visible prefix. */
export function maskPhoneLast4(value: string): string {
  if (!value) return '';
  let remaining = 4;
  let out = '';
  for (let i = value.length - 1; i >= 0; i--) {
    const ch = value[i];
    if (remaining > 0 && /\d/.test(ch)) {
      out = `•${out}`;
      remaining -= 1;
    } else {
      out = `${ch}${out}`;
    }
  }
  return out;
}

/** Mask a contact value for display in the admin list and public profile. */
export function maskContact(kind: string, value: string): string {
  if (kind === 'telegram' && !value.startsWith('+')) {
    return value.startsWith('@') ? value : `@${value}`;
  }
  if (kind === 'email') {
    const [name, domain] = value.split('@');
    if (!domain) return value;
    const head = name.slice(0, 2);
    return `${head}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
  }
  return maskPhoneLast4(value);
}

// ============================================================
// LANGUAGE
// ============================================================

/**
 * Creative and reply language for a lead. Hindi for Indian expats, Urdu for
 * Pakistani expats, English otherwise — the operator can always override.
 */
export function inferLanguage(originCountry?: string | null): string {
  switch ((originCountry || '').toUpperCase()) {
    case 'IN':
      return 'hi';
    case 'PK':
      return 'ur';
    case 'BD':
      return 'bn';
    default:
      return 'en';
  }
}

// ============================================================
// OUTBOUND MESSAGING COST
// ============================================================

export type CostTier = 'cheap' | 'standard' | 'expensive';

/**
 * How costly it is to send a WhatsApp marketing template to this number.
 * Billing follows the recipient's country, so an Indian expat who kept their
 * +91 number is roughly ten times cheaper to reach than the same person on a
 * +971 number. Used to decide whether to spend on WhatsApp or prefer the free
 * Telegram / web-push channels.
 */
export function messagingCostTier(countryCode?: string | null): CostTier {
  const code = (countryCode || '').toUpperCase();
  if (['IN', 'PK', 'BD', 'LK', 'NP'].includes(code)) return 'cheap';
  if (['AE', 'SA', 'QA', 'KW', 'OM', 'BH', 'DE', 'FR', 'ES', 'IT'].includes(code)) {
    return 'expensive';
  }
  return 'standard';
}

/**
 * Pick the channel to notify this lead on.
 *
 * Free, unlimited channels come first: web push costs nothing and is fully
 * ours, and the Telegram Bot API has neither a messaging window nor a
 * per-message fee. WhatsApp follows because it has the best open rate of the
 * paid options. SMS is last — it costs money and converts worst.
 */
export function recommendedNotifyChannel(available: string[]): string | null {
  const preference = [
    'webpush',
    'telegram',
    'whatsapp',
    'messenger_psid',
    'email',
    'phone',
  ];
  return preference.find((kind) => available.includes(kind)) || null;
}

// ============================================================
// EDGE GEO RESOLUTION
// ============================================================

export interface ResolvedGeo {
  countryCode: string | null;
  city: string | null;
  ip: string | null;
  /** Which signal won, so the funnel can tell a guess from a fact. */
  source: 'ad-param' | 'edge-header' | 'none';
}

function firstHeader(
  headers: Headers,
  names: string[]
): string | null {
  for (const name of names) {
    const value = headers.get(name);
    if (value && value.trim() && value.trim().toLowerCase() !== 'xx') {
      return value.trim();
    }
  }
  return null;
}

/**
 * Resolve the visitor's location.
 *
 * Ad URL parameters win, because the operator set them deliberately when
 * building the ad set and they are more reliable than IP lookup for expat
 * audiences on corporate or VPN networks. Edge geo headers
 * (Vercel or Cloudflare) are the fallback.
 */
export function resolveGeo(
  headers: Headers,
  adParams?: { country?: string | null; city?: string | null }
): ResolvedGeo {
  const ip =
    firstHeader(headers, ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'])
      ?.split(',')[0]
      ?.trim() || null;

  const paramCountry = adParams?.country?.trim().toUpperCase() || null;
  const paramCity = canonicalCity(adParams?.city);

  if (paramCountry || paramCity) {
    return {
      countryCode: paramCountry,
      city: paramCity,
      ip,
      source: 'ad-param',
    };
  }

  const headerCountry = firstHeader(headers, [
    'x-vercel-ip-country',
    'cf-ipcountry',
    'x-geo-country',
    'x-country-code',
  ]);
  const headerCity = firstHeader(headers, [
    'x-vercel-ip-city',
    'cf-ipcity',
    'x-geo-city',
  ]);

  if (headerCountry || headerCity) {
    return {
      countryCode: headerCountry ? headerCountry.toUpperCase() : null,
      // Vercel percent-encodes city names with spaces.
      city: canonicalCity(
        headerCity ? decodeURIComponent(headerCity) : null
      ),
      ip,
      source: 'edge-header',
    };
  }

  return { countryCode: null, city: null, ip, source: 'none' };
}

/** Local hour in a market, for choosing when to send notifications. */
export function marketLocalHour(market: Market, at: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: market.timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(at);
  return parseInt(formatted, 10);
}

/**
 * Whether now is a good moment to notify this market. The Gulf expat audience
 * reads messages after work, so sends are held to 17:00–23:00 local time.
 */
export function isGoodNotifyHour(market: Market, at: Date = new Date()): boolean {
  const hour = marketLocalHour(market, at);
  return hour >= 17 && hour <= 23;
}
