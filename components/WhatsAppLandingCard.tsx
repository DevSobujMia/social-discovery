'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import HeartMark from '@/app/components/HeartMark';
import { ShieldCheck, MessageCircle, ExternalLink, Lock, CheckCircle2 } from 'lucide-react';

const TARGET_PHONE = '15187099695';
const BASE_WHATSAPP_URL = `https://wa.me/${TARGET_PHONE}`;

export default function WhatsAppLandingCard() {
  const [targetUrl, setTargetUrl] = useState(BASE_WHATSAPP_URL);
  const [countdown, setCountdown] = useState(2);
  const [redirectAttempted, setRedirectAttempted] = useState(false);

  useEffect(() => {
    // 1. Check if user came with any custom query text (?text=Hello)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const text = params.get('text');
      const finalUrl = text
        ? `${BASE_WHATSAPP_URL}?text=${encodeURIComponent(text)}`
        : BASE_WHATSAPP_URL;
      setTargetUrl(finalUrl);

      // 2. Track Meta Pixel Contact/Lead event for Facebook Ads optimization
      try {
        const win = window as any;
        if (typeof win.fbq === 'function') {
          win.fbq('track', 'Contact', {
            content_name: 'WhatsApp Landing Page',
            content_category: 'Direct Chat',
            phone: TARGET_PHONE,
          });
        }
      } catch (err) {
        console.warn('Meta Pixel tracking skipped:', err);
      }

      // 3. Auto-redirect immediately via client navigation
      const timer = setTimeout(() => {
        setRedirectAttempted(true);
        window.location.href = finalUrl;
      }, 800);

      // Countdown ticker for UI feedback
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, []);

  const handleManualClick = () => {
    try {
      const win = window as any;
      if (typeof win.fbq === 'function') {
        win.fbq('trackCustom', 'WhatsAppButtonClick', {
          phone: TARGET_PHONE,
          target_url: targetUrl,
        });
      }
    } catch {}
    window.location.href = targetUrl;
  };

  return (
    <main className="relative min-h-screen min-h-[100dvh] w-full bg-surface-950 flex flex-col justify-between items-center px-4 py-8 sm:py-12 overflow-x-hidden selection:bg-[#25D366]/30">
      {/* Background ambient lighting */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[480px] h-[340px] sm:h-[480px] rounded-full bg-[#25D366]/10 blur-[120px]" />
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

      {/* Center Landing / Fallback Card */}
      <section className="relative z-10 w-full max-w-sm sm:max-w-md my-auto">
        <div className="relative rounded-3xl bg-surface-900/80 border border-surface-700/60 p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-black/80 flex flex-col items-center text-center">
          {/* Animated WhatsApp Emblem with radar pulse */}
          <div className="relative my-2 flex items-center justify-center">
            {/* Pulsing radar ring */}
            <span className="absolute w-24 h-24 rounded-full bg-[#25D366]/20 animate-ping opacity-60" />
            <span className="absolute w-20 h-20 rounded-full bg-[#25D366]/25 animate-pulse" />
            
            {/* WhatsApp Icon Circle */}
            <div className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-tr from-[#1ebd59] to-[#25D366] flex items-center justify-center shadow-lg shadow-[#25D366]/35 ring-4 ring-surface-900">
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

          {/* Heading */}
          <div className="mt-4 space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {countdown > 0 ? 'Connecting to WhatsApp...' : 'Ready to Chat'}
            </h1>
            <p className="text-xs sm:text-sm text-surface-400 max-w-[280px] sm:max-w-xs mx-auto leading-relaxed">
              Opening your direct WhatsApp chat with City Host.
            </p>
          </div>

          {/* Status / Auto-redirect indicator */}
          <div className="mt-4 mb-6 px-3 py-1.5 rounded-full bg-surface-800/80 border border-surface-700/50 flex items-center gap-2 text-xs text-surface-300">
            <div className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
            <span>
              {countdown > 0
                ? `Redirecting automatically in ${countdown}s...`
                : 'Click button below to start chat'}
            </span>
          </div>

          {/* Primary Action Button: "Continue to WhatsApp" */}
          <a
            href={targetUrl}
            onClick={handleManualClick}
            className="group w-full py-4 px-6 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1da850] active:scale-[0.98] transition-all duration-200 text-white font-bold text-base sm:text-lg flex items-center justify-center gap-3 shadow-xl shadow-[#25D366]/30 hover:shadow-[#25D366]/40 cursor-pointer"
          >
            <MessageCircle className="w-5 h-5 fill-white text-[#25D366]" />
            <span>Continue to WhatsApp</span>
            <ExternalLink className="w-4 h-4 opacity-75 group-hover:opacity-100 transition-opacity" />
          </a>

          {/* Fallback helper text */}
          <p className="mt-3.5 text-[11px] sm:text-xs text-surface-400">
            If WhatsApp does not open automatically, tap the button above.
          </p>

          {/* Trust badges */}
          <div className="mt-6 pt-5 border-t border-surface-800/80 w-full flex items-center justify-around text-[11px] text-surface-400">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>End-to-End Encrypted</span>
            </div>
            <span className="text-surface-700">•</span>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Official Channel</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer / Privacy Policy (Crucial for Facebook Ads approval) */}
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
