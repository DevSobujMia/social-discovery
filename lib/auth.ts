import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { prisma } from './db';

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret';

if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === 'fallback-dev-secret')
) {
  throw new Error(
    'AUTH_SECRET must be set to a strong random value in production before serving traffic.'
  );
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Staff and visitors MUST use separate cookies. A shared cookie meant that
 * guest/device-resume on `/` overwrote the admin session on every visit.
 */
export const GUEST_SESSION_DAYS = 365;
export const STAFF_SESSION_DAYS = 7;

export const USER_COOKIE = 'auth_token';
export const STAFF_COOKIE = 'staff_auth_token';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const verifyPassword = comparePassword;

export interface TokenPayload {
  id: string;
  email: string;
  type: 'user' | 'staff';
  role?: string;
}

export function signToken(payload: TokenPayload, expiresInDays?: string | number): string {
  let expiresIn: string | number = JWT_EXPIRES_IN;
  if (typeof expiresInDays === 'number') {
    expiresIn = `${expiresInDays}d`;
  } else if (typeof expiresInDays === 'string') {
    expiresIn = expiresInDays;
  }
  return jwt.sign(payload, AUTH_SECRET, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, AUTH_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

function cookieOptions(maxAgeDays: number) {
  const isSecure =
    process.env.COOKIE_SECURE === 'true' ||
    (process.env.NODE_ENV === 'production' &&
      (Boolean(process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https')) ||
        Boolean(process.env.NEXT_PUBLIC_APP_URL?.startsWith('https')) ||
        Boolean(process.env.APP_URL?.startsWith('https')) ||
        process.env.NODE_ENV === 'production'));

  const maxAgeSeconds = 60 * 60 * 24 * maxAgeDays;
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
    expires: new Date(Date.now() + maxAgeSeconds * 1000),
  };
}

/** Prefer attaching cookies onto the response — most reliable in App Router. */
export function attachUserCookie(
  res: NextResponse,
  token: string,
  maxAgeDays = GUEST_SESSION_DAYS
) {
  res.cookies.set(USER_COOKIE, token, cookieOptions(maxAgeDays));
  return res;
}

export function attachStaffCookie(
  res: NextResponse,
  token: string,
  maxAgeDays = STAFF_SESSION_DAYS
) {
  res.cookies.set(STAFF_COOKIE, token, cookieOptions(maxAgeDays));
  return res;
}

export async function setAuthCookie(token: string, maxAgeDays = GUEST_SESSION_DAYS) {
  const cookieStore = await cookies();
  cookieStore.set(USER_COOKIE, token, cookieOptions(maxAgeDays));
}

export async function setStaffAuthCookie(token: string, maxAgeDays = STAFF_SESSION_DAYS) {
  const cookieStore = await cookies();
  cookieStore.set(STAFF_COOKIE, token, cookieOptions(maxAgeDays));
}

export async function removeAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(USER_COOKIE);
}

export async function removeStaffAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(STAFF_COOKIE);
}

export async function removeAllAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(USER_COOKIE);
  cookieStore.delete(STAFF_COOKIE);
}

export async function getAuthToken(req?: NextRequest | Request): Promise<string | null> {
  let token: string | null = null;
  if (req && 'cookies' in req && typeof (req.cookies as any)?.get === 'function') {
    token = (req.cookies as any).get(USER_COOKIE)?.value || null;
  }
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(USER_COOKIE)?.value || null;
    } catch {}
  }
  if (token) return token;

  if (req && typeof req.headers?.get === 'function') {
    const auth = req.headers.get('authorization') || req.headers.get('Authorization');
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice(7).trim();
    }
  }
  try {
    const headerStore = await headers();
    const auth = headerStore.get('authorization') || headerStore.get('Authorization');
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice(7).trim();
    }
  } catch {}

  return null;
}

export async function getStaffAuthToken(req?: NextRequest | Request): Promise<string | null> {
  let token: string | null = null;
  if (req && 'cookies' in req && typeof (req.cookies as any)?.get === 'function') {
    token = (req.cookies as any).get(STAFF_COOKIE)?.value || null;
  }
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(STAFF_COOKIE)?.value || null;
    } catch {}
  }
  if (token) return token;

  if (req && typeof req.headers?.get === 'function') {
    const auth = req.headers.get('authorization') || req.headers.get('Authorization');
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice(7).trim();
    }
  }
  try {
    const headerStore = await headers();
    const auth = headerStore.get('authorization') || headerStore.get('Authorization');
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice(7).trim();
    }
  } catch {}

  return null;
}

export async function getCurrentUser(req?: NextRequest | Request) {
  const token = await getAuthToken(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || payload.type !== 'user') return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: {
        profile: {
          include: {
            photos: true,
            travelPlans: {
              where: { isActive: true },
              orderBy: { fromDate: 'asc' },
            },
          },
        },
      },
    });
    if (!user || user.status !== 'active') return null;
    return user;
  } catch {
    return null;
  }
}

export async function getCurrentStaff(req?: NextRequest | Request) {
  const token = await getStaffAuthToken(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || payload.type !== 'staff') return null;

  try {
    const staff = await prisma.staffAccount.findUnique({
      where: { id: payload.id },
    });
    if (!staff || staff.status !== 'active') return null;
    return staff;
  } catch {
    return null;
  }
}

export async function requireUser(req?: NextRequest | Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

export async function requireStaff(
  arg1?: 'admin' | 'agent' | NextRequest | Request,
  arg2?: 'admin' | 'agent' | NextRequest | Request
) {
  let requiredRole: 'admin' | 'agent' | undefined;
  let req: NextRequest | Request | undefined;

  if (typeof arg1 === 'string') {
    requiredRole = arg1;
  } else if (arg1 && typeof arg1 === 'object') {
    req = arg1;
  }

  if (typeof arg2 === 'string') {
    requiredRole = arg2;
  } else if (arg2 && typeof arg2 === 'object') {
    req = arg2;
  }

  const staff = await getCurrentStaff(req);
  if (!staff) {
    throw new Error('UNAUTHORIZED');
  }
  if (requiredRole && staff.role !== requiredRole && staff.role !== 'admin') {
    throw new Error('FORBIDDEN');
  }
  return staff;
}

export async function requireAdmin(req?: NextRequest | Request) {
  return requireStaff('admin', req);
}
