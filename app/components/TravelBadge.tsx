'use client';

import { MapPin, Plane } from 'lucide-react';

export interface TravelInfoLike {
  city: string;
  country: string;
  fromDate: string;
  toDate: string;
  note: string | null;
  status: 'here-now' | 'arriving' | 'upcoming';
  daysUntil: number;
  daysLeft: number | null;
  isViewerCity: boolean;
}

/**
 * Soft travel signal — no fixed-date urgency. Product copy is always
 * “Traveling soon”, while backend dates still drive ranking.
 */
export function TravelUrgencyBadge({ travel }: { travel?: TravelInfoLike }) {
  return (
    <span className="badge border text-[10px] font-bold px-2 py-0.5 backdrop-blur-md inline-flex items-center gap-1 bg-surface-900/85 text-surface-100 border-surface-600/70">
      <Plane className="w-3 h-3 shrink-0 text-brand-300" />
      <span>Traveler in your city</span>
    </span>
  );
}

/** Destination ribbon without hard calendar dates. */
export function TravelRibbon({ travel }: { travel?: TravelInfoLike }) {
  const highlight = travel?.isViewerCity;

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold backdrop-blur-md ${
        highlight
          ? 'bg-brand-500/25 border-brand-400/60 text-white'
          : 'bg-surface-900/70 border-surface-700/60 text-surface-200'
      }`}
    >
      <Plane
        className={`w-3.5 h-3.5 shrink-0 ${highlight ? 'text-brand-300' : 'text-surface-400'}`}
      />
      <span className="truncate">Traveler visiting your city</span>
    </div>
  );
}

export function MatchReason({ reason }: { reason: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/25">
      <MapPin className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
      <p className="text-xs text-brand-100 font-medium leading-relaxed">{reason}</p>
    </div>
  );
}

export function TravelNote({ note }: { note: string }) {
  return (
    <p className="text-xs text-surface-300 italic leading-relaxed">“{note}”</p>
  );
}
