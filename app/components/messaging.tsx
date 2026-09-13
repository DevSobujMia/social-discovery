'use client';

import { Check, CheckCheck } from 'lucide-react';

/** WhatsApp-style relative time for chat lists. */
export function chatListTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startToday.getTime() - startMsg.getTime()) / 86400000);
  if (dayDiff === 0) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function chatBubbleTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startToday.getTime() - startMsg.getTime()) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function sameCalendarDay(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function DayChip({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-3">
      <span className="text-[10px] font-semibold tracking-wide text-surface-400 bg-surface-900/90 border border-surface-800 px-2.5 py-1 rounded-full">
        {label}
      </span>
    </div>
  );
}

export function MessageTicks({
  status,
  pending,
}: {
  status?: string | null;
  pending?: boolean;
}) {
  if (pending) {
    return <Check className="w-3.5 h-3.5 text-white/35 inline shrink-0" />;
  }
  if (status === 'read') {
    return <CheckCheck className="w-3.5 h-3.5 text-sky-400 inline shrink-0" />;
  }
  if (status === 'delivered') {
    return <CheckCheck className="w-3.5 h-3.5 text-white/45 inline shrink-0" />;
  }
  return <Check className="w-3.5 h-3.5 text-white/45 inline shrink-0" />;
}

/** WhatsApp-style “typing…” row under the thread. */
export function TypingIndicator({ name }: { name?: string | null }) {
  const label = name?.trim() || 'They';
  return (
    <div className="flex justify-start mb-1 px-0.5">
      <div className="bg-surface-800 border border-surface-700/40 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1.5">
        <span className="sr-only">{label} is typing</span>
        <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
