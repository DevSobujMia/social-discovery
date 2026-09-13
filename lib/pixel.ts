/**
 * Meta Pixel helpers. No-ops when the pixel id is unset, so local and
 * test environments never throw.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export type PixelEvent = 'PageView' | 'ViewContent' | 'Contact' | 'Lead' | 'CompleteRegistration';

export function trackPixel(
  event: PixelEvent,
  params?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return;
  if (typeof window.fbq !== 'function') return;
  try {
    window.fbq('track', event, params);
  } catch {
    // Pixel must never break the funnel.
  }
}
