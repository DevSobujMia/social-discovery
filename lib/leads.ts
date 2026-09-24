/**
 * Lead engine.
 *
 * A lead is one `User` row with many `LeadIdentity` rows, so the same person is
 * recognised whichever channel they come back through — browser cookie, device
 * token, phone, WhatsApp, Telegram, Facebook, or a web-push subscription.
 *
 * This module owns three things:
 *   - normalising and de-duplicating identities
 *   - deciding what to do when an identity already belongs to somebody else
 *   - scoring how valuable a lead is, so the admin list can be sorted by it
 */

import { prisma } from './db';
import {
  inferCountryFromPhone,
  inferLanguage,
  maskContact,
  normalizePhone,
  recommendedNotifyChannel,
} from './market';

export type IdentityKind =
  | 'device'
  | 'phone'
  | 'whatsapp'
  | 'telegram'
  | 'facebook'
  | 'messenger_psid'
  | 'webpush'
  | 'email';

export const CONTACT_KINDS: IdentityKind[] = [
  'phone',
  'whatsapp',
  'telegram',
  'facebook',
  'messenger_psid',
  'email',
];

const ALL_KINDS: IdentityKind[] = [...CONTACT_KINDS, 'device', 'webpush'];

export function isIdentityKind(value: unknown): value is IdentityKind {
  return typeof value === 'string' && ALL_KINDS.includes(value as IdentityKind);
}

// ============================================================
// NORMALISATION
// ============================================================

/**
 * Canonical form of an identity value, so `050 123 4567`, `+971501234567` and
 * `00971501234567` all resolve to the same row.
 *
 * Returns `null` when the value is not usable for that channel.
 */
export function normalizeIdentityValue(
  kind: IdentityKind,
  raw: string,
  defaultCountry?: string | null
): string | null {
  const value = (raw || '').trim();
  if (!value) return null;

  switch (kind) {
    case 'phone':
    case 'whatsapp':
      return normalizePhone(value, defaultCountry);

    case 'telegram': {
      // Telegram accepts either a phone number or an @username.
      if (/^[+0-9\s()-]+$/.test(value)) {
        const phone = normalizePhone(value, defaultCountry);
        if (phone) return phone;
      }
      const handle = value.replace(/^@+/, '').toLowerCase();
      return /^[a-z0-9_]{3,32}$/.test(handle) ? `@${handle}` : null;
    }

    case 'email': {
      const email = value.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
    }

    case 'device':
    case 'webpush':
    case 'facebook':
    case 'messenger_psid':
      // Opaque tokens and provider IDs are used verbatim.
      return value.length >= 8 ? value : null;

    default:
      return null;
  }
}

// ============================================================
// LOOKUP & ATTACHMENT
// ============================================================

export async function findUserIdByIdentity(
  kind: IdentityKind,
  normalizedValue: string
): Promise<string | null> {
  const row = await prisma.leadIdentity.findUnique({
    where: { kind_value: { kind, value: normalizedValue } },
    select: { userId: true },
  });
  return row?.userId || null;
}

export type AttachResult =
  | { status: 'attached'; identityId: string }
  | { status: 'already-owned'; identityId: string }
  /** The identity belongs to a different, more established lead. */
  | { status: 'conflict'; existingUserId: string }
  | { status: 'invalid' };

/**
 * Attach an identity to a lead.
 *
 * When the identity already exists on another lead we do not blindly steal it.
 * If the previous owner never verified anything and never sent a message it is
 * an abandoned shell, so the identity is moved across. Otherwise the caller is
 * told which lead owns it, and can log the visitor into that account instead of
 * creating a duplicate.
 */
export async function attachIdentity(params: {
  userId: string;
  kind: IdentityKind;
  value: string;
  verified?: boolean;
  isPrimary?: boolean;
  defaultCountry?: string | null;
}): Promise<AttachResult> {
  const { userId, kind, verified = false, isPrimary = false } = params;

  const value = normalizeIdentityValue(kind, params.value, params.defaultCountry);
  if (!value) return { status: 'invalid' };

  const existing = await prisma.leadIdentity.findUnique({
    where: { kind_value: { kind, value } },
  });

  if (existing) {
    if (existing.userId === userId) {
      const updated = await prisma.leadIdentity.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          verifiedAt: verified ? existing.verifiedAt ?? new Date() : existing.verifiedAt,
          isPrimary: isPrimary || existing.isPrimary,
        },
      });
      return { status: 'already-owned', identityId: updated.id };
    }

    const previousOwner = await prisma.user.findUnique({
      where: { id: existing.userId },
      select: {
        id: true,
        isVerifiedLead: true,
        _count: { select: { sentMessages: true } },
      },
    });

    const abandoned =
      !previousOwner ||
      (!previousOwner.isVerifiedLead && previousOwner._count.sentMessages === 0);

    if (!abandoned) {
      return { status: 'conflict', existingUserId: existing.userId };
    }

    const moved = await prisma.leadIdentity.update({
      where: { id: existing.id },
      data: {
        userId,
        lastSeenAt: new Date(),
        verifiedAt: verified ? new Date() : null,
        isPrimary,
      },
    });
    return { status: 'attached', identityId: moved.id };
  }

  const created = await prisma.leadIdentity.create({
    data: {
      userId,
      kind,
      value,
      label: maskContact(kind, value),
      isPrimary,
      verifiedAt: verified ? new Date() : null,
      lastSeenAt: new Date(),
    },
  });
  return { status: 'attached', identityId: created.id };
}

/** Refresh `lastSeenAt` so we know which channel the lead actually uses. */
export async function touchIdentity(
  kind: IdentityKind,
  normalizedValue: string
): Promise<void> {
  await prisma.leadIdentity
    .update({
      where: { kind_value: { kind, value: normalizedValue } },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {
      // A missing identity is not an error for a best-effort touch.
    });
}

// ============================================================
// SCORING
// ============================================================

export interface LeadScoreBreakdown {
  score: number;
  stage: 'incomplete' | 'engaged' | 'complete';
  reasons: string[];
}

/**
 * Score a lead from 0 to 100 so the operator can work the best ones first.
 *
 * The weights follow how much each signal actually predicts a reply: a
 * verified contact channel is worth more than everything else combined,
 * because without it the lead cannot be reached at all once they close the tab.
 */
export async function computeLeadScore(
  userId: string
): Promise<LeadScoreBreakdown> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      age: true,
      isVerifiedLead: true,
      geoCountry: true,
      geoCity: true,
      createdAt: true,
      lastActiveAt: true,
      profile: { select: { displayName: true, gender: true } },
      identities: { select: { kind: true, verifiedAt: true, createdAt: true } },
    },
  });

  if (!user) return { score: 0, stage: 'incomplete', reasons: [] };

  const reasons: string[] = [];
  let score = 0;

  const name = user.profile?.displayName?.trim();
  if (name && name.toLowerCase() !== 'visitor') {
    score += 8;
    reasons.push('Gave a name');
  }
  if (user.age) {
    score += 6;
    reasons.push('Age known');
  }
  if (user.profile?.gender) {
    score += 4;
    reasons.push('Gender known');
  }
  if (user.geoCountry) {
    score += 5;
    reasons.push('Country resolved');
  }
  if (user.geoCity) {
    score += 5;
    reasons.push('City resolved');
  }

  const [sentCount, receivedCount] = await Promise.all([
    prisma.message.count({ where: { senderUserId: userId } }),
    prisma.message.count({
      where: {
        conversation: { customerUserId: userId },
        OR: [{ senderStaffId: { not: null } }, { sentOnBehalfOf: { not: null } }],
      },
    }),
  ]);

  if (sentCount > 0) {
    const messagePoints = Math.min(sentCount, 5) * 4;
    score += messagePoints;
    reasons.push(`${sentCount} message${sentCount === 1 ? '' : 's'} sent`);
  }
  if (receivedCount > 0) {
    score += 6;
    reasons.push('Conversation is two-way');
  }

  const verifiedContact = user.identities.find(
    (i) => i.verifiedAt && CONTACT_KINDS.includes(i.kind as IdentityKind)
  );
  if (verifiedContact || user.isVerifiedLead) {
    score += 30;
    reasons.push('Contact channel verified');
  }
  if (user.identities.some((i) => i.kind === 'webpush')) {
    score += 10;
    reasons.push('Push notifications enabled');
  }

  const deviceIdentity = user.identities.find((i) => i.kind === 'device');
  if (deviceIdentity && user.lastActiveAt) {
    const createdTime = new Date(deviceIdentity.createdAt).getTime();
    const lastActiveTime = new Date(user.lastActiveAt).getTime();
    if (lastActiveTime - createdTime > 24 * 60 * 60 * 1000) {
      score += 6;
      reasons.push('Returned on a later day');
    }
  }

  const stage: LeadScoreBreakdown['stage'] =
    verifiedContact || user.isVerifiedLead
      ? 'complete'
      : sentCount > 0
        ? 'engaged'
        : 'incomplete';

  return { score: Math.min(100, score), stage, reasons };
}

/** Recompute and persist the score. Safe to call on every funnel event. */
export async function refreshLead(userId: string): Promise<LeadScoreBreakdown> {
  const breakdown = await computeLeadScore(userId);

  const allIdentities = await prisma.leadIdentity.findMany({
    where: { userId },
    select: { kind: true, value: true, verifiedAt: true },
  });

  const verifiedIdentities = allIdentities.filter((i) => i.verifiedAt !== null);

  const contactKinds = verifiedIdentities
    .map((i) => i.kind)
    .filter((k): k is IdentityKind => CONTACT_KINDS.includes(k as IdentityKind));

  const phoneish =
    verifiedIdentities.find((i) => i.kind === 'whatsapp' || i.kind === 'phone') ||
    allIdentities.find((i) => i.kind === 'whatsapp' || i.kind === 'phone');
  const phoneCountry = inferCountryFromPhone(phoneish?.value);

  const available = allIdentities.map((i) => i.kind);

  await prisma.user.update({
    where: { id: userId },
    data: {
      leadScore: breakdown.score,
      leadStage: breakdown.stage,
      preferredChannel: recommendedNotifyChannel(available),
      ...(phoneCountry ? { originCountry: phoneCountry } : {}),
      ...(phoneCountry ? { language: inferLanguage(phoneCountry) } : {}),
      ...(contactKinds.length > 0 ? { isVerifiedLead: true } : {}),
    },
  });

  return breakdown;
}

// ============================================================
// PRESENTATION
// ============================================================

export interface IdentitySummary {
  kind: string;
  label: string;
  value: string;
  verified: boolean;
  /** Ready-to-click deep link for the admin panel, when one exists. */
  href: string | null;
}

/** Build the admin-facing view of every way this lead can be reached. */
export function summarizeIdentities(
  identities: Array<{
    kind: string;
    value: string;
    label: string | null;
    verifiedAt: Date | null;
  }>
): IdentitySummary[] {
  return identities
    .filter((i) => CONTACT_KINDS.includes(i.kind as IdentityKind))
    .map((i) => {
      const digits = i.value.replace(/\D/g, '');
      let href: string | null = null;

      if (i.kind === 'whatsapp') href = `https://wa.me/${digits}`;
      else if (i.kind === 'phone') href = `tel:${i.value}`;
      else if (i.kind === 'telegram') {
        href = i.value.startsWith('@')
          ? `https://t.me/${i.value.slice(1)}`
          : `https://t.me/+${digits}`;
      } else if (i.kind === 'email') href = `mailto:${i.value}`;

      return {
        kind: i.kind,
        label: i.label || maskContact(i.kind, i.value),
        value: i.value,
        verified: Boolean(i.verifiedAt),
        href,
      };
    });
}
