'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import {
  chatNotifyPermission,
  ensureChatNotifyPermission,
} from '@/lib/chat-notify';

const DISMISS_KEY = 'cityhost_notify_dismissed';

export default function NotifyPrompt({ armed }: { armed: boolean }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // ignore
    }
    if (chatNotifyPermission() !== 'default') return;
    setVisible(true);
  }, [armed]);

  if (!visible) return null;

  const hide = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  const enable = async () => {
    setBusy(true);
    const ok = await ensureChatNotifyPermission();
    setBusy(false);
    if (ok || chatNotifyPermission() !== 'default') hide();
  };

  return (
    <div className="mx-3 mt-3 mb-1 rounded-2xl border border-brand-500/30 bg-gradient-to-r from-brand-500/15 to-surface-900/90 px-3 py-2.5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
        <Bell className="w-4 h-4 text-brand-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-white leading-tight">Get a ping when they reply</p>
        <p className="text-[11px] text-surface-400 leading-snug mt-0.5">
          Even if City Host is in the background.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="shrink-0 px-3 py-1.5 rounded-full bg-white text-surface-950 text-[12px] font-bold hover:bg-zinc-100 cursor-pointer disabled:opacity-60"
      >
        {busy ? '…' : 'Turn on'}
      </button>
      <button
        type="button"
        onClick={hide}
        className="p-1 text-surface-500 hover:text-white cursor-pointer shrink-0"
        aria-label="Dismiss notification prompt"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
