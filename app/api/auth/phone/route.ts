import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/db';
import {
  GUEST_SESSION_DAYS,
  getCurrentUser,
  signToken,
  attachUserCookie,
} from '@/lib/auth';
import { error, handleApiError } from '@/lib/api-helpers';
import {
  attachIdentity,
  findUserIdByIdentity,
  normalizeIdentityValue,
  refreshLead,
} from '@/lib/leads';
import { mergeDeviceMeta } from '@/lib/device-meta';
import { inferCountryFromPhone, inferLanguage, resolveGeo } from '@/lib/market';
import {
  ensureAssistedConversation,
  sendCustomerText,
} from '@/lib/assisted-chat';

const PLACEHOLDER_NAMES = new Set(['Visitor', 'Guest Traveler', 'Guest']);

function isRealName(value?: string | null) {
  const name = (value || '').trim();
  return name.length >= 2 && !PLACEHOLDER_NAMES.has(name);
}

async function loadUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { profile: { include: { photos: true } } },
  });
}

async function findUserByPhone(normalized: string) {
  const identityUserId =
    (await findUserIdByIdentity('phone', normalized)) ||
    (await findUserIdByIdentity('whatsapp', normalized));
  if (identityUserId) return loadUser(identityUserId);

  return prisma.user.findFirst({
    where: {
      OR: [{ phone: normalized }, { whatsapp: normalized }],
    },
    include: { profile: { include: { photos: true } } },
  });
}

async function resolveConversationId(
  userId: string,
  conversationId?: string | null,
  targetUserId?: string | null
): Promise<string | null> {
  if (targetUserId) {
    return ensureAssistedConversation(userId, targetUserId);
  }
  if (!conversationId) return null;

  if (conversationId.startsWith('pending-')) {
    const extracted = conversationId.replace(/^pending-/, '');
    if (extracted) {
      return ensureAssistedConversation(userId, extracted);
    }
    return null;
  }

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { select: { userId: true } } },
  });
  if (!conv) return null;

  if (conv.participants.some((p) => p.userId === userId)) {
    return conv.id;
  }

  const targetId =
    conv.representedProfileUserId ||
    conv.participants.find((p) => p.userId !== conv.customerUserId)?.userId;
  if (!targetId) return null;

  return ensureAssistedConversation(userId, targetId);
}

async function finishProfileAndLead(params: {
  userId: string;
  cleanName: string;
  normalized: string;
  geoCountry?: string | null;
  deviceToken?: string;
  device?: unknown;
  created: boolean;
}) {
  const { userId, cleanName, normalized, geoCountry, deviceToken, device, created } =
    params;

  if (cleanName) {
    await prisma.profile.updateMany({
      where: { userId },
      data: { displayName: cleanName },
    });
  }

  await attachIdentity({
    userId,
    kind: 'phone',
    value: normalized,
    verified: true,
    isPrimary: true,
    defaultCountry: geoCountry,
  });

  const originCountry = inferCountryFromPhone(normalized);
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, deviceMeta: true, originCountry: true },
  });
  const mergedDevice = mergeDeviceMeta(existing?.deviceMeta, device);
  const updateData: Record<string, unknown> = {
    isVerifiedLead: true,
    verifiedVia: 'phone',
    signupStage: 'contact_provided',
    preferredChannel: 'phone',
    lastActiveAt: new Date(),
  };
  if (!existing?.phone) updateData.phone = normalized;
  if (originCountry && !existing?.originCountry) {
    updateData.originCountry = originCountry;
    updateData.language = inferLanguage(originCountry);
  }
  if (mergedDevice) updateData.deviceMeta = mergedDevice;

  try {
    await prisma.user.update({ where: { id: userId }, data: updateData });
  } catch {
    delete updateData.phone;
    await prisma.user.update({ where: { id: userId }, data: updateData });
  }

  if (deviceToken) {
    await attachIdentity({ userId, kind: 'device', value: deviceToken });
  }

  await refreshLead(userId);

  await prisma.analyticsEvent
    .create({
      data: {
        userId,
        eventType: created ? 'lead_created' : 'lead_verified',
        eventData: { method: 'phone', originCountry },
      },
    })
    .catch(() => {});
}

/**
 * POST /api/auth/phone
 *
 * Start chat first, then fill name + number on the profile, then score the lead.
 * Age and gender stay blank until the customer edits their profile later.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      phone,
      conversationId,
      targetUserId,
      firstMessage,
      deviceToken,
      device,
    } = body;

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return error('Enter your mobile number.', 400);
    }

    const guest = await getCurrentUser();
    const geo = resolveGeo(req.headers, {
      country: guest?.geoCountry,
      city: guest?.geoCity,
    });

    const normalized = normalizeIdentityValue(
      'phone',
      phone,
      guest?.geoCountry || geo.countryCode
    );
    if (!normalized) {
      return error('Enter a valid mobile number, including country code.', 400);
    }

    const cleanName =
      typeof name === 'string' && isRealName(name) ? name.trim() : '';

    let user = await findUserByPhone(normalized);
    let created = false;

    if (user && (user.status === 'blocked' || user.status === 'suspended')) {
      return error('This account has been suspended.', 403);
    }

    if (!user) {
      if (!cleanName) {
        return error('Enter your name so they know who is messaging.', 400);
      }

      if (guest && !guest.isVerifiedLead && !guest.phone) {
        user = await loadUser(guest.id);
      } else {
        created = true;
        user = await prisma.user.create({
          data: {
            signupStage: 'contact_provided',
            status: 'active',
            isVerifiedLead: true,
            verifiedVia: 'phone',
            phone: normalized,
            geoCountry: geo.countryCode,
            geoCity: geo.city,
            language: inferLanguage(null),
            profile: {
              create: {
                displayName: cleanName,
                isVerified: false,
                isVisible: false,
              },
            },
          },
          include: { profile: { include: { photos: true } } },
        });
      }
    }

    if (!user) {
      return error('Could not create your chat account.', 500);
    }

    const attachedProbe = await attachIdentity({
      userId: user.id,
      kind: 'phone',
      value: normalized,
      verified: true,
      isPrimary: true,
      defaultCountry: user.geoCountry || geo.countryCode,
    });

    if (attachedProbe.status === 'invalid') {
      return error('That number could not be saved. Check the country code.', 400);
    }

    if (attachedProbe.status === 'conflict') {
      const existing = await loadUser(attachedProbe.existingUserId);
      if (!existing) {
        return error('This number is already in use.', 409);
      }
      user = existing;
    }

    const activeConversationId = await resolveConversationId(
      user.id,
      typeof conversationId === 'string' ? conversationId : null,
      typeof targetUserId === 'string' ? targetUserId : null
    );

    const opener =
      typeof firstMessage === 'string' ? firstMessage.trim() : '';
    let sentMessage = null;
    if (activeConversationId && opener) {
      sentMessage = await sendCustomerText({
        conversationId: activeConversationId,
        senderUserId: user.id,
        content: opener,
      });
    }

    const token = signToken(
      { id: user.id, email: user.email || '', type: 'user' },
      GUEST_SESSION_DAYS
    );

    // Unlock chat + number-login immediately. Name and lead score follow after.
    await prisma.user
      .update({
        where: { id: user.id },
        data: {
          isVerifiedLead: true,
          verifiedVia: 'phone',
          phone: normalized,
        },
      })
      .catch(() => {});

    const finishUserId = user.id;
    after(() =>
      finishProfileAndLead({
        userId: finishUserId,
        cleanName,
        normalized,
        geoCountry: user?.geoCountry || geo.countryCode,
        deviceToken: typeof deviceToken === 'string' ? deviceToken : undefined,
        device,
        created,
      }).catch(() => {})
    );

    const res = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          displayName: cleanName || user.profile?.displayName || 'Customer',
          phone: normalized,
          isVerifiedLead: true,
          profile: user.profile,
        },
        conversationId: activeConversationId,
        message: sentMessage,
        created,
      },
    });

    return attachUserCookie(res, token, GUEST_SESSION_DAYS);
  } catch (err) {
    return handleApiError(err);
  }
}
