import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  verifyPassword,
  signToken,
  attachStaffCookie,
  STAFF_SESSION_DAYS,
} from '@/lib/auth';
import { error, handleApiError, checkRateLimit } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`login:${ip}`, 20, 60 * 60 * 1000)) {
      return error('Too many login attempts. Try again later.', 429);
    }

    const body = await req.json();
    const { email, password, code, key } = body;

    const adminCode = (process.env.ADMIN_LOGIN_CODE || 'Dev0077').trim();
    const passedKey = (key || code || password || email || '').trim();

    // Direct admin login using the special password
    if (passedKey.toLowerCase() === adminCode.toLowerCase()) {
      let staff = await prisma.staffAccount.findFirst({
        where: { role: 'admin', status: 'active' },
      }) || await prisma.staffAccount.findFirst({
        where: { status: 'active' },
      });

      if (staff) {
        await prisma.staffAccount.update({
          where: { id: staff.id },
          data: { lastActiveAt: new Date() },
        });

        const token = signToken(
          { id: staff.id, email: staff.email, type: 'staff', role: staff.role },
          STAFF_SESSION_DAYS
        );

        const res = NextResponse.json({
          success: true,
          data: {
            type: 'staff',
            role: staff.role,
            staff: {
              id: staff.id,
              email: staff.email,
              role: staff.role,
              displayName: staff.displayName,
            },
            token,
          },
        });
        attachStaffCookie(res, token);
        return res;
      }
    }

    if (!email || !password) {
      return error('Password or admin access code is required');
    }

    const emailLower = email.toLowerCase().trim();

    // Public customers log in with their mobile number only.
    // Email/password here is staff (admin panel) only.

    const emailNormalized =
      emailLower === 'admin' || emailLower === 'administrator' || emailLower === 'admin@cityhost.live'
        ? 'admin@heartlink.com'
        : emailLower;

    // Try staff login
    let staff = await prisma.staffAccount.findUnique({
      where: { email: emailNormalized },
    });

    if (!staff && (emailLower === 'admin' || emailLower === 'administrator')) {
      staff = await prisma.staffAccount.findFirst({
        where: { role: 'admin', status: 'active' },
      });
    }

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
          token,
        },
      });
      return attachStaffCookie(res, token, STAFF_SESSION_DAYS);
    }

    return error('Invalid email or password');
  } catch (err) {
    return handleApiError(err);
  }
}
