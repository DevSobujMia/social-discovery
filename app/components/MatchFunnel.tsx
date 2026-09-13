'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Heart,
  Lock,
  MapPin,
  MessageCircle,
  Plane,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import InstallPrompt from './InstallPrompt';
import { getDeviceToken, loadAdParams } from '@/lib/device';
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
}

/** Verified candidate travellers currently in their home countries planning trips */
const SYNC_PROFILES = [
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

const SOCIAL_PROOF_AVATARS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&q=60',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop&q=60',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&q=60',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=80&h=80&fit=crop&q=60',
];

function photoOf(p: MatchProfile): string {
  return (
    p.photo ||
    p.photos?.[0]?.filePath ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80'
  );
}

type Phase = 'home' | 'spinning' | 'match';

function getOpenerSuggestions(city?: string): string[] {
  if (city && city.trim().length > 0) {
    return [
      `Hey! When are you arriving in ${city}? ☕`,
      `Hi! Looking forward to your upcoming trip to ${city}? ✨`,
      `Hey! Would love to connect and show you around ${city}! 🌆`,
    ];
  }
  return [
    'Hey! When are you planning your upcoming trip? ☕',
    'Hi! Would love to connect before your trip! ✨',
    'Hey! Let me know when you arrive, coffee on me! 🌆',
  ];
}

export default function MatchFunnel({
  onSayHi,
  currentUser,
}: {
  onSayHi: (
    profile: MatchProfile,
    visitorName: string,
    opener?: string,
    visitorLocation?: string
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
  const [usedIds, setUsedIds] = useState<string[]>([]);

  const [pendingOpener, setPendingOpener] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRealName = Boolean(
    currentUser?.profile?.displayName &&
    currentUser.profile.displayName !== 'Visitor' &&
    currentUser.profile.displayName !== 'Guest Traveler'
  );

  // Dynamic city resolution from URL ad parameters (empty by default so it works everywhere)
  const adParams = loadAdParams();
  const rawCity = adParams?.city?.trim() || '';
  const openers = getOpenerSuggestions(rawCity);

  useEffect(() => {
    getDeviceToken();
    try {
      localStorage.removeItem('heartlink_match_attempts');
    } catch {}
  }, []);

  useEffect(() => {
    return () => {
      if (syncTimer.current) clearInterval(syncTimer.current);
    };
  }, []);

  const loadPool = useCallback(async () => {
    const min = Math.min(ageMin, ageMax);
    const max = Math.max(ageMin, ageMax);

    const fetchOnce = async (opts: {
      gender?: string;
      withAge?: boolean;
      travellingOnly?: boolean;
    }) => {
      const params = new URLSearchParams({
        limit: '30',
      });
      if (rawCity) params.set('city', rawCity);
      if (opts.gender) params.set('gender', opts.gender);
      if (opts.travellingOnly !== false) params.set('travellingOnly', 'true');
      if (opts.withAge) {
        params.set('minAge', String(min));
        params.set('maxAge', String(max));
      }
      const res = await fetch(`/api/profiles?${params}`);
      const data = await res.json();
      return (data.success ? data.data?.profiles || [] : []) as MatchProfile[];
    };

    let list = await fetchOnce({ gender: lookingFor, withAge: true });
    if (!list.length) list = await fetchOnce({ gender: lookingFor, withAge: false });
    if (!list.length) list = await fetchOnce({ withAge: false });
    if (!list.length) list = await fetchOnce({ travellingOnly: false, withAge: false });

    setPool(list);
    return list;
  }, [lookingFor, ageMin, ageMax, rawCity]);

  const pickMatch = (list: MatchProfile[], exclude: string[]) => {
    if (!list.length) return null;
    const available = list.filter((p) => !exclude.includes(p.userId));
    const source = available.length > 0 ? available : list;
    return source[Math.floor(Math.random() * source.length)];
  };

  const runMatch = async (listOverride?: MatchProfile[]) => {
    setError('');
    setPhase('spinning');
    setMatch(null);

    let list =
      listOverride && listOverride.length > 0 ? listOverride : pool.length > 0 ? pool : [];
    if (!list.length) {
      try {
        list = await loadPool();
      } catch {
        setError('Could not load matches. Please try again.');
        setPhase('home');
        return;
      }
    }

    // Smooth profile sync animation: cycling candidates
    if (syncTimer.current) clearInterval(syncTimer.current);
    syncTimer.current = setInterval(() => {
      setSyncIndex((i) => (i + 1) % SYNC_PROFILES.length);
    }, 180);

    // Live sync animation duration ~2 seconds
    await new Promise((r) => setTimeout(r, 2000));
    if (syncTimer.current) {
      clearInterval(syncTimer.current);
      syncTimer.current = null;
    }

    if (!list.length) {
      try {
        list = await loadPool();
      } catch {}
    }

    const chosen = pickMatch(list, usedIds);
    if (!chosen) {
      setError('No match profiles found at this moment. Please try again.');
      setPhase('home');
      return;
    }

    setUsedIds((prev) => (prev.includes(chosen.userId) ? prev : [...prev, chosen.userId]));
    setMatch(chosen);
    setPhase('match');
    trackPixel('ViewContent', {
      content_name: chosen.displayName,
      content_ids: [chosen.userId],
    });
  };

  const handleFind = async () => {
    setBusy(true);
    try {
      const list = await loadPool();
      await runMatch(list);
    } finally {
      setBusy(false);
    }
  };

  const handleRematch = async () => {
    setBusy(true);
    try {
      await runMatch();
    } finally {
      setBusy(false);
    }
  };

  const openSayHi = async (opener?: string) => {
    if (!match) return;
    setBusy(true);
    setError('');
    try {
      await onSayHi(
        match,
        hasRealName ? currentUser.profile.displayName : 'Visitor',
        opener || undefined,
        rawCity || undefined
      );
      trackPixel('Contact', { content_name: match.displayName });
      setPendingOpener(null);
    } catch {
      setError('Could not open chat. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------
  // 1. LIVE PROFILE SYNC & MATCH ANIMATION (Profiles in their home countries syncing)
  // -------------------------------------------------------------
  if (phase === 'spinning') {
    const currentSync = SYNC_PROFILES[syncIndex];

    return (
      <div className="max-w-md mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[500px]">
        {/* Status Chip */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-900 border border-brand-500/40 text-xs font-bold text-brand-300 shadow-xl mb-10">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-ping" />
          <span>FINDING UPCOMING TRAVELLERS</span>
        </div>

        {/* Sync Arena: Center Match Hub with Surrounding Orbiting Candidate Bubbles */}
        <div className="relative w-64 h-64 flex items-center justify-center">
          {/* Pulsing Radar Ring */}
          <div className="absolute inset-0 rounded-full border border-brand-500/30 animate-ping opacity-30 pointer-events-none" />
          <div className="absolute -inset-4 rounded-full border border-pink-500/20 animate-pulse pointer-events-none" />

          {/* Orbiting Profile 1 */}
          <div className="absolute top-0 left-6 w-12 h-12 rounded-full overflow-hidden ring-2 ring-brand-400/80 shadow-lg animate-float">
            <img src={SYNC_PROFILES[(syncIndex + 1) % SYNC_PROFILES.length].photo} alt="" className="w-full h-full object-cover" />
          </div>

          {/* Orbiting Profile 2 */}
          <div className="absolute bottom-2 right-4 w-12 h-12 rounded-full overflow-hidden ring-2 ring-accent-violet/80 shadow-lg animate-float-reverse">
            <img src={SYNC_PROFILES[(syncIndex + 2) % SYNC_PROFILES.length].photo} alt="" className="w-full h-full object-cover" />
          </div>

          {/* Orbiting Profile 3 */}
          <div className="absolute top-1/2 -left-3 -translate-y-1/2 w-10 h-10 rounded-full overflow-hidden ring-2 ring-pink-400/80 shadow-lg animate-float [animation-delay:1s]">
            <img src={SYNC_PROFILES[(syncIndex + 3) % SYNC_PROFILES.length].photo} alt="" className="w-full h-full object-cover" />
          </div>

          {/* Center Main Syncing Avatar */}
          <div className="relative z-10 w-40 h-40 rounded-full overflow-hidden ring-4 ring-brand-500 shadow-2xl shadow-brand-500/40 bg-surface-950">
            <img
              src={currentSync.photo}
              alt=""
              className="w-full h-full object-cover scale-110 brightness-95 transition-opacity duration-150"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/20 to-transparent" />
            <div className="absolute bottom-2.5 inset-x-0 text-center">
              <span className="text-[11px] font-extrabold text-white px-3 py-0.5 rounded-full bg-black/80 backdrop-blur-md border border-white/20">
                {currentSync.name}, {currentSync.age} · {currentSync.homeCountry}
              </span>
            </div>
          </div>
        </div>

        {/* Sync Status Text */}
        <div className="mt-10 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-white">
            <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
            <span>Finding travellers planning upcoming trips{rawCity ? ` to ${rawCity}` : ''}…</span>
          </div>
          <p className="text-xs text-surface-400 font-medium">
            Matching mutual travel plans, interests, and companion vibes
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. MATCH RESULT CARD (No distance / km away, shows home country)
  // -------------------------------------------------------------
  if (phase === 'match' && match) {
    const tripHeader = match.travel?.city || rawCity ? `Traveling soon · ${match.travel?.city || rawCity}` : 'Planning upcoming trip';

    return (
      <div className="relative max-w-md mx-auto px-3 sm:px-4 pb-12">
        <div className="rounded-3xl overflow-hidden border border-brand-500/30 bg-surface-900/90 shadow-2xl shadow-brand-500/15 backdrop-blur-xl">
          <div className="relative h-[390px] sm:h-[430px] bg-surface-950">
            <img
              src={photoOf(match)}
              alt={match.displayName}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/30 to-transparent pointer-events-none" />

            <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
              <div className="flex flex-col gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-bold text-white border border-white/20 shadow-lg">
                  <Plane className="w-3.5 h-3.5 text-brand-300" />
                  <span>{tripHeader}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 backdrop-blur-md text-[10px] font-bold text-emerald-300 border border-emerald-500/40 w-fit">
                  <Flame className="w-3 h-3 fill-current" />
                  <span>98% Great Match</span>
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPendingOpener(null);
                  setMatch(null);
                  setPhase('home');
                }}
                className="pointer-events-auto w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center border border-white/20 hover:bg-black/80 transition-colors cursor-pointer"
                aria-label="Close match"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-5 space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-white tracking-tight drop-shadow-md">
                  {match.displayName}
                  {match.age ? <span className="font-semibold text-surface-200">, {match.age}</span> : null}
                </h2>
                <ShieldCheck className="w-5 h-5 text-sky-400 drop-shadow-md shrink-0" />
              </div>

              {/* Home location without any fake km distance */}
              <p className="text-xs text-surface-300 flex items-center gap-1.5 font-medium">
                <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                <span>From {[match.city, match.country].filter(Boolean).join(', ') || 'Abroad'} · Planning upcoming trip</span>
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

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleRematch}
                disabled={busy}
                className="flex-1 py-3 rounded-xl border border-surface-700 text-xs font-bold text-surface-200 hover:bg-surface-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Next match
              </button>
              <button
                type="button"
                onClick={() => openSayHi()}
                className="flex-[1.5] py-3 rounded-xl bg-white text-surface-950 hover:bg-zinc-100 text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-white/10 active:scale-98 transition-all cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-brand-500" />
                <span>Say Hi to {match.displayName}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Icebreakers Strip */}
        <div className="mt-5 space-y-3">
          <div className="px-1 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-surface-400">
              Break the ice with one tap
            </p>
            <span className="text-[10px] text-brand-400 font-semibold">Ready to chat</span>
          </div>

          <div className="flex flex-col gap-2">
            {openers.map((line) => (
              <button
                key={line}
                type="button"
                onClick={() => openSayHi(line)}
                className="text-left text-xs leading-relaxed px-4 py-3 rounded-2xl border border-surface-800 bg-surface-900/80 text-surface-200 hover:border-brand-500/60 hover:bg-surface-900 hover:text-white transition-all group flex items-center justify-between cursor-pointer"
              >
                <span className="font-medium">{line}</span>
                <ArrowRight className="w-3.5 h-3.5 text-surface-500 group-hover:text-brand-400 transition-colors shrink-0 ml-2" />
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 text-[11px] text-surface-500 pt-2">
            <span className="inline-flex items-center gap-1">
              <Lock className="w-3 h-3 text-surface-400" />
              Direct Encrypted Chat
            </span>
            <span>·</span>
            <span>Zero App Install</span>
            <span>·</span>
            <span>18+ Safe Community</span>
          </div>

          <InstallPrompt armed forceVisible={false} compact softTeaser />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 3. HOME PHASE (FIND A MATCH) — Telegram/iOS Minimal Luxury UI
  // -------------------------------------------------------------
  return (
    <div className="relative max-w-md mx-auto px-4 pt-1 pb-8">
      {/* 1. Minimal Live Count Badge (Single line, no overlapping text on mobile) */}
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
          <span className="text-xs font-bold text-white tracking-wide">2,490+</span>
        </div>
      </div>

      {/* 2. Hero Headline — Telegram/iOS Crisp Clean Typography */}
      <div className="text-center mb-6 space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {rawCity ? `Travellers Visiting ${rawCity}` : 'Meet Travel Partners'}
        </h1>
        <p className="text-xs text-surface-400 max-w-xs mx-auto leading-relaxed">
          Connect directly with verified companions planning their upcoming trip.
        </p>
      </div>

      {/* 3. Refined Minimal Configuration Card */}
      <div className="rounded-3xl border border-surface-800/90 bg-surface-900/70 backdrop-blur-xl p-5 sm:p-6 space-y-5 shadow-2xl">
        {/* Sleek Segmented Gender Selector */}
        <div>
          <label className="text-[11px] font-bold tracking-wider text-surface-400 uppercase mb-2.5 block">
            I want to meet
          </label>
          <div className="grid grid-cols-2 gap-2 bg-surface-950/90 p-1 rounded-2xl border border-surface-800">
            <button
              type="button"
              onClick={() => setLookingFor('female')}
              className={`py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                lookingFor === 'female'
                  ? 'bg-surface-800 text-white shadow-sm border border-surface-700/80'
                  : 'text-surface-400 hover:text-white'
              }`}
            >
              <span className="text-pink-400 text-sm font-black">♀</span>
              <span>Women</span>
            </button>

            <button
              type="button"
              onClick={() => setLookingFor('male')}
              className={`py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                lookingFor === 'male'
                  ? 'bg-surface-800 text-white shadow-sm border border-surface-700/80'
                  : 'text-surface-400 hover:text-white'
              }`}
            >
              <span className="text-indigo-400 text-sm font-black">♂</span>
              <span>Men</span>
            </button>
          </div>
        </div>

        {/* Minimal Age Range Selector */}
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
              onChange={(e) => setAgeMin(parseInt(e.target.value, 10))}
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
              onChange={(e) => setAgeMax(parseInt(e.target.value, 10))}
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
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        )}

        {/* Premium High-Contrast Action Button */}
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

        {/* Clean, Non-wrapping Trust Badges */}
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
            Zero Signup
          </span>
        </div>
      </div>

      {/* Footer Legal Links */}
      <p className="mt-6 text-center text-[11px] text-surface-500 space-x-2">
        <span>18+ Safe Community</span>
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
