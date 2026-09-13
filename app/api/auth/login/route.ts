import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  verifyPassword,
  signToken,
  attachUserCookie,
  attachStaffCookie,
  STAFF_SESSION_DAYS,
  GUEST_SESSION_DAYS,
} from '@/lib/auth';
import { success, error, handleApiError, checkRateLimit } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`login:${ip}`, 20, 60 * 60 * 1000)) {
      return error('Too many login attempts. Try again later.', 429);
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return error('Email and password are required');
    }

    const emailLower = email.toLowerCase().trim();

    // Try user login first
    const user = await prisma.user.findUnique({
      where: { email: emailLower },
      include: { profile: { include: { photos: true } } },
    });

    if (user && user.passwordHash) {
      if (user.status !== 'active') {
        return error('Your account has been suspended or blocked');
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return error('Invalid email or password');
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() },
      });

      const token = signToken({
        id: user.id,
        email: user.email!,
        type: 'user',
      });

      const res = NextResponse.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            profile: user.profile,
          },
          type: 'user',
          id: user.id,
          email: user.email,
          profile: user.profile,
        },
      });
      return attachUserCookie(res, token, GUEST_SESSION_DAYS);
    }

    // Try staff login
    const staff = await prisma.staffAccount.findUnique({
      where: { email: emailLower },
    });

    if (staff) {
      if (staff.status !== 'active') {
        return error('Your account has been deactivated');
      }

      const valid = await verifyPassword(password, staff.passwordHash);
      if (!valid) {
        return error('Invalid email or password');
      }

      await prisma.staffAccount.update({
        where: { id: staff.id },
        data: { lastActiveAt: new Date() },
      });

      const token = signToken(
        {
          id: staff.id,
          email: staff.email,
          type: 'staff',
          role: staff.role,
        },
        STAFF_SESSION_DAYS
      );

      const res = NextResponse.json({
        success: true,
        data: {
          staff: {
            id: staff.id,
            email: staff.email,
            role: staff.role,
            displayName: staff.displayName,
          },
          type: 'staff',
          id: staff.id,
          email: staff.email,
          role: staff.role,
          displayName: staff.displayName,
        },
      });
      return attachStaffCookie(res, token, STAFF_SESSION_DAYS);
    }

    return error('Invalid email or password');
  } catch (err) {
    return handleApiError(err);
  }
}
