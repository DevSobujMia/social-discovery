'use client';

import React from 'react';
import { Plane, Sparkles, MessageCircle, MapPin } from 'lucide-react';
import type { MatchProfile } from './MatchFunnel';

interface Props {
  profiles: MatchProfile[];
  onSelectProfile: (profile: MatchProfile) => void;
  rawCity?: string;
}

const FALLBACK_TRAVELLERS: MatchProfile[] = [
  {
    id: 'fb-1',
    userId: 'seed-elena',
    displayName: 'Elena',
    age: 24,
    gender: 'female',
    country: 'Czech Republic',
    city: 'Prague',
    bio: 'Visiting for 5 days. Looking for friendly locals for coffee & exploring!',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=360&h=360&fit=crop&q=80',
    matchReason: 'Arriving this week',
  },
  {
    id: 'fb-2',
    userId: 'seed-sophia',
    displayName: 'Sophia',
    age: 23,
    gender: 'female',
    country: 'Spain',
    city: 'Barcelona',
    bio: 'First time visiting! Would love a city guide companion.',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=360&h=360&fit=crop&q=80',
    matchReason: 'Solo traveller',
  },
  {
    id: 'fb-3',
    userId: 'seed-chloe',
    displayName: 'Chloe',
    age: 25,
    gender: 'female',
    country: 'France',
    city: 'Paris',
    bio: 'Photographer & foodie exploring new spots.',
    photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=360&h=360&fit=crop&q=80',
    matchReason: 'Planning trip',
  },
  {
    id: 'fb-4',
    userId: 'seed-maya',
    displayName: 'Maya',
    age: 22,
    gender: 'female',
    country: 'United Kingdom',
    city: 'London',
    bio: 'Here for a short trip, looking for good vibes & cafe recommendations.',
    photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=360&h=360&fit=crop&q=80',
    matchReason: 'Active today',
  },
  {
    id: 'fb-5',
    userId: 'seed-alina',
    displayName: 'Alina',
    age: 24,
    gender: 'female',
    country: 'Italy',
    city: 'Milan',
    bio: 'Love architecture & hidden rooftop cafes!',
    photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=360&h=360&fit=crop&q=80',
    matchReason: 'Arriving soon',
  },
];

function countryFlag(country?: string | null): string {
  if (!country) return '✈️';
  const lower = country.toLowerCase();
  if (lower.includes('czech')) return '🇨🇿';
  if (lower.includes('spain')) return '🇪🇸';
  if (lower.includes('france')) return '🇫🇷';
  if (lower.includes('united kingdom') || lower.includes('uk') || lower.includes('england')) return '🇬🇧';
  if (lower.includes('italy')) return '🇮🇹';
  if (lower.includes('russia')) return '🇷🇺';
  if (lower.includes('germany')) return '🇩🇪';
  if (lower.includes('united states') || lower.includes('usa')) return '🇺🇸';
  if (lower.includes('canada')) return '🇨🇦';
  if (lower.includes('australia')) return '🇦🇺';
  return '✈️';
}

export default function TravelerMarquee({
  profiles,
  onSelectProfile,
  rawCity,
}: Props) {
  const displayList =
    profiles && profiles.length >= 3 ? profiles.slice(0, 10) : FALLBACK_TRAVELLERS;

  // Duplicate to create seamless infinite ticker
  const duplicatedList = [...displayList, ...displayList];

  return (
    <div className="mt-8 sm:mt-10 select-none">
      {/* Header with live pulse */}
      <div className="flex items-center justify-between px-1 mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <Plane className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-surface-300">
            Travellers Visiting {rawCity || 'Soon'}
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Looking for Guides
        </span>
      </div>

      {/* Overflow container */}
      <div className="relative overflow-hidden py-1 mask-fade-edges">
        {/* Soft edge gradients */}
        <div className="absolute left-0 inset-y-0 w-8 bg-gradient-to-r from-surface-950 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-surface-950 to-transparent z-10 pointer-events-none" />

        {/* Animated strip */}
        <div className="animate-marquee-smooth flex items-center gap-8 sm:gap-10">
          {duplicatedList.map((p, idx) => {
            const photoUrl =
              p.photo ||
              p.photos?.[0]?.filePath ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=360&h=360&fit=crop&q=80';
            const flag = countryFlag(p.country);

            return (
              <div
                key={`${p.userId || p.id}-${idx}`}
                onClick={() => onSelectProfile(p)}
                className="group w-36 sm:w-40 shrink-0 p-2 rounded-xl bg-surface-900/95 hover:bg-surface-850 border border-surface-800 hover:border-brand-500/60 shadow-xl hover:shadow-brand-500/15 transition-all duration-300 cursor-pointer backdrop-blur-md flex flex-col"
              >
                {/* Large Portrait Photo */}
                <div className="relative w-full h-28 sm:h-32 rounded-lg overflow-hidden bg-surface-950">
                  <img
                    src={photoUrl}
                    alt={p.displayName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Name, Age & Country Flag */}
                <div className="pt-2 pb-1 px-0.5 flex items-center justify-between">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-xs sm:text-[13px] font-bold text-white tracking-tight truncate">
                      {p.displayName}
                      {p.age ? <span className="font-semibold text-surface-200">, {p.age}</span> : ''}
                    </span>
                    <span className="text-xs shrink-0">{flag}</span>
                  </div>
                </div>

                {/* Bottom Status & Chat Now Pill Button */}
                <div className="pt-1.5 border-t border-surface-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="text-[10px] font-bold">Online</span>
                  </div>

                  <span className="px-2.5 py-0.5 rounded-full bg-white text-surface-950 text-[11px] font-extrabold shadow-md shadow-white/10 group-hover:bg-zinc-100 active:scale-95 transition-all">
                    Chat Now
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
