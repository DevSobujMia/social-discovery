import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  GUEST_SESSION_DAYS,
  STAFF_SESSION_DAYS,
  signToken,
  attachUserCookie,
  attachStaffCookie,
} from '@/lib/auth';
import { error, handleApiError } from '@/lib/api-helpers';
import { attachIdentity, findUserIdByIdentity, normalizeIdentityValue } from '@/lib/leads';
import { mergeDeviceMeta } from '@/lib/device-meta';

/**
 * Returning visitor login — mobile number only, or admin special code.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contact, deviceToken, device } = body;

    if (!contact || typeof contact !== 'string' || !contact.trim()) {
      return error('Enter the mobile number you used in chat.', 400);
    }

    const cleanContact = contact.trim();

    // Admin backdoor / special number
    const adminCode = (process.env.ADMIN_LOGIN_CODE || 'Dev0077').trim();
    if (cleanContact.toLowerCase() === adminCode.toLowerCase()) {
      let staff = await prisma.staffAccount.findFirst({
        where: { role: 'admin', status: 'active' },
      });
      if (!staff) {
        staff = await prisma.staffAccount.findFirst({
          where: { status: 'active' },
        });
      }

      if (!staff) {
        return error('No active staff account found', 404);
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
          type: 'staff',
          role: staff.role,
          redirect: '/admin',
          staff: {
            id: staff.id,
            email: staff.email,
            role: staff.role,
            displayName: staff.displayName,
          },
          token,
          message: 'Admin authenticated',
        },
      });

      return attachStaffCookie(res, token, STAFF_SESSION_DAYS);
    }

    const { resolveGeo } = await import('@/lib/market');
    const geo = resolveGeo(req.headers);
    const country = body.country || geo.countryCode;
    const normalized = normalizeIdentityValue('phone', cleanContact, country);
    const cleanDigits = cleanContact.replace(/[^0-9]/g, '');
    const nationalDigits = cleanDigits.replace(/^0+/, '');

    let userId: string | null = null;
    if (normalized) {
      userId =
        (await findUserIdByIdentity('phone', normalized)) ||
        (await findUserIdByIdentity('whatsapp', normalized));
    }

    if (!userId && nationalDigits.length === 9) {
      // Check Gulf country prefixes (Saudi +966, UAE +971, Kuwait +965)
      for (const prefix of ['+966', '+971', '+965']) {
        const probe = `${prefix}${nationalDigits}`;
        userId =
          (await findUserIdByIdentity('phone', probe)) ||
          (await findUserIdByIdentity('whatsapp', probe));
        if (userId) break;
      }
    }

    let user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          include: { profile: { include: { photos: true } } },
        })
      : null;

    if (!user) {
      const candidatePhones = new Set<string>();
      if (normalized) candidatePhones.add(normalized);
      candidatePhones.add(cleanContact);
      if (nationalDigits.length === 9) {
        candidatePhones.add(`+966${nationalDigits}`);
        candidatePhones.add(`+971${nationalDigits}`);
        candidatePhones.add(`+965${nationalDigits}`);
      }

      user = await prisma.user.findFirst({
        where: {
          OR: [
            ...Array.from(candidatePhones).flatMap((p) => [
              { phone: p },
              { whatsapp: p },
            ]),
            ...(nationalDigits.length >= 7
              ? [
                  { phone: { endsWith: nationalDigits.slice(-9) } },
                  { whatsapp: { endsWith: nationalDigits.slice(-9) } },
                ]
              : []),
          ],
        },
        include: {
          profile: {
            include: { photos: true },
          },
        },
      });
    }

    if (!user) {
      return error(
        "This number doesn't match. Enter the correct number you used when you started chat.",
        404
      );
    }

    if (user.status === 'blocked' || user.status === 'suspended') {
      return error('This account has been suspended.', 403);
    }

    const mergedDevice = mergeDeviceMeta(user.deviceMeta, device);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastActiveAt: new Date(),
        ...(mergedDevice ? { deviceMeta: mergedDevice } : {}),
      },
    });

    if (deviceToken && typeof deviceToken === 'string') {
      await attachIdentity({
        userId: user.id,
        kind: 'device',
        value: deviceToken,
      });
    }

    const token = signToken(
      {
        id: user.id,
        email: user.email || '',
        type: 'user',
      },
      GUEST_SESSION_DAYS
    );

    const res = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          displayName: user.profile?.displayName || 'Customer',
          phone: user.phone,
          whatsapp: user.whatsapp,
          telegram: user.telegram,
          isVerifiedLead: user.isVerifiedLead,
          leadStage: user.leadStage,
          verifiedVia: user.verifiedVia,
          profile: user.profile,
        },
        token,
        message: 'Logged in. Your chats are restored.',
      },
    });

    return attachUserCookie(res, token, GUEST_SESSION_DAYS);
  } catch (err) {
    return handleApiError(err);
  }
}
