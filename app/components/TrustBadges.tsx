'use client';

import { MapPin, ShieldCheck } from 'lucide-react';

export function TrustBadges({
  isVerified,
  visitingCity,
  inViewerCity,
  tone = 'plain',
}: {
  isVerified?: boolean;
  visitingCity?: string | null;
  inViewerCity?: boolean;
  tone?: 'plain' | 'overlay';
}) {
  const cityLabel = visitingCity ? 'Traveler in your city' : null;
  const localLabel = inViewerCity ? 'Your city' : null;

  if (!isVerified && !cityLabel && !localLabel) return null;

  const chip =
    tone === 'overlay'
      ? 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/20'
      : 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-surface-800/90 text-[10px] font-semibold text-surface-200 border border-surface-700/70';

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-0">
      {isVerified ? (
        <span className={`${chip} ${tone === 'plain' ? 'text-sky-300 border-sky-500/30 bg-sky-500/10' : ''}`}>
          <ShieldCheck className="w-3 h-3 shrink-0" />
          <span>Verified</span>
        </span>
      ) : null}
      {cityLabel ? (
        <span className={`${chip} ${tone === 'plain' ? 'text-accent-teal border-accent-teal/30 bg-accent-teal/10' : ''}`}>
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[140px]">{cityLabel}</span>
        </span>
      ) : null}
      {localLabel ? (
        <span className={`${chip} ${tone === 'plain' ? 'text-brand-300 border-brand-500/30 bg-brand-500/10' : ''}`}>
          {localLabel}
        </span>
      ) : null}
    </div>
  );
}
