import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from './db';

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret';

if (
  process.env.NODE_ENV === 'production' &&
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

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface TokenPayload {
  id: string;
  email: string;
  type: 'user' | 'staff';
  role?: string;
}

export function signToken(payload: TokenPayload, expiresInDays?: number): string {
  const expiresIn = expiresInDays ? `${expiresInDays}d` : JWT_EXPIRES_IN || '7d';
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
      Boolean(process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https')));

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * maxAgeDays,
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

export async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(USER_COOKIE)?.value || null;
}

export async function getStaffAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(STAFF_COOKIE)?.value || null;
}

export async function getCurrentUser() {
  const token = await getAuthToken();
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

export async function getCurrentStaff() {
  const token = await getStaffAuthToken();
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

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

export async function requireStaff(requiredRole?: 'admin' | 'agent') {
  const staff = await getCurrentStaff();
  if (!staff) {
    throw new Error('UNAUTHORIZED');
  }
  if (requiredRole && staff.role !== requiredRole && staff.role !== 'admin') {
    throw new Error('FORBIDDEN');
  }
  return staff;
}

export async function requireAdmin() {
  return requireStaff('admin');
}
