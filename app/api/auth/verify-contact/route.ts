import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';
import {
  attachIdentity,
  normalizeIdentityValue,
  refreshLead,
  type IdentityKind,
} from '@/lib/leads';
import { inferCountryFromPhone, inferLanguage } from '@/lib/market';

/** Channels a visitor can hand over without any third-party credentials. */
const ALLOWED_METHODS: IdentityKind[] = ['phone', 'whatsapp', 'telegram', 'email'];

/** Legacy `User` columns kept in sync so the admin panel keeps working. */
const LEGACY_COLUMN: Partial<Record<IdentityKind, 'phone' | 'whatsapp' | 'telegram' | 'email'>> = {
  phone: 'phone',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  email: 'email',
};

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireUser();
    const body = await req.json();
    const { method, value } = body;

    if (!method || !ALLOWED_METHODS.includes(method)) {
      return error(
        'Invalid channel. Choose WhatsApp, Telegram, phone, or email.',
        400
      );
    }

    if (!value || typeof value !== 'string' || !value.trim()) {
      return error('Please provide a valid contact number or username.', 400);
    }

    const kind = method as IdentityKind;

    // Local-format numbers are expanded using the country we resolved when the
    // visitor landed, so "0501234567" becomes "+971501234567".
    const normalized = normalizeIdentityValue(
      kind,
      value,
      currentUser.geoCountry
    );

    if (!normalized) {
      const hint =
        kind === 'telegram'
          ? 'Enter your Telegram username or phone number.'
          : kind === 'email'
            ? 'Enter a valid email address.'
            : 'Enter a valid phone number including the country code.';
      return error(hint, 400);
    }

    const attached = await attachIdentity({
      userId: currentUser.id,
      kind,
      value: normalized,
      verified: true,
      isPrimary: true,
      defaultCountry: currentUser.geoCountry,
    });

    if (attached.status === 'invalid') {
      return error('That contact could not be saved. Please check it.', 400);
    }

    // Somebody else already chats with us on this contact. Rather than create a
    // duplicate lead, point the visitor at the returning-customer login.
    if (attached.status === 'conflict') {
      return error(
        'You have chatted with us on this contact before. Continue with your existing conversation.',
        409,
        { code: 'CONTACT_BELONGS_TO_EXISTING_LEAD', method: kind }
      );
    }

    const originCountry =
      kind === 'phone' || kind === 'whatsapp'
        ? inferCountryFromPhone(normalized)
        : null;

    const legacyColumn = LEGACY_COLUMN[kind];
    const updateData: Record<string, unknown> = {
      isVerifiedLead: true,
      leadStage: 'complete',
      verifiedVia: kind,
      signupStage: 'contact_provided',
      preferredChannel: kind,
    };
    if (legacyColumn) updateData[legacyColumn] = normalized;
    if (originCountry) {
      updateData.originCountry = originCountry;
      updateData.language = inferLanguage(originCountry);
    }

    let updatedUser;
    try {
      updatedUser = await prisma.user.update({
        where: { id: currentUser.id },
        data: updateData,
        include: { profile: { include: { photos: true } } },
      });
    } catch {
      // A legacy unique column can still collide even when the identity table
      // accepted the value. The identity is the source of truth, so keep going
      // without the mirrored column.
      if (legacyColumn) delete updateData[legacyColumn];
      updatedUser = await prisma.user.update({
        where: { id: currentUser.id },
        data: updateData,
        include: { profile: { include: { photos: true } } },
      });
    }

    const lead = await refreshLead(updatedUser.id);

    await prisma.analyticsEvent
      .create({
        data: {
          userId: updatedUser.id,
          eventType: 'lead_verified',
          eventData: { method: kind, originCountry },
        },
      })
      .catch(() => {
        // Analytics must never break the funnel.
      });

    return success({
      user: {
        id: updatedUser.id,
        displayName: updatedUser.profile?.displayName || 'Visitor',
        phone: updatedUser.phone,
        whatsapp: updatedUser.whatsapp,
        telegram: updatedUser.telegram,
        isVerifiedLead: updatedUser.isVerifiedLead,
        leadStage: lead.stage,
        leadScore: lead.score,
        verifiedVia: updatedUser.verifiedVia,
        preferredChannel: updatedUser.preferredChannel,
      },
      message: 'Thanks! You now have unlimited chat, and we know where to reach you.',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
