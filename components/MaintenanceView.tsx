'use client';

import React from 'react';
import HeartMark from '@/app/components/HeartMark';
import { Wrench, Shield, RefreshCw, Sparkles, Clock } from 'lucide-react';
import { MAINTENANCE_CONFIG } from '@/config/maintenance';

interface MaintenanceViewProps {
  title?: string;
  message?: string;
}

export default function MaintenanceView({ title, message }: MaintenanceViewProps) {
  const displayTitle = (title || MAINTENANCE_CONFIG.title).trim();
  const displayMessage = (message || MAINTENANCE_CONFIG.message).trim();
  return (
    <div className="min-h-screen w-full bg-surface-950 text-white flex flex-col justify-between items-center p-4 sm:p-6 relative overflow-hidden selection:bg-brand-500 selection:text-white">
      {/* Ambient background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Logo */}
      <header className="w-full max-w-4xl flex items-center justify-between pt-2 sm:pt-4 z-10">
        <div className="flex items-center gap-2">
          <HeartMark />
          <h1 className="brand-wordmark text-lg sm:text-xl">
            City <em>Host</em>
          </h1>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Under Maintenance</span>
        </div>
      </header>

      {/* Main Content Card */}
      <main className="w-full max-w-md my-auto py-8 z-10 text-center animate-fade-in">
        <div className="relative p-6 sm:p-8 rounded-3xl bg-surface-900/90 border border-surface-800 shadow-2xl backdrop-blur-xl space-y-6">
          {/* Animated Icon Badge */}
          <div className="relative mx-auto w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-brand-500/20 to-surface-800 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
            <div className="absolute -top-1 -right-1">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            </div>
            <Wrench className="w-9 h-9 text-amber-400 animate-pulse" />
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
              {displayTitle}
            </h2>
            <p className="text-xs sm:text-sm text-surface-300 leading-relaxed font-normal">
              {displayMessage}
            </p>
          </div>

          {/* Status Tracker Box */}
          <div className="p-3.5 rounded-2xl bg-surface-950/70 border border-surface-800/80 text-left space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-surface-400">
              <span className="flex items-center gap-1.5 text-amber-300">
                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                <span>System Update in progress</span>
              </span>
              <span className="text-surface-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Active</span>
              </span>
            </div>
            {/* Progress line */}
            <div className="w-full bg-surface-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-400 to-brand-500 h-1.5 rounded-full w-2/3 animate-pulse" />
            </div>
            <p className="text-[10px] text-surface-400 text-center pt-0.5">
              Please check back shortly. Thank you for your patience!
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl text-center py-3 text-[11px] text-surface-400 z-10 flex items-center justify-center gap-2">
        <Shield className="w-3.5 h-3.5 text-surface-400" />
        <span>City Host IT Operations · Scheduled Maintenance</span>
      </footer>
    </div>
  );
}
