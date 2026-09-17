'use client';

import React from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  Globe,
  Music2,
  MapPin,
  ChevronRight,
  Volume2,
} from 'lucide-react';

export type AdPlatform = 'instagram' | 'facebook' | 'tiktok';
export type AdFormat = 'feed' | 'stories' | 'reels';
export type AdHook = 'in_town' | 'say_hi' | 'dinner';

export interface AdProps {
  platform: AdPlatform;
  format: AdFormat;
  hook: AdHook;
  city: string;
  country: string;
  targetProfile: {
    displayName: string;
    age?: number | null;
    photo?: string | null;
    bio?: string | null;
    userId: string;
  };
  campaignName: string;
  onAdClick: () => void;
}

const FALLBACK_PHOTO =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80';

function hookCopy(hook: AdHook, city: string, name: string, age?: number | null) {
  const who = age ? `${name}, ${age}` : name;
  switch (hook) {
    case 'in_town':
      return {
        badge: `In ${city} this week`,
        line: `${who} is visiting ${city} — looking for someone local to explore with.`,
        caption: `${who} just landed in ${city}. Say hi before her trip fills up.`,
        cta: 'Say hi on City Host',
        fbHeadline: `She's in ${city} this week`,
      };
    case 'dinner':
      return {
        badge: `Dinner in ${city}`,
        line: `${who} wants a local to grab dinner and show her around ${city}.`,
        caption: `Don't let her eat alone in ${city}. One tap to chat.`,
        cta: 'Chat now',
        fbHeadline: `Dinner partner in ${city}`,
      };
    default:
      return {
        badge: `Visiting ${city}`,
        line: `${who} is planning ${city} and wants someone easygoing to meet.`,
        caption: `Planning ${city}? Say hi to ${name} — chat on-site, no app store.`,
        cta: 'Open chat',
        fbHeadline: `Meet ${name} in ${city}`,
      };
  }
}

export function AdMockup({
  platform,
  format,
  hook,
  city,
  country,
  targetProfile,
  campaignName,
  onAdClick,
}: AdProps) {
  const photo = targetProfile.photo || FALLBACK_PHOTO;
  const copy = hookCopy(hook, city, targetProfile.displayName, targetProfile.age);

  if (platform === 'instagram' && format === 'stories') {
    return <IgStories photo={photo} copy={copy} city={city} country={country} targetProfile={targetProfile} onAdClick={onAdClick} />;
  }

  if (platform === 'tiktok' || format === 'reels') {
    return (
      <ReelsAd
        photo={photo}
        copy={copy}
        city={city}
        targetProfile={targetProfile}
        campaignName={campaignName}
        onAdClick={onAdClick}
        label={platform === 'tiktok' ? 'TikTok' : 'Instagram Reels'}
      />
    );
  }

  if (platform === 'facebook') {
    return (
      <FacebookFeed
        photo={photo}
        copy={copy}
        city={city}
        country={country}
        targetProfile={targetProfile}
        onAdClick={onAdClick}
      />
    );
  }

  return (
    <InstagramFeed
      photo={photo}
      copy={copy}
      city={city}
      targetProfile={targetProfile}
      campaignName={campaignName}
      onAdClick={onAdClick}
    />
  );
}

function InstagramFeed({
  photo,
  copy,
  city,
  targetProfile,
  campaignName,
  onAdClick,
}: {
  photo: string;
  copy: ReturnType<typeof hookCopy>;
  city: string;
  targetProfile: AdProps['targetProfile'];
  campaignName: string;
  onAdClick: () => void;
}) {
  return (
    <div className="w-full max-w-[380px] mx-auto bg-black text-white rounded-3xl overflow-hidden border border-surface-800 shadow-2xl font-sans select-none">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-surface-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full p-[2px] bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600">
            <img src={photo} alt="" className="w-full h-full object-cover rounded-full border border-black" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold tracking-tight">city host</span>
              <span className="text-[10px] text-sky-400 font-semibold">Sponsored</span>
            </div>
            <p className="text-[10px] text-surface-400">{city}</p>
          </div>
        </div>
        <MoreHorizontal className="w-4 h-4 text-surface-400" />
      </div>

      <button type="button" onClick={onAdClick} className="relative aspect-[4/5] w-full bg-surface-950 overflow-hidden text-left">
        <img src={photo} alt={targetProfile.displayName} className="w-full h-full object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[11px] font-semibold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {copy.badge}
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-lg font-extrabold leading-tight">
            {targetProfile.displayName}
            {targetProfile.age ? `, ${targetProfile.age}` : ''}
          </p>
          <p className="text-[12px] text-white/85 mt-1 leading-snug">{copy.line}</p>
        </div>
      </button>

      <button
        type="button"
        onClick={onAdClick}
        className="w-full py-2.5 px-4 bg-white text-black flex items-center justify-between font-bold text-xs"
      >
        <span>{copy.cta}</span>
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="px-3.5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <Heart className="w-5 h-5" />
          <MessageCircle className="w-5 h-5" />
          <Send className="w-4 h-4" />
        </div>
        <Bookmark className="w-4 h-4 text-surface-300" />
      </div>

      <div className="px-3.5 pb-3.5 text-xs text-surface-200 space-y-1">
        <p className="font-semibold text-white text-[11px]">2,184 likes</p>
        <p className="leading-snug">
          <span className="font-bold text-white mr-1.5">city host</span>
          {copy.caption}
        </p>
        <p className="text-[10px] text-surface-500 uppercase tracking-wider mt-1">utm · {campaignName}</p>
      </div>
    </div>
  );
}

function IgStories({
  photo,
  copy,
  city,
  country,
  targetProfile,
  onAdClick,
}: {
  photo: string;
  copy: ReturnType<typeof hookCopy>;
  city: string;
  country: string;
  targetProfile: AdProps['targetProfile'];
  onAdClick: () => void;
}) {
  return (
    <div className="w-full max-w-[340px] mx-auto h-[580px] bg-black rounded-3xl overflow-hidden border border-surface-800 relative select-none">
      <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />

      <div className="relative z-10 px-3 pt-3 flex gap-1">
        <div className="h-0.5 flex-1 rounded-full bg-white" />
        <div className="h-0.5 flex-1 rounded-full bg-white/30" />
        <div className="h-0.5 flex-1 rounded-full bg-white/30" />
      </div>

      <div className="relative z-10 px-3 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={photo} alt="" className="w-7 h-7 rounded-full object-cover ring-1 ring-white/70" />
          <div>
            <p className="text-[11px] font-bold text-white leading-none">{targetProfile.displayName}</p>
            <p className="text-[9px] text-white/70 mt-0.5">Sponsored · {city}</p>
          </div>
        </div>
        <MoreHorizontal className="w-4 h-4 text-white" />
      </div>

      <div className="absolute top-[38%] left-3 right-3 z-10">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur text-[11px] font-semibold text-white mb-2">
          <MapPin className="w-3 h-3 text-rose-300" />
          {city}, {country}
        </div>
        <p className="text-[22px] font-extrabold text-white leading-tight drop-shadow-md">
          {copy.badge}
        </p>
        <p className="text-sm text-white/90 mt-1.5 max-w-[90%] leading-snug">{copy.line}</p>
      </div>

      <div className="absolute bottom-4 left-3 right-3 z-10 space-y-2">
        <button
          type="button"
          onClick={onAdClick}
          className="w-full py-3 rounded-full bg-white text-black text-sm font-extrabold"
        >
          {copy.cta}
        </button>
        <p className="text-center text-[10px] text-white/60">Swipe up · no app install</p>
      </div>
    </div>
  );
}

function FacebookFeed({
  photo,
  copy,
  city,
  country,
  targetProfile,
  onAdClick,
}: {
  photo: string;
  copy: ReturnType<typeof hookCopy>;
  city: string;
  country: string;
  targetProfile: AdProps['targetProfile'];
  onAdClick: () => void;
}) {
  return (
    <div className="w-full max-w-[380px] mx-auto bg-[#242526] text-white rounded-2xl overflow-hidden border border-surface-700 shadow-2xl font-sans select-none">
      <div className="p-3 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-surface-800">
            <img src={photo} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">{targetProfile.displayName}</h4>
            <p className="text-[10px] text-surface-400 flex items-center gap-1">
              Sponsored · {city} <Globe className="w-3 h-3" />
            </p>
          </div>
        </div>
        <MoreHorizontal className="w-4 h-4 text-surface-400" />
      </div>

      <p className="px-3 pb-2 text-[13px] leading-relaxed text-surface-100">{copy.caption}</p>

      <button type="button" onClick={onAdClick} className="relative w-full aspect-[4/5] overflow-hidden text-left">
        <img src={photo} alt={targetProfile.displayName} className="w-full h-full object-cover object-top" />
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-[11px] uppercase tracking-wide text-white/70">{country}</p>
          <p className="text-base font-extrabold">{copy.fbHeadline}</p>
        </div>
      </button>

      <div className="p-3 bg-[#3a3b3c] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-surface-400 uppercase tracking-wider">city host</p>
          <p className="text-xs font-bold truncate">{copy.cta}</p>
        </div>
        <button
          type="button"
          onClick={onAdClick}
          className="px-3 py-1.5 rounded-md bg-[#e4e6eb] text-black font-bold text-xs shrink-0"
        >
          Learn more
        </button>
      </div>
    </div>
  );
}

function ReelsAd({
  photo,
  copy,
  city,
  targetProfile,
  campaignName,
  onAdClick,
  label,
}: {
  photo: string;
  copy: ReturnType<typeof hookCopy>;
  city: string;
  targetProfile: AdProps['targetProfile'];
  campaignName: string;
  onAdClick: () => void;
  label: string;
}) {
  return (
    <div className="w-full max-w-[340px] mx-auto h-[580px] bg-black rounded-3xl overflow-hidden border border-surface-800 relative select-none">
      <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/90" />

      <div className="relative z-10 px-3 pt-3 flex items-center justify-between text-[11px] font-semibold">
        <span className="text-white/80">{label}</span>
        <span className="px-2 py-0.5 rounded-full bg-white/15">Sponsored</span>
      </div>

      <div className="absolute right-3 bottom-28 z-10 flex flex-col items-center gap-4 text-white">
        <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white">
          <img src={photo} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col items-center">
          <Heart className="w-7 h-7 fill-rose-500 text-rose-500" />
          <span className="text-[10px] font-bold">18.2K</span>
        </div>
        <div className="flex flex-col items-center">
          <MessageCircle className="w-7 h-7" />
          <span className="text-[10px] font-bold">940</span>
        </div>
        <Send className="w-6 h-6" />
        <Volume2 className="w-5 h-5 opacity-70" />
      </div>

      <div className="absolute bottom-4 left-3 right-16 z-10 space-y-2">
        <p className="text-sm font-extrabold">@{targetProfile.displayName.toLowerCase()}</p>
        <p className="text-[13px] text-white/90 leading-snug">{copy.caption}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-white/70">
          <Music2 className="w-3.5 h-3.5" />
          <span>Original audio · {city}</span>
        </div>
        <button
          type="button"
          onClick={onAdClick}
          className="w-full py-2.5 rounded-xl bg-white text-black text-xs font-extrabold"
        >
          {copy.cta}
        </button>
        <p className="text-[9px] text-white/40">{campaignName}</p>
      </div>
    </div>
  );
}
