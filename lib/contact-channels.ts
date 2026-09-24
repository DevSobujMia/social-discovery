/**
 * Contact Channels Configuration & Deep Linking Helpers
 * Supports 3 messaging options: City Host (In-App), WhatsApp, Telegram
 */

import { trackPixel } from './pixel';
import { getDeviceToken } from './device';

export interface ChannelConfig {
  defaultWhatsApp: string;
  defaultTelegram: string;
}

/**
 * Global channel defaults.
 * Configured with active outreach WhatsApp & Telegram handles.
 */
export const DEFAULT_CHANNELS: ChannelConfig = {
  // Default WhatsApp number (+49 1521 0635575 -> 4915210635575)
  defaultWhatsApp:
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, '') ||
    '4915210635575',
  // Default Telegram username (@avamiller_uk -> avamiller_uk)
  defaultTelegram:
    process.env.NEXT_PUBLIC_TELEGRAM_USERNAME?.replace(/^@/, '') ||
    'avamiller_uk',
};

/**
 * Clean phone numbers to pure digits for WhatsApp links
 */
export function cleanPhoneDigits(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Clean Telegram handles to username only
 */
export function cleanTelegramUsername(handle?: string | null): string {
  if (!handle) return '';
  return handle.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
}

export interface BuildChannelLinkOptions {
  phone?: string | null;
  username?: string | null;
  profileName?: string | null;
  city?: string | null;
  country?: string | null;
  customMessage?: string | null;
}

/**
 * Build 1-click native WhatsApp chat URL
 */
export function buildWhatsAppLink(options: BuildChannelLinkOptions = {}): string {
  const targetPhone =
    cleanPhoneDigits(options.phone) || DEFAULT_CHANNELS.defaultWhatsApp;

  const firstName = options.profileName?.split(' ')[0] || 'there';

  const defaultGreeting =
    options.customMessage ||
    `Hi ${firstName}! I saw your profile on City Host. Would love to connect.`;

  return `https://wa.me/${targetPhone}?text=${encodeURIComponent(defaultGreeting)}`;
}

/**
 * Build 1-click native Telegram chat URL
 */
export function buildTelegramLink(options: BuildChannelLinkOptions = {}): string {
  const targetUsername =
    cleanTelegramUsername(options.username) || DEFAULT_CHANNELS.defaultTelegram;

  const firstName = options.profileName?.split(' ')[0] || 'there';

  const defaultGreeting =
    options.customMessage ||
    `Hi ${firstName}! I saw your profile on City Host.`;

  return `https://t.me/${targetUsername}?text=${encodeURIComponent(defaultGreeting)}`;
}

/**
 * Track lead intent and pixel conversions when clicking a messaging channel
 */
export function trackChannelClick(
  channel: 'direct' | 'whatsapp' | 'telegram',
  meta: {
    profileName?: string;
    profileId?: string;
    city?: string;
  } = {}
) {
  try {
    // 1. Meta Pixel event
    if (channel === 'whatsapp' || channel === 'telegram') {
      trackPixel('Contact', {
        channel,
        content_name: meta.profileName,
        content_ids: meta.profileId ? [meta.profileId] : undefined,
      });
      trackPixel('Lead', {
        method: channel,
        content_name: meta.profileName,
      });
    } else {
      trackPixel('Contact', {
        channel: 'direct_chat',
        content_name: meta.profileName,
      });
    }

    // 2. Log intent telemetry if browser is active
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cityhost_last_channel', channel);
        localStorage.setItem('cityhost_last_contacted_profile', JSON.stringify(meta));
      } catch {}

      fetch('/api/auth/verify-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: channel === 'whatsapp' ? 'whatsapp' : channel === 'telegram' ? 'telegram' : 'phone',
          value: `intent_click_${channel}`,
          profileId: meta.profileId,
          profileName: meta.profileName,
        }),
      }).catch(() => {});
    }
  } catch {}
}
