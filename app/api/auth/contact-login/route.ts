import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  GUEST_SESSION_DAYS,
  signToken,
  attachUserCookie,
} from '@/lib/auth';
import { error, handleApiError } from '@/lib/api-helpers';
import { attachIdentity, findUserIdByIdentity, normalizeIdentityValue } from '@/lib/leads';
import { mergeDeviceMeta } from '@/lib/device-meta';

/**
 * Returning visitor login — mobile number only, no password.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contact, deviceToken, device } = body;

    if (!contact || typeof contact !== 'string' || !contact.trim()) {
      return error('Enter the mobile number you used in chat.', 400);
    }

    const cleanContact = contact.trim();
    const normalized = normalizeIdentityValue('phone', cleanContact, null);
    const cleanDigits = cleanContact.replace(/[^0-9]/g, '');

    let userId: string | null = null;
    if (normalized) {
      userId =
        (await findUserIdByIdentity('phone', normalized)) ||
        (await findUserIdByIdentity('whatsapp', normalized));
    }

    let user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          include: { profile: { include: { photos: true } } },
        })
      : null;

    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            ...(normalized
              ? [{ phone: normalized }, { whatsapp: normalized }]
              : []),
            { phone: cleanContact },
            { whatsapp: cleanContact },
            ...(cleanDigits.length >= 8
              ? [
                  { phone: { contains: cleanDigits } },
                  { whatsapp: { contains: cleanDigits } },
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
        'No chat account found with this number. Send a message with your name and number first.',
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
        message: 'Logged in. Your chats are restored.',
      },
    });

    return attachUserCookie(res, token, GUEST_SESSION_DAYS);
  } catch (err) {
    return handleApiError(err);
  }
}
