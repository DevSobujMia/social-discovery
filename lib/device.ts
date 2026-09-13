/**
 * Browser-side device token.
 *
 * Ad traffic never registers, so the session cookie is the only thing tying a
 * visitor to their conversation — and cookies get cleared. This token lives in
 * `localStorage` as an independent second copy of that link, and
 * `POST /api/auth/device-resume` trades it back for a session.
 *
 * The token is opaque and meaningless on its own; it only matters because the
 * server has a matching `LeadIdentity` row.
 */

const DEVICE_KEY = 'heartlink_device';
const AD_PARAMS_KEY = 'heartlink_ad_params';

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Read the device token, creating one on first visit. Returns `null` when
 * storage is unavailable (private mode, storage disabled) — callers must treat
 * the token as best-effort and never depend on it.
 */
export function getDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing && existing.length >= 8) return existing;

    const token = randomToken();
    window.localStorage.setItem(DEVICE_KEY, token);
    return token;
  } catch {
    return null;
  }
}

// ============================================================
// AD PARAMETERS
// ============================================================

export interface AdParams {
  /** Gender of the profiles the ad promised, e.g. `?g=female`. */
  gender: string | null;
  minAge: number | null;
  maxAge: number | null;
  /** Where the visitor is, from `?city=`. */
  city: string | null;
  /** Country code from `?c=` or `?country=`. */
  country: string | null;
  /** Destination the ad advertised, from `?dest=`. */
  destination: string | null;
  /** A specific profile to open, from `?profile=`. */
  profileId: string | null;
}

const EMPTY_AD_PARAMS: AdParams = {
  gender: null,
  minAge: null,
  maxAge: null,
  city: null,
  country: null,
  destination: null,
  profileId: null,
};

function toInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Read the targeting the ad set already encoded in the URL.
 *
 * This is what removes the form from the funnel: the operator knows who they
 * targeted, so the visitor is never asked to re-enter their own age and gender.
 */
export function readAdParams(search: string): AdParams {
  const params = new URLSearchParams(search);

  const gender = params.get('g') || params.get('gender');
  const normalizedGender =
    gender === 'female' || gender === 'male' || gender === 'other'
      ? gender
      : gender === 'f'
        ? 'female'
        : gender === 'm'
          ? 'male'
          : null;

  return {
    gender: normalizedGender,
    minAge: toInt(params.get('amin') || params.get('minAge')),
    maxAge: toInt(params.get('amax') || params.get('maxAge')),
    city: params.get('city'),
    country: params.get('c') || params.get('country'),
    destination: params.get('dest') || params.get('destination'),
    profileId: params.get('profile') || params.get('profileId') || params.get('user'),
  };
}

/** Persist ad params so they survive navigation within the session. */
export function storeAdParams(params: AdParams): void {
  if (typeof window === 'undefined') return;
  const hasAnything = Object.values(params).some((v) => v !== null);
  if (!hasAnything) return;

  try {
    window.sessionStorage.setItem(AD_PARAMS_KEY, JSON.stringify(params));
    window.localStorage.setItem(AD_PARAMS_KEY, JSON.stringify(params));
  } catch {
    // Storage is optional; the in-memory copy still works for this page view.
  }
}

/** Ad params from this URL, falling back to whatever was stored earlier. */
export function loadAdParams(search?: string): AdParams {
  if (typeof window === 'undefined') return EMPTY_AD_PARAMS;

  const fromUrl = readAdParams(search ?? window.location.search);
  if (Object.values(fromUrl).some((v) => v !== null)) {
    storeAdParams(fromUrl);
    return fromUrl;
  }

  try {
    const raw =
      window.sessionStorage.getItem(AD_PARAMS_KEY) ||
      window.localStorage.getItem(AD_PARAMS_KEY);
    if (raw) return { ...EMPTY_AD_PARAMS, ...JSON.parse(raw) };
  } catch {
    // Fall through to empty.
  }

  return EMPTY_AD_PARAMS;
}

/** Midpoint of the ad's age range, used to pre-fill the lead's own age. */
export function inferVisitorAge(params: AdParams): number | null {
  if (params.minAge && params.maxAge) {
    return Math.round((params.minAge + params.maxAge) / 2);
  }
  return params.minAge || params.maxAge || null;
}
