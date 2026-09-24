'use client';

import React, { useState } from 'react';
import {
  ChevronLeft,
  X,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  MessageCircle,
  Phone,
  Mail,
  Send,
  Copy,
  Check,
  Plane,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import { TravelRibbon, MatchReason, TravelNote, TravelInfoLike } from '@/app/components/TravelBadge';

export interface ProfileViewModalData {
  userId?: string;
  id?: string;
  displayName: string;
  age?: number | string | null;
  bio?: string | null;
  city?: string | null;
  country?: string | null;
  isVerified?: boolean;
  photo?: string | null;
  photos?: Array<{ id?: string; filePath?: string; url?: string } | string>;
  contact?: string | null;
  travel?: TravelInfoLike | {
    city?: string | null;
    country?: string | null;
    dates?: string | null;
    timing?: string | null;
    note?: string | null;
    photoUrl?: string | null;
  } | null;
  travelPlans?: Array<{
    id?: string;
    country?: string;
    city?: string;
    fromDate?: string;
    toDate?: string;
    note?: string;
    photoUrl?: string;
    timing?: string;
  }>;
  matchReason?: string | null;
  interests?: string[];
  // Admin-specific lead & attribution details
  adminDetails?: {
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    telegram?: string | null;
    assignedAgent?: string | null;
    leadStage?: string | null;
    geoCity?: string | null;
    geoCountry?: string | null;
    attribution?: {
      platform?: string | null;
      campaign?: string | null;
      content?: string | null;
      ad?: string | null;
      city?: string | null;
    } | null;
    source?: {
      utm_source?: string | null;
      utm_campaign?: string | null;
      utm_content?: string | null;
    } | null;
    isStaffAssisted?: boolean;
  };
}

export interface ProfileViewModalProps {
  profile: ProfileViewModalData | null;
  onClose: () => void;
  onChat?: () => void;
  chatButtonText?: string;
  onBlock?: () => void;
  blockButtonText?: string;
  showBlockButton?: boolean;
}

export default function ProfileViewModal({
  profile,
  onClose,
  onChat,
  chatButtonText = 'Say hi',
  onBlock,
  blockButtonText,
  showBlockButton = false,
}: ProfileViewModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!profile) return null;

  const copyToClipboard = (text: string, field: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const cleanDigits = (val: string) => val.replace(/\D/g, '');

  const mainPhoto =
    profile.photo ||
    (Array.isArray(profile.photos) && profile.photos.length > 0
      ? typeof profile.photos[0] === 'string'
        ? profile.photos[0]
        : profile.photos[0]?.filePath || profile.photos[0]?.url
      : null);

  const initialLetter = (profile.displayName || 'U').charAt(0).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface-900 border border-surface-700/80 rounded-t-3xl sm:rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] relative animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================= HEADER BANNER ================= */}
        {mainPhoto ? (
          <div className="relative h-72 sm:h-80 w-full bg-surface-950 shrink-0">
            <img
              src={mainPhoto}
              alt={profile.displayName}
              className="w-full h-full object-cover"
            />
            {/* Top action buttons */}
            <button
              onClick={onClose}
              className="absolute top-3.5 left-3.5 z-20 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/85 text-white text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 transition shadow-lg border border-white/10 cursor-pointer min-h-[36px]"
              aria-label="Back"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              onClick={onClose}
              className="absolute top-3.5 right-3.5 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-md transition shadow-lg border border-white/10 cursor-pointer min-w-[36px] min-h-[36px]"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-transparent to-transparent pointer-events-none" />

            <div className="absolute bottom-3 left-4 right-4 space-y-1.5 pointer-events-none">
              {profile.travel && (
                <div className="pointer-events-auto inline-block">
                  <TravelRibbon travel={profile.travel as any} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-extrabold text-white drop-shadow-md">
                  {profile.displayName}{' '}
                  {profile.age && <span className="font-normal text-surface-200">{profile.age}</span>}
                </h3>
                {profile.isVerified && (
                  <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                )}
              </div>
              {profile.contact && (
                <div className="flex items-center gap-1.5 text-xs text-sky-300 mt-1 pointer-events-auto">
                  <span className="px-2.5 py-0.5 rounded-full bg-black/60 border border-sky-400/40 font-mono text-[11px] backdrop-blur-sm">
                    {profile.contact}
                  </span>
                </div>
              )}
              <p className="text-xs text-surface-300 flex items-center gap-1 mt-0.5 drop-shadow">
                <Plane className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                <span>Traveler in your city</span>
              </p>
            </div>
          </div>
        ) : (
          /* Header when NO photo is available (e.g. Lead/Guest without picture) */
          <div className="relative p-6 bg-gradient-to-br from-surface-800 via-surface-900 to-surface-950 border-b border-surface-800 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-3.5 left-3.5 z-20 px-3 py-1.5 rounded-full bg-surface-800/80 hover:bg-surface-700 text-white text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 transition shadow-lg border border-surface-700 cursor-pointer min-h-[36px]"
              aria-label="Back"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              onClick={onClose}
              className="absolute top-3.5 right-3.5 z-20 w-9 h-9 rounded-full bg-surface-800/80 hover:bg-surface-700 text-white flex items-center justify-center backdrop-blur-md transition shadow-lg border border-surface-700 cursor-pointer min-w-[36px] min-h-[36px]"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mt-8 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full ring-4 ring-emerald-500/40 bg-gradient-to-tr from-emerald-800 to-emerald-600 text-white font-extrabold flex items-center justify-center text-3xl shadow-xl">
                {initialLetter}
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <h3 className="text-xl font-extrabold text-white">
                  {profile.displayName}
                </h3>
                {profile.isVerified && (
                  <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0" />
                )}
              </div>
              {profile.userId && (
                <p className="text-[11px] text-surface-400 font-mono mt-0.5">
                  ID: #{profile.userId.slice(-6)}
                </p>
              )}
              <p className="text-xs text-surface-300 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                <span>
                  {[profile.city, profile.country].filter(Boolean).join(', ') || 'Abroad / Global'}
                </span>
              </p>
            </div>
          </div>
        )}

        {/* ================= MODAL DETAILS BODY ================= */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Match Reason */}
          {profile.matchReason && <MatchReason reason={profile.matchReason} />}

          {/* Travel Note */}
          {profile.travel && 'note' in profile.travel && profile.travel.note && (
            <TravelNote note={profile.travel.note} />
          )}

          {/* About / Bio */}
          {profile.bio ? (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-400 mb-1">
                About
              </h4>
              <p className="text-surface-300 leading-relaxed text-xs sm:text-sm whitespace-pre-wrap">
                {profile.bio}
              </p>
            </div>
          ) : !profile.adminDetails ? (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-400 mb-1">
                About
              </h4>
              <p className="text-surface-400 italic text-xs">
                No written bio provided yet.
              </p>
            </div>
          ) : null}

          {/* Upcoming Trips / Travel Plans */}
          {Array.isArray(profile.travelPlans) && profile.travelPlans.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-brand-400" />
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-400">
                  Upcoming Travel & Trips
                </h4>
              </div>
              <div className="space-y-2">
                {profile.travelPlans.map((tp, idx) => (
                  <div
                    key={tp.id || idx}
                    className="p-3 rounded-xl bg-surface-950/70 border border-surface-800 flex gap-3 items-start"
                  >
                    {tp.photoUrl && (
                      <img
                        src={tp.photoUrl}
                        alt={tp.city || 'Trip'}
                        className="w-12 h-12 rounded-lg object-cover ring-1 ring-surface-700 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-bold text-white text-xs">
                          {tp.city}
                          {tp.country ? `, ${tp.country}` : ''}
                        </p>
                        {tp.timing && (
                          <span className="text-[10px] text-brand-300 bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-500/20 shrink-0">
                            {tp.timing}
                          </span>
                        )}
                      </div>
                      {(tp.fromDate || tp.toDate) && (
                        <p className="text-[10px] text-surface-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-surface-500" />
                          <span>
                            {tp.fromDate ? new Date(tp.fromDate).toLocaleDateString() : ''}
                            {tp.toDate ? ` – ${new Date(tp.toDate).toLocaleDateString()}` : ''}
                          </span>
                        </p>
                      )}
                      {tp.note && (
                        <p className="text-surface-300 text-[11px] mt-1 italic leading-relaxed">
                          &ldquo;{tp.note}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interests */}
          {Array.isArray(profile.interests) && profile.interests.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-400 mb-1.5">
                Interests
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {profile.interests.map((interest) => (
                  <span
                    key={interest}
                    className="bg-surface-800 text-surface-200 px-2.5 py-1 rounded-lg border border-surface-700"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Photo Gallery (when multiple photos exist) */}
          {Array.isArray(profile.photos) && profile.photos.length > 1 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-400 mb-1.5">
                Photos
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {profile.photos.map((p, idx) => {
                  const src = typeof p === 'string' ? p : p.filePath || p.url;
                  if (!src) return null;
                  return (
                    <div
                      key={typeof p === 'object' && p.id ? p.id : idx}
                      className="aspect-square rounded-xl overflow-hidden bg-surface-800 border border-surface-700/60"
                    >
                      <img
                        src={src}
                        alt={`${profile.displayName} photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= ADMIN LEAD & ATTRIBUTION DETAILS ================= */}
          {profile.adminDetails && (
            <div className="pt-3 border-t border-surface-800 space-y-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span>Lead & Contact Channels</span>
              </h4>

              {/* Contact Channels */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profile.adminDetails.phone && (
                  <div className="p-2.5 rounded-xl bg-surface-800/60 border border-surface-700/60 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="truncate">
                        <p className="text-[10px] text-surface-400">Phone</p>
                        <a
                          href={`tel:${profile.adminDetails.phone}`}
                          className="font-mono text-emerald-300 hover:underline"
                        >
                          {profile.adminDetails.phone}
                        </a>
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(profile.adminDetails!.phone!, 'phone')}
                      className="p-1 text-surface-400 hover:text-white rounded hover:bg-surface-700 transition"
                      title="Copy phone"
                    >
                      {copiedField === 'phone' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {profile.adminDetails.whatsapp && (
                  <div className="p-2.5 rounded-xl bg-surface-800/60 border border-surface-700/60 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Send className="w-4 h-4 text-green-400 shrink-0" />
                      <div className="truncate">
                        <p className="text-[10px] text-surface-400">WhatsApp</p>
                        <a
                          href={`https://wa.me/${cleanDigits(profile.adminDetails.whatsapp)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-green-300 hover:underline flex items-center gap-1"
                        >
                          <span>{profile.adminDetails.whatsapp}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(profile.adminDetails!.whatsapp!, 'whatsapp')}
                      className="p-1 text-surface-400 hover:text-white rounded hover:bg-surface-700 transition"
                      title="Copy WhatsApp"
                    >
                      {copiedField === 'whatsapp' ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {profile.adminDetails.email && (
                  <div className="p-2.5 rounded-xl bg-surface-800/60 border border-surface-700/60 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-4 h-4 text-sky-400 shrink-0" />
                      <div className="truncate">
                        <p className="text-[10px] text-surface-400">Email</p>
                        <a
                          href={`mailto:${profile.adminDetails.email}`}
                          className="font-mono text-sky-300 hover:underline truncate block"
                        >
                          {profile.adminDetails.email}
                        </a>
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(profile.adminDetails!.email!, 'email')}
                      className="p-1 text-surface-400 hover:text-white rounded hover:bg-surface-700 transition"
                      title="Copy email"
                    >
                      {copiedField === 'email' ? (
                        <Check className="w-3.5 h-3.5 text-sky-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {profile.adminDetails.telegram && (
                  <div className="p-2.5 rounded-xl bg-surface-800/60 border border-surface-700/60 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Send className="w-4 h-4 text-sky-300 shrink-0" />
                      <div className="truncate">
                        <p className="text-[10px] text-surface-400">Telegram</p>
                        <a
                          href={`https://t.me/${profile.adminDetails.telegram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sky-300 hover:underline flex items-center gap-1"
                        >
                          <span>@{profile.adminDetails.telegram.replace('@', '')}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Attribution Meta Box */}
              <div className="p-3 rounded-xl bg-surface-950/80 border border-surface-800/80 space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center text-surface-400">
                  <span>Ad / Campaign:</span>
                  <span className="font-semibold text-white truncate max-w-[200px]">
                    {profile.adminDetails.attribution?.campaign ||
                      profile.adminDetails.source?.utm_campaign ||
                      profile.adminDetails.attribution?.ad ||
                      'Organic / Direct'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-surface-400">
                  <span>Platform / Source:</span>
                  <span className="font-semibold text-brand-300 uppercase">
                    {profile.adminDetails.attribution?.platform ||
                      profile.adminDetails.source?.utm_source ||
                      'Web'}
                  </span>
                </div>
                {profile.adminDetails.source?.utm_content && (
                  <div className="flex justify-between items-center text-surface-400">
                    <span>UTM Content:</span>
                    <span className="font-mono text-surface-300">
                      {profile.adminDetails.source.utm_content}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-surface-400">
                  <span>Assigned Agent:</span>
                  <span className="font-medium text-emerald-300">
                    {profile.adminDetails.assignedAgent || 'Unassigned (Pool)'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ================= MODAL FOOTER ACTIONS ================= */}
          <div className="pt-3 border-t border-surface-800 flex gap-3">
            <button
              onClick={onClose}
              className="btn-secondary flex-1 py-2.5 text-xs text-center min-h-[44px] cursor-pointer"
            >
              Close
            </button>
            {onChat && (
              <button
                onClick={onChat}
                className="btn-primary flex-1 py-2.5 text-xs text-center flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{chatButtonText}</span>
              </button>
            )}
          </div>

          {/* Block Action */}
          {showBlockButton && onBlock && (
            <div className="pt-2 flex justify-center border-t border-surface-800/60 mt-3">
              <button
                onClick={onBlock}
                className="text-[11px] text-surface-400 hover:text-red-400 flex items-center gap-1.5 transition py-1 px-3 rounded-lg hover:bg-red-500/10 cursor-pointer"
                title={`Block ${profile.displayName}`}
                aria-label={`Block ${profile.displayName}`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>{blockButtonText || `Block ${profile.displayName}`}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
