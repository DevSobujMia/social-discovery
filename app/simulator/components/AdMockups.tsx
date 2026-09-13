'use client';

import React from 'react';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Globe, Music2, Sparkles, MapPin, ShieldCheck, ChevronRight } from 'lucide-react';

export interface AdProps {
  platform: 'instagram' | 'facebook' | 'tiktok';
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

export function AdMockup({
  platform,
  city,
  country,
  targetProfile,
  campaignName,
  onAdClick,
}: AdProps) {
  const profilePhoto =
    targetProfile.photo ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80';

  if (platform === 'instagram') {
    return (
      <div className="w-full max-w-[380px] mx-auto bg-black text-white rounded-3xl overflow-hidden border border-surface-800 shadow-2xl font-sans select-none">
        {/* IG Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-black border-b border-surface-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full p-[2px] bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600">
              <img
                src={profilePhoto}
                alt="Account"
                className="w-full h-full object-cover rounded-full border border-black"
              />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold tracking-tight">heartlink.travel</span>
                <span className="w-1 h-1 rounded-full bg-surface-500" />
                <span className="text-[11px] text-surface-400">Follow</span>
              </div>
              <p className="text-[10px] text-surface-400 font-medium">Sponsored · {city}</p>
            </div>
          </div>
          <MoreHorizontal className="w-4 h-4 text-surface-400" />
        </div>

        {/* IG Media Creative */}
        <div className="relative aspect-[4/5] bg-surface-950 overflow-hidden group cursor-pointer" onClick={onAdClick}>
          <img
            src={profilePhoto}
            alt={targetProfile.displayName}
            className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Floating Hook Badge */}
          <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-lg">
            <MapPin className="w-3.5 h-3.5 text-rose-400" />
            <span>Visiting {city} soon</span>
          </div>

          {/* Bottom Card Overlay */}
          <div className="absolute bottom-3 left-3 right-3 p-3 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-white">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-bold text-white">
                {targetProfile.displayName}
                {targetProfile.age ? `, ${targetProfile.age}` : ''}
              </span>
              <ShieldCheck className="w-4 h-4 text-sky-400" />
            </div>
            <p className="text-[11px] text-surface-200 line-clamp-2 leading-snug">
              &quot;Traveling to {city} next week! Looking for an easygoing travel buddy to check out sights and grab dinner.&quot;
            </p>
          </div>
        </div>

        {/* IG CTA Banner (Direct Tap to Funnel) */}
        <button
          type="button"
          onClick={onAdClick}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-rose-600 via-brand-500 to-accent-teal text-white flex items-center justify-between font-bold text-xs hover:brightness-110 transition cursor-pointer shadow-md"
        >
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Connect & Chat Directly</span>
          </div>
          <div className="flex items-center gap-0.5 text-[11px] font-medium">
            <span>Learn more</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </button>

        {/* IG Actions */}
        <div className="px-3.5 py-2 flex items-center justify-between text-white">
          <div className="flex items-center gap-3.5">
            <Heart className="w-5 h-5 hover:text-rose-500 cursor-pointer" />
            <MessageCircle className="w-5 h-5 hover:text-brand-400 cursor-pointer" />
            <Send className="w-4 h-4 hover:text-sky-400 cursor-pointer" />
          </div>
          <Bookmark className="w-4 h-4 text-surface-300 cursor-pointer" />
        </div>

        {/* IG Caption */}
        <div className="px-3.5 pb-3.5 text-xs text-surface-200 space-y-1">
          <p className="font-semibold text-white text-[11px]">1,482 likes</p>
          <p className="leading-snug">
            <span className="font-bold text-white mr-1.5">heartlink.travel</span>
            Planning a trip to {city}? Don&apos;t travel alone. Connect with verified partners arriving at the same time. No signup needed to chat! ✈️✨
          </p>
          <p className="text-[10px] text-surface-500 uppercase tracking-wider mt-1">
            UTM: {campaignName}
          </p>
        </div>
      </div>
    );
  }

  if (platform === 'facebook') {
    return (
      <div className="w-full max-w-[380px] mx-auto bg-surface-900 text-surface-100 rounded-2xl overflow-hidden border border-surface-750 shadow-2xl font-sans select-none">
        {/* FB Header */}
        <div className="p-3 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=100&auto=format&fit=crop&q=80"
              alt="Page"
              className="w-9 h-9 rounded-full object-cover border border-surface-700"
            />
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1">
                Travel Partners Club
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              </h4>
              <p className="text-[10px] text-surface-400 flex items-center gap-1">
                Sponsored · <Globe className="w-3 h-3 text-surface-400" />
              </p>
            </div>
          </div>
          <MoreHorizontal className="w-4 h-4 text-surface-400" />
        </div>

        {/* FB Post Text */}
        <div className="px-3 pb-2 text-xs text-surface-200 leading-relaxed">
          Visiting <span className="text-white font-semibold">{city}</span> this season? Connect with verified travelers who want to explore together. Zero registration upfront—tap below to chat!
        </div>

        {/* FB Creative Image */}
        <div className="relative aspect-[16/10] bg-surface-950 overflow-hidden cursor-pointer" onClick={onAdClick}>
          <img
            src={profilePhoto}
            alt={targetProfile.displayName}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] font-bold text-white border border-white/15">
            {city}
          </div>
        </div>

        {/* FB Link Preview Card */}
        <div className="p-3 bg-surface-850 flex items-center justify-between gap-3 border-t border-surface-800">
          <div className="min-w-0">
            <p className="text-[10px] text-surface-400 uppercase tracking-wider font-medium">HEARTLINK.COM</p>
            <h5 className="text-xs font-bold text-white truncate">
              Meet {targetProfile.displayName} in {city}
            </h5>
            <p className="text-[10px] text-surface-400 truncate">Verified companion · Live chat</p>
          </div>
          <button
            type="button"
            onClick={onAdClick}
            className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white font-bold text-xs shrink-0 cursor-pointer shadow transition"
          >
            Send Message
          </button>
        </div>

        {/* FB Reactions */}
        <div className="px-3 py-2 border-t border-surface-800/80 flex items-center justify-between text-xs text-surface-400">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-brand-400">👍 ❤️ ✈️</span>
            <span>438</span>
          </div>
          <div className="flex gap-3 text-[11px]">
            <span>89 comments</span>
            <span>34 shares</span>
          </div>
        </div>
      </div>
    );
  }

  // TikTok / Reels Format
  return (
    <div className="w-full max-w-[340px] mx-auto h-[580px] bg-black text-white rounded-3xl overflow-hidden border border-surface-800 shadow-2xl relative select-none flex flex-col justify-between p-4 font-sans">
      {/* Background Video/Image */}
      <img
        src={profilePhoto}
        alt={targetProfile.displayName}
        className="absolute inset-0 w-full h-full object-cover opacity-90"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90" />

      {/* Top Header */}
      <div className="relative z-10 flex items-center justify-between text-xs">
        <span className="font-semibold text-white/80">Reels / TikTok</span>
        <span className="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-bold">
          Sponsored
        </span>
      </div>

      {/* Floating Action Icons (Right Side) */}
      <div className="absolute right-3 bottom-24 z-10 flex flex-col items-center gap-4 text-white">
        <div className="w-10 h-10 rounded-full border-2 border-brand-400 overflow-hidden">
          <img src={profilePhoto} alt="Author" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Heart className="w-6 h-6 fill-rose-500 text-rose-500 drop-shadow" />
          <span className="text-[10px] font-bold">24.5K</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <MessageCircle className="w-6 h-6 text-white drop-shadow" />
          <span className="text-[10px] font-bold">1,820</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Send className="w-5 h-5 text-white drop-shadow" />
          <span className="text-[10px] font-bold">Share</span>
        </div>
      </div>

      {/* Bottom Content & CTA */}
      <div className="relative z-10 space-y-2.5 max-w-[80%]">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-sm text-white drop-shadow">@{targetProfile.displayName.toLowerCase()}_travels</h4>
          <ShieldCheck className="w-4 h-4 text-sky-400" />
        </div>
        <p className="text-xs text-white/90 leading-snug drop-shadow line-clamp-3">
          Visiting {city} soon! Who wants to connect and travel together? Tap below to start chatting now ✈️🏝️
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-white/80">
          <Music2 className="w-3.5 h-3.5 animate-spin" />
          <span className="truncate">Original Sound · Summer in {city}</span>
        </div>

        {/* Glowing Full CTA Button */}
        <button
          type="button"
          onClick={onAdClick}
          className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 via-brand-500 to-accent-teal text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30 hover:scale-[1.02] transition cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>Tap to Match & Chat</span>
        </button>
      </div>
    </div>
  );
}
