'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import HeartMark from '@/app/components/HeartMark';
import { ShieldCheck, MessageCircle, ExternalLink, Lock, CheckCircle2, Clock, Sparkles } from 'lucide-react';

const TARGET_PHONE = '15187099695';
const BASE_WHATSAPP_URL = `https://wa.me/${TARGET_PHONE}`;

export default function WhatsAppLandingCard() {
  const [targetUrl, setTargetUrl] = useState(BASE_WHATSAPP_URL);

  useEffect(() => {
    // Check if user came with custom query text (?text=...)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const text = params.get('text');
      if (text) {
        setTargetUrl(`${BASE_WHATSAPP_URL}?text=${encodeURIComponent(text)}`);
      }
    }
  }, []);

  const handleWhatsAppClick = () => {
    try {
      const win = window as any;
      if (typeof win.fbq === 'function') {
        win.fbq('track', 'Contact', {
          content_name: 'WhatsApp Button Click',
          content_category: 'Direct Chat',
          phone: TARGET_PHONE,
        });
      }
    } catch (e) {
      // ignore
    }
  };

  return (
    <main className="relative min-h-screen min-h-[100dvh] w-full bg-surface-950 flex flex-col justify-between items-center px-4 py-8 sm:py-12 overflow-x-hidden selection:bg-[#25D366]/30">
      {/* Background ambient lighting */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[500px] h-[340px] sm:h-[500px] rounded-full bg-[#25D366]/10 blur-[130px]" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-brand-500/10 blur-[130px]" />
      </div>

      {/* Top Header / Branding */}
      <header className="relative z-10 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-surface-900/90 border border-surface-700/60 shadow-lg backdrop-blur-md">
          <HeartMark className="w-4 h-4" />
          <span className="text-xs font-bold tracking-wider text-white uppercase">
            City Host
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3" />
            Verified
          </span>
        </div>
      </header>

      {/* Center Landing Card with Big WhatsApp Button */}
      <section className="relative z-10 w-full max-w-sm sm:max-w-md my-auto">
        <div className="relative rounded-3xl bg-surface-900/85 border border-surface-700/60 p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-black/80 flex flex-col items-center text-center">
          
          {/* WhatsApp Brand Badge */}
          <div className="relative my-2 flex items-center justify-center">
            {/* Soft Ambient Glow */}
            <span className="absolute w-20 h-20 rounded-full bg-[#25D366]/20 blur-md" />
            
            {/* WhatsApp Icon Circle */}
            <div className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-tr from-[#1ebd59] to-[#25D366] flex items-center justify-center shadow-lg shadow-[#25D366]/30 ring-4 ring-surface-900">
              <svg
                viewBox="0 0 24 24"
                width="34"
                height="34"
                className="fill-white"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.89 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.457h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.488-8.414z" />
              </svg>
            </div>
          </div>

          {/* Heading & Subtitle */}
          <div className="mt-4 space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Chat on WhatsApp
            </h1>
            <p className="text-xs sm:text-sm text-surface-300 max-w-[290px] sm:max-w-xs mx-auto leading-relaxed">
              Connect directly with City Host to chat with verified travellers and explore local city meetups.
            </p>
          </div>

          {/* Online Status Pill */}
          <div className="mt-3.5 mb-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-800/90 border border-surface-700/60 text-xs text-surface-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-medium">Online now • Fast response</span>
          </div>

          {/* Primary Big WhatsApp Button */}
          <a
            href={targetUrl}
            onClick={handleWhatsAppClick}
            target="_blank"
            rel="noopener noreferrer"
            className="group w-full py-4.5 px-6 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1da850] active:scale-[0.98] transition-all duration-200 text-white font-extrabold text-lg sm:text-xl flex items-center justify-center gap-3 shadow-xl shadow-[#25D366]/30 hover:shadow-[#25D366]/45 cursor-pointer"
          >
            <MessageCircle className="w-6 h-6 fill-white text-[#25D366]" />
            <span>Chat on WhatsApp</span>
            <ExternalLink className="w-4 h-4 opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </a>

          {/* Clear Sub-button info */}
          <p className="mt-3.5 text-xs text-surface-400">
            Click the button to open chat directly in WhatsApp.
          </p>

          {/* Trust Highlights */}
          <div className="mt-6 pt-5 border-t border-surface-800/80 w-full grid grid-cols-2 gap-2 text-left text-[11px] text-surface-300">
            <div className="flex items-center gap-2 bg-surface-950/40 p-2.5 rounded-xl border border-surface-800/50">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>End-to-End Encrypted</span>
            </div>
            <div className="flex items-center gap-2 bg-surface-950/40 p-2.5 rounded-xl border border-surface-800/50">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Direct Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer / Privacy & Terms (Crucial for Meta Ad review approval) */}
      <footer className="relative z-10 text-center space-y-2 mt-4">
        <p className="text-[11px] text-surface-500">
          City Host — Travellers visiting your city.
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-surface-400">
          <Link
            href="/legal/privacy"
            className="hover:text-surface-200 transition-colors underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
          <span className="text-surface-700">•</span>
          <Link
            href="/legal/terms"
            className="hover:text-surface-200 transition-colors underline-offset-4 hover:underline"
          >
            Terms of Service
          </Link>
        </div>
      </footer>
    </main>
  );
}
