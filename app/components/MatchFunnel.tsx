'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Download,
  Heart,
  Lock,
  MapPin,
  MessageCircle,
  Plane,
  RefreshCw,
  Sparkles,
  X,
  CheckCircle2,
  Flame,
} from 'lucide-react';
import { getDeviceToken, loadAdParams, readBrowserStore, removeBrowserStore } from '@/lib/device';
import { canonicalCity } from '@/lib/market';
import { trackPixel } from '@/lib/pixel';

export interface MatchProfile {
  id: string;
  userId: string;
  displayName: string;
  age?: number | null;
  gender?: string | null;
  country?: string | null;
  city?: string | null;
  bio?: string | null;
  interests?: string[];
  photo?: string | null;
  photos?: Array<{ filePath: string }>;
  travel?: {
    city: string;
    country: string;
    note: string | null;
  } | null;
  matchReason?: string | null;
  isVerified?: boolean;
}

/** Faces used only in the Find click animation. Not live profile data. */
const SYNC_PROFILES_FEMALE = [
  {
    name: 'Elena',
    age: 24,
    homeCountry: 'Czech Republic',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=360&h=360&fit=crop&q=80',
  },
  {
    name: 'Sophia',
    age: 23,
    homeCountry: 'Spain',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=360&h=360&fit=crop&q=80',
  },
  {
    name: 'Chloe',
    age: 25,
    homeCountry: 'France',
    photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=360&h=360&fit=crop&q=80',
  },
  {
    name: 'Maya',
    age: 22,
    homeCountry: 'United Kingdom',
    photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=360&h=360&fit=crop&q=80',
  },
  {
    name: 'Alina',
    age: 24,
    homeCountry: 'Italy',
    photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=360&h=360&fit=crop&q=80',
  },
];

const SYNC_PROFILES_MALE = [
  {
    name: 'Liam',
    age: 29,
    homeCountry: 'Australia',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=360&h=360&fit=crop&q=80',
  },
  {
    name: 'Marcus',
    age: 31,
    homeCountry: 'Canada',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=360&h=360&fit=crop&q=80',
  },
  {
    name: 'Daniel',
    age: 30,
    homeCountry: 'United States',
    photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=360&h=360&fit=crop&q=80',
  },
  {
    name: 'Alexander',
    age: 28,
    homeCountry: 'United Kingdom',
    photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=360&h=360&fit=crop&q=80',
  },
  {
    name: 'Lucas',
    age: 32,
    homeCountry: 'Spain',
    photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=360&h=360&fit=crop&q=80',
  },
];

const SOCIAL_PROOF_AVATARS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&q=60',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop&q=60',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&q=60',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=80&h=80&fit=crop&q=60',
];

function countryFlag(country?: string | null): string {
  if (!country) return '✈️';
  const lower = country.toLowerCase().trim();
  if (lower === 'us' || lower.includes('united states') || lower.includes('usa')) return '🇺🇸';
  if (lower === 'gb' || lower === 'uk' || lower.includes('united kingdom') || lower.includes('england')) return '🇬🇧';
  if (lower.includes('czech') || lower === 'cz') return '🇨🇿';
  if (lower.includes('spain') || lower === 'es') return '🇪🇸';
  if (lower.includes('france') || lower === 'fr') return '🇫🇷';
  if (lower.includes('italy') || lower === 'it') return '🇮🇹';
  if (lower.includes('russia') || lower === 'ru') return '🇷🇺';
  if (lower.includes('germany') || lower === 'de') return '🇩🇪';
  if (lower.includes('canada') || lower === 'ca') return '🇨🇦';
  if (lower.includes('australia') || lower === 'au') return '🇦🇺';
  if (lower.includes('uae') || lower.includes('emirates') || lower === 'ae') return '🇦🇪';
  return '✈️';
}

function photoOf(p: MatchProfile): string {
  return (
    p.photo ||
    p.photos?.[0]?.filePath ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80'
  );
}

function FoundTripCard({
  profile,
  onChat,
}: {
  profile: MatchProfile;
  onChat: () => void;
}) {
  const flag = countryFlag(profile.country);
  const firstName = (profile.displayName || 'Traveller').split(' ')[0];

  return (
    <div
      className="group w-full p-2.5 sm:p-3 rounded-2xl bg-surface-900/95 hover:bg-surface-850 border border-surface-800 hover:border-brand-500/60 shadow-xl hover:shadow-brand-500/15 transition-all duration-300 cursor-pointer backdrop-blur-md flex flex-col"
      onClick={onChat}
    >
      <div className="relative w-full aspect-[4/3.7] sm:aspect-[4/3.5] rounded-xl overflow-hidden bg-surface-950">
        <img
          alt={profile.displayName}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          src={photoOf(profile)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

        {/* Floating Online Badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-surface-950/80 backdrop-blur-md border border-emerald-500/30 flex items-center gap-1 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[10px] font-bold text-emerald-400">Online</span>
        </div>
      </div>

      <div className="pt-2.5 pb-2 px-0.5 flex items-center justify-between">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs sm:text-[13px] font-bold text-white tracking-tight truncate">
            {firstName}
            {profile.age ? (
              <span className="font-semibold text-surface-200">, {profile.age}</span>
            ) : null}
          </span>
          {flag ? <span className="text-xs shrink-0">{flag}</span> : null}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChat();
        }}
        className="w-full py-2 px-2 rounded-xl bg-white hover:bg-zinc-100 text-surface-950 font-extrabold text-[12px] flex items-center justify-center gap-1.5 shadow-md shadow-white/10 active:scale-95 transition-all cursor-pointer"
      >
        <MessageCircle className="w-3.5 h-3.5 text-rose-500 fill-rose-500 shrink-0" />
        <span className="tracking-tight">Send Message</span>
      </button>
    </div>
  );
}

type Phase = 'home' | 'spinning' | 'match';

const DAILY_SEARCH_LIMIT = 2;
const SEARCH_LIMIT_ENABLED = true;

const FALLBACK_FEMALE_PREVIEWS: MatchProfile[] = [
  {
    id: '3e3fad19-3504-46ce-b0f7-0c2181fb65e9',
    userId: 'e6da9d6a-f42e-481d-822e-7d976679bdd0',
    displayName: 'Olivia',
    age: 29,
    gender: 'female',
    city: 'New York',
    country: 'United States',
    photo: '/api/uploads/profiles/w_blonde_street_eb7cd076-c2de-4c55-ba5f-1c4c23de8b14.jpg',
    travel: {
      city: 'Dubai',
      country: 'United Arab Emirates',
      note: 'Traveling soon. Marina and quieter Dubai.',
    },
    isVerified: true,
  },
  {
    id: '98b16593-3492-41ac-ab25-e4b4ce65dfd0',
    userId: 'bbb848f9-a5eb-49de-bc75-a7026992654e',
    displayName: 'Chloe',
    age: 26,
    gender: 'female',
    city: 'Los Angeles',
    country: 'United States',
    photo: '/api/uploads/profiles/w_brunette_dinner_38dcc320-bad4-4f74-9c0b-a5403febecb7.png',
    travel: {
      city: 'Abu Dhabi',
      country: 'United Arab Emirates',
      note: 'Traveling soon to Abu Dhabi.',
    },
    isVerified: true,
  },
];

const FALLBACK_MALE_PREVIEWS: MatchProfile[] = [
  {
    id: 'preview-liam',
    userId: 'preview-liam',
    displayName: 'Liam',
    age: 29,
    gender: 'male',
    city: 'Kuwait City',
    country: 'Australia',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=360&h=360&fit=crop&q=80',
    travel: {
      city: 'Kuwait City',
      country: 'Kuwait',
      note: 'Visiting Kuwait soon',
    },
    isVerified: true,
  },
  {
    id: 'preview-marcus',
    userId: 'preview-marcus',
    displayName: 'Marcus',
    age: 31,
    gender: 'male',
    city: 'Kuwait City',
    country: 'Canada',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=360&h=360&fit=crop&q=80',
    travel: {
      city: 'Kuwait City',
      country: 'Kuwait',
      note: 'Visiting Kuwait soon',
    },
    isVerified: true,
  },
];

function getPersonaKey(p?: MatchProfile | null): string {
  if (!p || !p.displayName) return '';
  const clean = p.displayName.trim().toLowerCase();
  const firstWord = clean.replace(/[^a-z0-9]/g, ' ').split(/\s+/)[0] || '';
  return firstWord;
}

function getPhotoKey(p?: MatchProfile | null): string {
  if (!p || !p.photo) return '';
  return p.photo.split('?')[0].trim().toLowerCase();
}

const SEEN_PROFILES_KEY_PREFIX = 'cityhost_seen_profiles_';

interface DailySearchData {
  count: number;
  resetAt: number;
}

export default function MatchFunnel({
  onSayHi,
  currentUser,
}: {
  onSayHi: (
    profile: MatchProfile,
    visitorName: string,
    opener?: string,
    visitorLocation?: string,
    prefs?: { lookingForGender: 'female' | 'male' }
  ) => Promise<void>;
  currentUser?: any | null;
}) {
  const [phase, setPhase] = useState<Phase>('home');
  const [lookingFor, setLookingFor] = useState<'female' | 'male'>('female');
  const [ageMin, setAgeMin] = useState(20);
  const [ageMax, setAgeMax] = useState(32);
  const [syncIndex, setSyncIndex] = useState(0);
  const [match, setMatch] = useState<MatchProfile | null>(null);
  const [pool, setPool] = useState<MatchProfile[]>([]);
  /** Profiles already shown this session for the current lookingFor gender (persisted across visits). */
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const usedIdsRef = useRef<string[]>([]);
  usedIdsRef.current = usedIds;

  // Hydrate seen profile IDs from localStorage on mount & when gender switches
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${SEEN_PROFILES_KEY_PREFIX}${lookingFor}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setUsedIds(parsed);
          usedIdsRef.current = parsed;
          return;
        }
      }
      setUsedIds([]);
      usedIdsRef.current = [];
    } catch {
      setUsedIds([]);
      usedIdsRef.current = [];
    }
  }, [lookingFor]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [limitToast, setLimitToast] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const limitToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hydrate after mount — reading localStorage during render breaks SSR/client match.
  const [savedGuestName, setSavedGuestName] = useState<string | null>(null);
  // Dynamic city resolution from URL ad parameters (hydrated on client mount to avoid SSR mismatch)
  const [rawCity, setRawCity] = useState('');

  // Daily search limit state & saved matched history
  const [searchData, setSearchData] = useState<DailySearchData>({
    count: 0,
    resetAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  const [matchedHistory, setMatchedHistory] = useState<MatchProfile[]>([]);
  const matchedHistoryRef = useRef<MatchProfile[]>([]);
  matchedHistoryRef.current = matchedHistory;

  // Default 2 preview profiles matching Facebook Ad creatives exactly (Olivia & Chloe for women, or top male profiles)
  const defaultProfiles = useMemo(() => {
    if (lookingFor === 'female') {
      const olivia =
        pool.find((p) => p.displayName?.trim().toLowerCase().startsWith('olivia')) ||
        FALLBACK_FEMALE_PREVIEWS[0];
      const chloe =
        pool.find((p) => p.displayName?.trim().toLowerCase().startsWith('chloe')) ||
        FALLBACK_FEMALE_PREVIEWS[1];
      return [olivia, chloe];
    }

    const targetCity = rawCity || 'your city';
    const baseFallbacks = FALLBACK_MALE_PREVIEWS.map((fb) => ({
      ...fb,
      city: targetCity,
      travel: fb.travel
        ? {
            ...fb.travel,
            city: targetCity,
            note: `Visiting ${targetCity} soon`,
          }
        : null,
    }));

    // Filter active profiles in pool matching lookingFor gender
    const candidates = pool.filter(
      (p) =>
        p.userId &&
        p.gender &&
        p.gender.trim().toLowerCase() === 'male'
    );

    if (candidates.length === 0) {
      return baseFallbacks.slice(0, 2);
    }

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const picked: MatchProfile[] = [];
    const seenUserIds = new Set<string>();
    const seenPersonas = new Set<string>();

    for (const p of shuffled) {
      if (picked.length >= 2) break;
      const persona = getPersonaKey(p);
      if (!seenUserIds.has(p.userId) && (!persona || !seenPersonas.has(persona))) {
        picked.push(p);
        seenUserIds.add(p.userId);
        if (persona) seenPersonas.add(persona);
      }
    }

    return picked.length >= 2 ? picked.slice(0, 2) : baseFallbacks.slice(0, 2);
  }, [pool, lookingFor, rawCity]);

  // If user has performed searches, display their recent finds; otherwise display the default fixed profiles
  const displayedProfiles = useMemo(() => {
    // If no recent search matches, show the 2 default ad profiles
    if (!matchedHistory || matchedHistory.length === 0) {
      return defaultProfiles;
    }

    // Filter matchedHistory matching current lookingFor gender if possible
    const genderedHistory = matchedHistory.filter(
      (p) => !p.gender || p.gender.trim().toLowerCase() === lookingFor.trim().toLowerCase()
    );

    const historyToUse = genderedHistory.length > 0 ? genderedHistory : matchedHistory;

    if (historyToUse.length >= 2) {
      return [historyToUse[0], historyToUse[1]];
    }

    if (historyToUse.length === 1) {
      // 1 from recent search, fill 2nd slot with default profile that doesn't duplicate the 1st
      const fallback =
        defaultProfiles.find((dp) => dp.userId !== historyToUse[0].userId) || defaultProfiles[0];
      return [historyToUse[0], fallback];
    }

    return defaultProfiles;
  }, [matchedHistory, defaultProfiles, lookingFor]);

  // Initialize search limit and matched history from localStorage on client mount
  useEffect(() => {
    try {
      const searchRaw = localStorage.getItem('cityhost_daily_searches');
      if (searchRaw) {
        const parsed = JSON.parse(searchRaw) as DailySearchData;
        if (parsed && typeof parsed.count === 'number' && typeof parsed.resetAt === 'number') {
          if (Date.now() < parsed.resetAt) {
            setSearchData(parsed);
          } else {
            // Expired — reset count
            const fresh: DailySearchData = { count: 0, resetAt: Date.now() + 24 * 60 * 60 * 1000 };
            setSearchData(fresh);
            localStorage.setItem('cityhost_daily_searches', JSON.stringify(fresh));
          }
        }
      }

      const histRaw = localStorage.getItem('cityhost_matched_history');
      if (histRaw) {
        const parsedHist = JSON.parse(histRaw);
        if (Array.isArray(parsedHist)) {
          matchedHistoryRef.current = parsedHist;
          setMatchedHistory(parsedHist);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      setSavedGuestName(readBrowserStore('local', 'guest_name'));
    } catch {
      setSavedGuestName(null);
    }
  }, [currentUser?.profile?.displayName]);

  useEffect(() => {
    const params = loadAdParams();
    const city = canonicalCity(params?.city || params?.destination);
    if (city) setRawCity(city);
  }, []);

  // Dynamic realistic online customer count (1,700 to 2,700, updates naturally every 2-4 minutes)
  const [onlineCount, setOnlineCount] = useState<number>(2490);

  useEffect(() => {
    const MIN_ONLINE = 1700;
    const MAX_ONLINE = 2700;

    let current = 2490;
    try {
      const stored = localStorage.getItem('cityhost_online_count_v1');
      const storedTime = localStorage.getItem('cityhost_online_time_v1');
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= MIN_ONLINE && val <= MAX_ONLINE) {
          current = val;
          if (storedTime) {
            const elapsedMins = Math.floor((Date.now() - parseInt(storedTime, 10)) / (1000 * 60));
            if (elapsedMins >= 2) {
              const cycles = Math.min(10, Math.floor(elapsedMins / 3));
              let drift = 0;
              for (let i = 0; i < cycles; i++) {
                drift += Math.floor(Math.random() * 15) - 7;
              }
              current = Math.min(MAX_ONLINE, Math.max(MIN_ONLINE, current + drift));
            }
          }
        }
      } else {
        current = 2450 + Math.floor(Math.random() * 70) - 30;
      }
    } catch {
      current = 2490;
    }

    setOnlineCount(current);
    try {
      localStorage.setItem('cityhost_online_count_v1', String(current));
      localStorage.setItem('cityhost_online_time_v1', String(Date.now()));
    } catch {}

    let timerId: ReturnType<typeof setTimeout>;

    const scheduleNextUpdate = () => {
      // Natural interval between 2 to 4 minutes (120,000ms - 240,000ms)
      const delay = Math.floor(Math.random() * (240000 - 120000 + 1)) + 120000;
      timerId = setTimeout(() => {
        setOnlineCount((prev) => {
          // Subtle realistic fluctuation (-6 to +8)
          const delta = Math.floor(Math.random() * 15) - 6;
          const nextVal = Math.min(MAX_ONLINE, Math.max(MIN_ONLINE, prev + delta));
          try {
            localStorage.setItem('cityhost_online_count_v1', String(nextVal));
            localStorage.setItem('cityhost_online_time_v1', String(Date.now()));
          } catch {}
          return nextVal;
        });
        scheduleNextUpdate();
      }, delay);
    };

    scheduleNextUpdate();

    return () => {
      clearTimeout(timerId);
    };
  }, []);

  const currentDisplayName =
    currentUser?.profile?.displayName &&
    currentUser.profile.displayName !== 'Visitor' &&
    currentUser.profile.displayName !== 'Guest Traveler'
      ? currentUser.profile.displayName
      : savedGuestName &&
        savedGuestName !== 'Visitor' &&
        savedGuestName !== 'Guest Traveler'
      ? savedGuestName
      : null;

  useEffect(() => {
    getDeviceToken();
    try {
      removeBrowserStore('local', 'match_attempts');
    } catch {}
  }, []);

  useEffect(() => {
    return () => {
      if (syncTimer.current) clearInterval(syncTimer.current);
      if (limitToastTimer.current) clearTimeout(limitToastTimer.current);
    };
  }, []);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg?: string) => {
    setError('');
    setToastMessage(
      msg ||
        'Today’s search limit is done. Try again tomorrow — your limit will increase over time.'
    );
    setLimitToast(true);
    if (limitToastTimer.current) clearTimeout(limitToastTimer.current);
    limitToastTimer.current = setTimeout(() => {
      setLimitToast(false);
      setToastMessage(null);
    }, 3200);
  }, []);

  const showLimitToast = useCallback(() => {
    showToast();
  }, [showToast]);

  const handleInstallClick = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // 1. Direct 1-Click Native Install Prompt
    const deferredPrompt = (window as any)?.__pwaInstallPrompt;
    if (deferredPrompt && typeof deferredPrompt.prompt === 'function') {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
          (window as any).__pwaInstallPrompt = null;
          showToast('App installed successfully!');
          return;
        }
      } catch {}
    }

    // 2. iOS Safari: trigger Web Share API for Add to Home Screen
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIosDevice =
      /iPhone|iPad|iPod/.test(ua) ||
      (typeof navigator !== 'undefined' &&
        navigator.platform === 'MacIntel' &&
        navigator.maxTouchPoints > 1);

    if (isIosDevice) {
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: 'City Host',
            text: 'Travellers visiting your city',
            url: window.location.href,
          });
          showToast('In the share sheet, tap "Add to Home Screen"');
          return;
        } catch {}
      }
      showToast('Tap Share [↑] in Safari, then tap "Add to Home Screen"');
      return;
    }

    // 3. Android In-App / Chrome
    const isAndroidDevice = /Android/i.test(ua);
    const isInApp =
      /Instagram|FBAN|FBAV|FB_IAB|Facebook|Line\/|TikTok|Bytedance|Snapchat|WhatsApp/i.test(
        ua
      );
    if (isInApp && isAndroidDevice) {
      const host =
        typeof window !== 'undefined' ? window.location.host : 'cityhost.live';
      const path =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '/';
      const intentUrl = `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;end`;
      try {
        window.location.href = intentUrl;
        showToast('Opening in Chrome to install app...');
        return;
      } catch {}
    }

    if (isAndroidDevice) {
      showToast('Tap ⋮ (top right menu) and select "Add to Home screen"');
      return;
    }

    // 4. Desktop / Generic
    showToast('Press Ctrl+D (Cmd+D on Mac) or click the Install icon in the URL bar');
  }, [showToast]);

  const limitToastEl =
    limitToast && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 pointer-events-none">
            <div
              className="max-w-xs w-full bg-surface-900 border border-brand-500/40 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-2xl text-center leading-relaxed"
              style={{ animation: 'slideUp 0.25s ease-out' }}
            >
              {toastMessage ||
                'Today’s search limit is done. Try again tomorrow — your limit will increase over time.'}
            </div>
          </div>,
          document.body
        )
      : null;

  const loadPool = useCallback(async () => {
    const min = Math.min(ageMin, ageMax);
    const max = Math.max(ageMin, ageMax);

    const fetchOnce = async (opts: {
      gender?: string;
      withAge?: boolean;
      travellingOnly?: boolean;
      ignoreCity?: boolean;
      limit?: number;
    }) => {
      const params = new URLSearchParams({
        limit: String(opts.limit ?? 50),
      });
      if (rawCity && !opts.ignoreCity) params.set('city', rawCity);
      if (opts.gender) params.set('gender', opts.gender);
      if (opts.travellingOnly !== false) params.set('travellingOnly', 'true');
      if (opts.withAge) {
        params.set('minAge', String(min));
        params.set('maxAge', String(max));
      }
      const res = await fetch(`/api/profiles?${params}`, { cache: 'no-store' });
      const data = await res.json();
      return (data.success ? data.data?.profiles || [] : []) as MatchProfile[];
    };

    // Strict non-negotiable gender filter: NEVER allow opposite gender in matches
    const strictGender = (items: MatchProfile[]) =>
      items.filter(
        (p) =>
          p.gender &&
          p.gender.trim().toLowerCase() === lookingFor.trim().toLowerCase()
      );

    const tripCityOf = (p: MatchProfile) =>
      canonicalCity(p.travel?.city)?.toLowerCase() || '';
    const wantCity = canonicalCity(rawCity)?.toLowerCase() || '';
    const sameAdCity = (p: MatchProfile) =>
      !wantCity || tripCityOf(p) === wantCity;

    const seen = new Set<string>();
    const merged: MatchProfile[] = [];
    const pushUnique = (items: MatchProfile[]) => {
      for (const p of strictGender(items)) {
        if (!p.userId || seen.has(p.userId) || !sameAdCity(p)) continue;
        seen.add(p.userId);
        merged.push(p);
      }
    };

    // 1. Exact gender + ad city + age + active trip
    pushUnique(
      await fetchOnce({ gender: lookingFor, withAge: true, travellingOnly: true })
    );
    // 2. Exact gender + ad city + any age + active trip
    pushUnique(
      await fetchOnce({ gender: lookingFor, withAge: false, travellingOnly: true })
    );

    const pushAnyCity = (items: MatchProfile[]) => {
      for (const p of strictGender(items)) {
        if (!p.userId || seen.has(p.userId)) continue;
        seen.add(p.userId);
        merged.push(p);
      }
    };

    // If pool has fewer than 15 profiles, append other available travel profiles
    // so the visitor can discover all profiles in the site without early repeats.
    if (!wantCity || merged.length < 15) {
      pushAnyCity(
        await fetchOnce({
          gender: lookingFor,
          withAge: false,
          travellingOnly: true,
          ignoreCity: true,
        })
      );
      pushAnyCity(
        await fetchOnce({
          gender: lookingFor,
          travellingOnly: false,
          withAge: false,
          ignoreCity: true,
        })
      );
    }

    setPool(merged);
    return merged;
  }, [lookingFor, ageMin, ageMax, rawCity]);

  // Switching gender resets pool and matching phase (seen IDs are restored per gender from localStorage)
  useEffect(() => {
    setPool([]);
    setMatch(null);
    setPhase((p) => (p === 'match' || p === 'spinning' ? 'home' : p));
    loadPool().catch(() => {});
  }, [lookingFor, loadPool]);

  // Listen for global pull-to-refresh event
  useEffect(() => {
    const handleRefresh = () => {
      loadPool().catch(() => {});
    };
    window.addEventListener('cityhost:refresh-pool', handleRefresh);
    return () => window.removeEventListener('cityhost:refresh-pool', handleRefresh);
  }, [loadPool]);

  /**
   * No repeats until every single profile in the pool was shown once.
   * Customers never see the same profile twice until all profiles are exhausted.
   * Also prioritizes showing distinct personas before repeating the same persona.
   */
  const pickMatch = (list: MatchProfile[], exclude: string[]) => {
    // 1. Strict gender match
    const genderMatches = list.filter((p) => {
      return (
        p.userId &&
        p.gender &&
        p.gender.trim().toLowerCase() === lookingFor.trim().toLowerCase()
      );
    });
    if (!genderMatches.length) return { chosen: null as MatchProfile | null, resetUsed: false };

    // 2. Unseen profiles: strictly exclude any profile that has already been shown to this customer
    let unseen = genderMatches.filter((p) => !exclude.includes(p.userId));
    let resetUsed = false;

    // 3. Only when ALL profiles in the site have been shown to this visitor, reset the cycle!
    if (!unseen.length) {
      unseen = genderMatches;
      resetUsed = true;
    }

    // 4. Prefer profiles visiting the ad city if any unseen profiles match it
    let candidates = unseen;
    if (rawCity) {
      const want = canonicalCity(rawCity)?.toLowerCase();
      const cityMatches = unseen.filter((p) => {
        const got = canonicalCity(p.travel?.city || p.city)?.toLowerCase();
        return Boolean(want && got && want === got);
      });
      if (cityMatches.length > 0) {
        candidates = cityMatches;
      }
    }

    // 5. Diversity check: prefer showing personas (first names) that haven't been shown in this cycle
    const seenPersonas = new Set(
      genderMatches
        .filter((p) => exclude.includes(p.userId))
        .map(getPersonaKey)
        .filter(Boolean)
    );

    const freshPersonas = candidates.filter(
      (p) => !seenPersonas.has(getPersonaKey(p))
    );
    const poolToPick = freshPersonas.length > 0 ? freshPersonas : candidates;

    // Pick randomly from the eligible pool
    const chosen = poolToPick[Math.floor(Math.random() * poolToPick.length)] || candidates[0];
    return { chosen, resetUsed };
  };

  const saveToMatchedHistory = (profile: MatchProfile) => {
    const filtered = matchedHistoryRef.current.filter((p) => p.userId !== profile.userId);
    const updated = [profile, ...filtered].slice(0, DAILY_SEARCH_LIMIT);
    matchedHistoryRef.current = updated;
    try {
      localStorage.setItem('cityhost_matched_history', JSON.stringify(updated));
    } catch {}
    setMatchedHistory(updated);
  };

  const runMatch = async (listOverride?: MatchProfile[]) => {
    setError('');
    setPhase('spinning');
    setMatch(null);

    // Scroll to top instantly so the radar matching animation is in full view
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    const syncCandidates =
      lookingFor === 'male' ? SYNC_PROFILES_MALE : SYNC_PROFILES_FEMALE;

    if (syncTimer.current) clearInterval(syncTimer.current);
    syncTimer.current = setInterval(() => {
      setSyncIndex((i) => (i + 1) % syncCandidates.length);
    }, 160);

    let list: MatchProfile[] = [];
    try {
      // Parallelize pool loading in the background with the radar spinning animation
      const [loadedList] = await Promise.all([
        (async () => {
          if (listOverride && listOverride.length > 0) return listOverride;
          if (pool.length > 0) return pool;
          try {
            return await loadPool();
          } catch {
            return [];
          }
        })(),
        new Promise((r) => setTimeout(r, 1800)),
      ]);
      list = loadedList;
    } catch {
      list = [];
    } finally {
      if (syncTimer.current) {
        clearInterval(syncTimer.current);
        syncTimer.current = null;
      }
    }

    if (!list.length) {
      setError(
        rawCity
          ? `No travellers visiting ${rawCity} right now. Please try again in a moment.`
          : 'No travellers available right now. Please try again in a moment.'
      );
      setPhase('home');
      return;
    }

    const exclude = usedIdsRef.current;
    const { chosen, resetUsed } = pickMatch(list, exclude);
    if (!chosen) {
      setError(
        rawCity
          ? `No travellers visiting ${rawCity} right now. Please try again in a moment.`
          : 'No travellers available right now. Please try again in a moment.'
      );
      setPhase('home');
      return;
    }

    const nextUsed = resetUsed
      ? [chosen.userId]
      : exclude.includes(chosen.userId)
        ? exclude
        : [...exclude, chosen.userId];
    usedIdsRef.current = nextUsed;
    setUsedIds(nextUsed);
    try {
      localStorage.setItem(`${SEEN_PROFILES_KEY_PREFIX}${lookingFor}`, JSON.stringify(nextUsed));
    } catch {}

    setMatch(chosen);
    setPhase('match');
    saveToMatchedHistory(chosen);

    trackPixel('ViewContent', {
      content_name: chosen.displayName,
      content_ids: [chosen.userId],
    });
  };

  const handleFind = async () => {
    if (SEARCH_LIMIT_ENABLED && searchData.count >= DAILY_SEARCH_LIMIT) {
      showLimitToast();
      return;
    }

    // 1. Immediately switch to matching radar phase with zero delay
    setError('');
    setPhase('spinning');
    setMatch(null);
    setBusy(true);

    try {
      if (SEARCH_LIMIT_ENABLED) {
        const nextCount = searchData.count + 1;
        const nextData: DailySearchData = { ...searchData, count: nextCount };
        setSearchData(nextData);
        try {
          localStorage.setItem('cityhost_daily_searches', JSON.stringify(nextData));
        } catch {}
      }

      // 2. Run background matching & loading while radar animation spins
      await runMatch();
    } finally {
      setBusy(false);
    }
  };

  const handleRematch = async () => {
    if (SEARCH_LIMIT_ENABLED && searchData.count >= DAILY_SEARCH_LIMIT) {
      showLimitToast();
      return;
    }

    // Immediately switch to matching radar phase with zero delay
    setError('');
    setPhase('spinning');
    setMatch(null);
    setBusy(true);

    try {
      if (SEARCH_LIMIT_ENABLED) {
        const nextCount = searchData.count + 1;
        const nextData: DailySearchData = { ...searchData, count: nextCount };
        setSearchData(nextData);
        try {
          localStorage.setItem('cityhost_daily_searches', JSON.stringify(nextData));
        } catch {}
      }

      await runMatch(pool);
    } finally {
      setBusy(false);
    }
  };

  const openSayHi = async (targetProfile?: MatchProfile, opener?: string) => {
    const chosen = targetProfile || match;
    if (!chosen) return;
    setBusy(true);
    setError('');
    try {
      await onSayHi(
        chosen,
        currentDisplayName || 'Visitor',
        opener || undefined,
        rawCity || undefined,
        { lookingForGender: lookingFor }
      );
      trackPixel('Contact', { content_name: chosen.displayName });
    } catch {
      setError('Could not open chat. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------
  // 1. LIVE PROFILE SYNC ANIMATION
  // -------------------------------------------------------------
  if (phase === 'spinning') {
    const syncCandidates =
      lookingFor === 'male' ? SYNC_PROFILES_MALE : SYNC_PROFILES_FEMALE;
    const currentSync = syncCandidates[syncIndex % syncCandidates.length];

    return (
      <div className="max-w-md mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[500px]">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-900 border border-brand-500/40 text-xs font-bold text-brand-300 shadow-xl mb-10">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-ping" />
          <span>FINDING UPCOMING TRAVELLERS</span>
        </div>

        <div className="relative w-64 h-64 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-brand-500/30 animate-ping opacity-30 pointer-events-none" />
          <div className="absolute -inset-4 rounded-full border border-pink-500/20 animate-pulse pointer-events-none" />

          <div className="absolute top-0 left-6 w-12 h-12 rounded-full overflow-hidden ring-2 ring-brand-400/80 shadow-lg animate-float">
            <img
              src={syncCandidates[(syncIndex + 1) % syncCandidates.length].photo}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>

          <div className="absolute bottom-2 right-4 w-12 h-12 rounded-full overflow-hidden ring-2 ring-accent-violet/80 shadow-lg animate-float-reverse">
            <img
              src={syncCandidates[(syncIndex + 2) % syncCandidates.length].photo}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>

          <div className="absolute top-1/2 -left-3 -translate-y-1/2 w-10 h-10 rounded-full overflow-hidden ring-2 ring-pink-400/80 shadow-lg animate-float [animation-delay:1s]">
            <img
              src={syncCandidates[(syncIndex + 3) % syncCandidates.length].photo}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>

          <div className="relative w-36 h-36 rounded-full overflow-hidden ring-4 ring-white/20 shadow-2xl transition-all duration-200">
            <img
              src={currentSync.photo}
              alt={currentSync.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end items-center pb-2 text-white">
              <span className="text-xs font-bold">{currentSync.name}, {currentSync.age}</span>
              <span className="text-[10px] text-surface-300">{currentSync.homeCountry}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center space-y-1">
          <p className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 text-brand-400 animate-spin" />
            <span>Matching verified profiles…</span>
          </p>
          <p className="text-xs text-surface-400">
            {rawCity ? `Travellers planning trips to ${rawCity}` : 'Connecting with verified travellers'}
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. MATCH PHASE (ONE HERO CANDIDATE)
  // -------------------------------------------------------------
  if (phase === 'match' && match) {
    // const remainingSearches = Math.max(0, DAILY_SEARCH_LIMIT - searchData.count);

    return (
      <div className="relative max-w-md mx-auto px-4 pt-1 pb-8 animate-fade-in">
        {limitToastEl}
        {/* Header Ribbon */}
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            type="button"
            onClick={() => {
              if (match) saveToMatchedHistory(match);
              setPhase('home');
            }}
            className="text-xs font-semibold text-surface-400 hover:text-white transition flex items-center gap-1.5 p-2 -ml-2 min-h-[44px] cursor-pointer"
          >
            ← Back to search
          </button>
          {SEARCH_LIMIT_ENABLED && (
            <span className="text-[11px] font-extrabold text-brand-400 px-3 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>{Math.max(0, DAILY_SEARCH_LIMIT - searchData.count)}/{DAILY_SEARCH_LIMIT} searches left today</span>
            </span>
          )}
        </div>

        {/* Hero Match Card */}
        <div className="rounded-3xl overflow-hidden border border-brand-500/30 bg-surface-900/90 shadow-2xl shadow-brand-500/15 backdrop-blur-xl">
          <div className="relative aspect-[4/4.5] w-full bg-surface-950 overflow-hidden">
            <img
              src={photoOf(match)}
              alt={match.displayName}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/20 to-transparent" />

            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-bold text-white border border-white/20 shadow-lg">
                <Plane className="w-3.5 h-3.5 text-accent-teal" />
                <span>{match.travel?.city ? `Visiting ${match.travel.city}` : 'Upcoming Trip'}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 backdrop-blur-md text-[10px] font-bold text-emerald-300 border border-emerald-500/40 w-fit">
                Trip shared
              </span>
            </div>

            <div className="absolute bottom-3 left-4 right-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-black text-white drop-shadow-md">
                  {match.displayName}
                </h2>
                {match.age && (
                  <span className="text-lg font-bold text-surface-200">
                    {match.age}
                  </span>
                )}
                {match.country && (
                  <span className="text-base">{countryFlag(match.country)}</span>
                )}
              </div>

              <p className="text-xs text-surface-300 flex items-center gap-1.5 font-medium mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                <span>From {[match.city, match.country].filter(Boolean).join(', ') || 'Abroad'}</span>
              </p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-xs text-surface-200 leading-relaxed">
              {match.travel?.note || match.bio || 'Planning an upcoming trip and looking for someone local to connect with for coffee, exploring, or dinner.'}
            </p>

            {((match.interests && match.interests.length > 0) ? match.interests : ['Travel', 'Brunch', 'Design', 'Culture']).slice(0, 5).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {((match.interests && match.interests.length > 0) ? match.interests : ['Travel', 'Brunch', 'Design', 'Culture']).slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-surface-800/90 text-surface-300 border border-surface-700/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {error && (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleRematch}
                disabled={busy}
                className="flex-1 py-3 rounded-xl border border-surface-700 text-xs font-bold text-surface-200 hover:bg-surface-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Next find
              </button>
              <button
                type="button"
                onClick={() => openSayHi(match)}
                className="flex-[1.5] py-3 rounded-xl bg-white text-surface-950 hover:bg-zinc-100 text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-white/10 active:scale-98 transition-all cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-brand-500" />
                <span>Say Hi to {match.displayName}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 3. HOME PHASE (FIND A MATCH)
  // -------------------------------------------------------------
  return (
    <div className="relative max-w-md mx-auto px-4 pt-1 pb-8">
      {limitToastEl}
      <div className="flex items-center justify-center mb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-900/90 border border-surface-800 shadow-sm backdrop-blur-md">
          <div className="flex -space-x-1.5 overflow-hidden shrink-0">
            {SOCIAL_PROOF_AVATARS.slice(0, 3).map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                className="w-4 h-4 rounded-full object-cover ring-1 ring-surface-950"
              />
            ))}
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span suppressHydrationWarning className="text-xs font-bold text-white tracking-wide">
            {onlineCount.toLocaleString()}+
          </span>
        </div>
      </div>

      <div className="text-center mb-6 space-y-1.5">
        <h1 suppressHydrationWarning className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {rawCity ? `Meet Travelers in ${rawCity}.` : 'Meet Travelers in your city.'}
        </h1>
        <p className="text-xs text-surface-400 max-w-sm mx-auto leading-relaxed">
          Connect with travelers who have shared their trip plans and are looking for a local friend or guide.
        </p>
      </div>

      {/* 1. Instant Profile Cards (Above The Fold) */}
      <div className="mb-6 select-none">
        <div className="flex items-center justify-between px-1 mb-3">
          <div className="flex items-center gap-2">
            <Plane className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-surface-300">
              {matchedHistory && matchedHistory.length > 0
                ? 'Your Recent Matches'
                : 'Travellers Visiting Soon'}
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Online Now
          </span>
        </div>
        {displayedProfiles.length > 0 ? (
          <div className="grid grid-cols-2 gap-3.5 sm:gap-4 w-full py-1">
            {displayedProfiles.map((p) => (
              <FoundTripCard key={p.userId} profile={p} onChat={() => openSayHi(p)} />
            ))}
          </div>
        ) : null}
      </div>

      {/* 2. Custom Match / Search Card */}
      <div className="rounded-3xl border border-surface-800/90 bg-surface-900/70 backdrop-blur-xl p-5 sm:p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-800/70 pb-3">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            <span>Find More Companions</span>
          </span>
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 active:scale-95 border border-brand-500/30 text-brand-300 hover:text-white text-[11px] font-bold transition cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-brand-400" />
            <span>Install App</span>
          </button>
        </div>

        <div>
          <label className="text-[11px] font-bold tracking-wider text-surface-400 uppercase mb-2.5 block">
            I want to meet
          </label>
          <div
            className="relative grid grid-cols-2 bg-surface-950/90 p-1 rounded-2xl border border-surface-800"
            role="radiogroup"
            aria-label="I want to meet"
          >
            <span
              aria-hidden
              className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-xl bg-surface-800 border border-surface-700/80 shadow-sm transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                lookingFor === 'male' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />
            <button
              type="button"
              role="radio"
              aria-checked={lookingFor === 'female'}
              onClick={() => setLookingFor('female')}
              className={`relative z-10 py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors duration-300 ${
                lookingFor === 'female' ? 'text-white' : 'text-surface-400 hover:text-white'
              }`}
            >
              <span className="text-pink-400 text-sm font-black">♀</span>
              <span>Women</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={lookingFor === 'male'}
              onClick={() => setLookingFor('male')}
              className={`relative z-10 py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors duration-300 ${
                lookingFor === 'male' ? 'text-white' : 'text-surface-400 hover:text-white'
              }`}
            >
              <span className="text-indigo-400 text-sm font-black">♂</span>
              <span>Men</span>
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-bold tracking-wider text-surface-400 uppercase">
              Age Range
            </label>
            <span className="text-xs font-bold text-white bg-surface-800 px-2.5 py-0.5 rounded-lg border border-surface-700/60">
              {ageMin} — {ageMax} yrs
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={ageMin}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                setAgeMin(next);
                if (next > ageMax) setAgeMax(next);
              }}
              className="bg-surface-950/90 border border-surface-800 text-white py-2.5 px-3 text-xs flex-1 rounded-xl focus:outline-none focus:border-surface-600 cursor-pointer"
            >
              {Array.from({ length: 33 }, (_, i) => 18 + i).map((n) => (
                <option key={n} value={n} className="bg-surface-900 text-white">
                  {n} yrs
                </option>
              ))}
            </select>
            <span className="text-surface-500 text-xs font-medium">to</span>
            <select
              value={ageMax}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                setAgeMax(next);
                if (next < ageMin) setAgeMin(next);
              }}
              className="bg-surface-950/90 border border-surface-800 text-white py-2.5 px-3 text-xs flex-1 rounded-xl focus:outline-none focus:border-surface-600 cursor-pointer"
            >
              {Array.from({ length: 33 }, (_, i) => 18 + i).map((n) => (
                <option key={n} value={n} className="bg-surface-900 text-white">
                  {n} yrs
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-between text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3.5 py-2.5">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-rose-400 hover:text-rose-200 p-1 cursor-pointer"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleFind}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-white text-surface-950 hover:bg-zinc-100 active:scale-[0.98] text-sm font-bold flex items-center justify-center gap-2 shadow-xl shadow-white/10 transition-all cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4 text-brand-500" />
          <span>Find My Travel Match</span>
          <ArrowRight className="w-4 h-4 text-surface-600" />
        </button>

        <div className="flex items-center justify-center gap-3 pt-1 text-[11px] text-surface-400">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            Private Chat
          </span>
          <span className="text-surface-700">·</span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
            Verified Trips
          </span>
          <span className="text-surface-700">·</span>
          <span className="flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-rose-400 fill-current" />
            Chat in City Host
          </span>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-surface-500 space-x-2">
        <span>Private Chat</span>
        <span>·</span>
        <a href="/legal/terms" className="hover:text-surface-300">
          Terms
        </a>
        <span>·</span>
        <a href="/legal/privacy" className="hover:text-surface-300">
          Privacy
        </a>
      </p>
    </div>
  );

}
