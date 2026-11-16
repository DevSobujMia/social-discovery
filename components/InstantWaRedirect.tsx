'use client';

import React, { useEffect, useState } from 'react';
import { MessageCircle, ShieldCheck, ExternalLink } from 'lucide-react';

interface InstantWaRedirectProps {
  redirectUrl: string;
}

/**
 * Performs an immediate WhatsApp redirect while rendering a clean 1-tap fallback
 * button in case Facebook/Instagram In-App Browser blocks automatic app handoff.
 */
export default function InstantWaRedirect({ redirectUrl }: InstantWaRedirectProps) {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    try {
      window.location.replace(redirectUrl);
    } catch {
      window.location.href = redirectUrl;
    }
    const timer = setTimeout(() => setShowButton(true), 450);
    return () => clearTimeout(timer);
  }, [redirectUrl]);

  return (
    <div
      className="min-h-screen bg-[#020617] text-white flex items-center justify-center p-5"
      data-testid="instant-wa-redirect"
    >
      <div className="w-full max-w-sm rounded-3xl bg-slate-900/90 border border-slate-800 p-6 text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <MessageCircle className="w-7 h-7 text-emerald-400" />
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-semibold text-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5" />
            Verified CityHost Concierge
          </div>
          <h1 className="text-lg font-bold text-white">
            {showButton ? 'Tap below to open WhatsApp' : 'Connecting to WhatsApp...'}
          </h1>
          <p className="text-xs text-slate-400">
            {showButton
              ? 'Your private chat pass is ready. Tap the button to continue in WhatsApp.'
              : 'Redirecting you securely to our concierge desk.'}
          </p>
        </div>

        <a
          href={redirectUrl}
          rel="noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/25"
        >
          <MessageCircle className="w-4 h-4" />
          Open WhatsApp Chat
          <ExternalLink className="w-3.5 h-3.5 opacity-80" />
        </a>
      </div>
    </div>
  );
}
