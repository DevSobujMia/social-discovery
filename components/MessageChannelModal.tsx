'use client';

import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Plane,
  Sparkles,
} from 'lucide-react';
import {
  buildWhatsAppLink,
  buildTelegramLink,
  trackChannelClick,
} from '@/lib/contact-channels';
import HeartMark from '@/app/components/HeartMark';

export interface ChannelProfileTarget {
  id?: string;
  userId?: string;
  displayName: string;
  age?: number | string | null;
  photo?: string | null;
  photos?: Array<{ filePath?: string; url?: string } | string>;
  city?: string | null;
  country?: string | null;
  isVerified?: boolean;
  travel?: {
    city?: string | null;
    country?: string | null;
  } | null;
  whatsapp?: string | null;
  telegram?: string | null;
}

export interface MessageChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ChannelProfileTarget | null;
  onDirectChat: (profile: ChannelProfileTarget) => void;
  customGreeting?: string;
}

/** Crisp WhatsApp Official Brand SVG */
function WhatsAppBrandIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/** Crisp Telegram Official Brand SVG */
function TelegramBrandIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.198 1.006.126.832.946z" />
    </svg>
  );
}

export default function MessageChannelModal({
  isOpen,
  onClose,
  profile,
  onDirectChat,
  customGreeting,
}: MessageChannelModalProps) {
  const [openingChannel, setOpeningChannel] = useState<string | null>(null);

  if (!isOpen || !profile) return null;

  const firstName = (profile.displayName || 'Traveler').split(' ')[0];
  const photo =
    profile.photo ||
    (Array.isArray(profile.photos) && profile.photos.length > 0
      ? typeof profile.photos[0] === 'string'
        ? profile.photos[0]
        : profile.photos[0]?.filePath || profile.photos[0]?.url
      : null) ||
    '/api/uploads/profiles/w_blonde_street_eb7cd076-c2de-4c55-ba5f-1c4c23de8b14.jpg';

  const handleCityHostDirectClick = () => {
    setOpeningChannel('direct');
    trackChannelClick('direct', {
      profileName: profile.displayName,
      profileId: profile.userId || profile.id,
    });

    onDirectChat(profile);
    onClose();
  };

  const handleWhatsAppClick = () => {
    setOpeningChannel('whatsapp');
    trackChannelClick('whatsapp', {
      profileName: profile.displayName,
      profileId: profile.userId || profile.id,
    });

    const link = buildWhatsAppLink({
      phone: profile.whatsapp,
      profileName: profile.displayName,
      customMessage: customGreeting,
    });

    window.open(link, '_blank', 'noopener,noreferrer');

    setTimeout(() => {
      setOpeningChannel(null);
      onClose();
    }, 400);
  };

  const handleTelegramClick = () => {
    setOpeningChannel('telegram');
    trackChannelClick('telegram', {
      profileName: profile.displayName,
      profileId: profile.userId || profile.id,
    });

    const link = buildTelegramLink({
      username: profile.telegram,
      profileName: profile.displayName,
      customMessage: customGreeting,
    });

    window.open(link, '_blank', 'noopener,noreferrer');

    setTimeout(() => {
      setOpeningChannel(null);
      onClose();
    }, 400);
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface-900/95 border border-surface-700/80 rounded-t-3xl sm:rounded-3xl w-full max-w-sm sm:max-w-md overflow-hidden shadow-2xl flex flex-col relative animate-slideUp backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Top Gradient Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-emerald-400 to-sky-400" />

        {/* Header: Profile Preview with Universal Traveller Tag */}
        <div className="p-4 sm:p-5 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <img
                src={photo}
                alt={profile.displayName}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-brand-500/40 shadow-md"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-surface-900 rounded-full shadow-sm animate-pulse" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="text-base font-extrabold text-white truncate">
                  {profile.displayName}
                  {profile.age ? `, ${profile.age}` : ''}
                </h3>
                {profile.isVerified && (
                  <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]" />
                )}
              </div>
              <p className="text-xs text-surface-400 mt-0.5 flex items-center gap-1 truncate font-medium">
                <Plane className="w-3 h-3 text-brand-400 shrink-0" />
                <span>Traveler in your city</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Instruction Label */}
        <div className="px-4 sm:px-5 pt-1 pb-3 text-center sm:text-left">
          <p className="text-[12px] font-medium text-surface-300">
            Message <strong className="text-white">{firstName}</strong> via:
          </p>
        </div>

        {/* 3 App Chooser Columns / Cards */}
        <div className="px-4 sm:px-5 pb-5">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
            {/* APP 1: CITY HOST (IN-APP) */}
            <button
              type="button"
              onClick={handleCityHostDirectClick}
              disabled={openingChannel !== null}
              className="group flex flex-col items-center justify-center p-3 rounded-2xl bg-surface-850/90 hover:bg-surface-800 border border-surface-700/70 hover:border-pink-500/60 active:scale-95 transition-all duration-200 cursor-pointer text-center shadow-lg hover:shadow-pink-500/10"
            >
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shadow-md shadow-pink-500/25 ring-1 ring-white/20 group-hover:scale-105 group-hover:shadow-pink-500/40 transition-transform mb-2 bg-[#020617] flex items-center justify-center">
                <img
                  src="/icon.svg"
                  alt="City Host"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-xs font-bold text-white group-hover:text-pink-300 transition-colors tracking-tight">
                City Host
              </span>
              <span className="text-[10px] text-pink-400 font-medium mt-0.5">
                In-App
              </span>
            </button>

            {/* APP 2: WHATSAPP */}
            <button
              type="button"
              onClick={handleWhatsAppClick}
              disabled={openingChannel !== null}
              className="group flex flex-col items-center justify-center p-3 rounded-2xl bg-surface-850/90 hover:bg-surface-800 border border-surface-700/70 hover:border-emerald-500/60 active:scale-95 transition-all duration-200 cursor-pointer text-center shadow-lg hover:shadow-emerald-500/10"
            >
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shadow-md shadow-emerald-500/25 ring-1 ring-white/20 group-hover:scale-105 group-hover:shadow-emerald-500/40 transition-transform mb-2 bg-[#25D366] flex items-center justify-center text-white">
                <WhatsAppBrandIcon className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors tracking-tight">
                WhatsApp
              </span>
              <span className="text-[10px] text-emerald-400 font-medium mt-0.5">
                Direct
              </span>
            </button>

            {/* APP 3: TELEGRAM */}
            <button
              type="button"
              onClick={handleTelegramClick}
              disabled={openingChannel !== null}
              className="group flex flex-col items-center justify-center p-3 rounded-2xl bg-surface-850/90 hover:bg-surface-800 border border-surface-700/70 hover:border-sky-500/60 active:scale-95 transition-all duration-200 cursor-pointer text-center shadow-lg hover:shadow-sky-500/10"
            >
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shadow-md shadow-sky-500/25 ring-1 ring-white/20 group-hover:scale-105 group-hover:shadow-sky-500/40 transition-transform mb-2 bg-[#24A1DE] flex items-center justify-center text-white">
                <TelegramBrandIcon className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors tracking-tight">
                Telegram
              </span>
              <span className="text-[10px] text-sky-400 font-medium mt-0.5">
                Direct
              </span>
            </button>
          </div>
        </div>

        {/* Minimal Footer Vibe */}
        <div className="py-2.5 px-4 bg-surface-950/70 border-t border-surface-800 text-center">
          <p className="text-[10.5px] text-surface-400 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-brand-400" />
            <span>Select an app to message instantly</span>
          </p>
        </div>
      </div>
    </div>
  );
}
