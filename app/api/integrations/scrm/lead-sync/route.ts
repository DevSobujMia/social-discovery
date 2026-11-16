import { NextRequest } from 'next/server';
import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { success, error, handleApiError } from '@/lib/api-helpers';
import { cleanPhoneDigits, getStealthConfig } from '@/lib/stealth-router';

export const dynamic = 'force-dynamic';

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

async function sendMetaCapiLead(params: {
  pixelId: string;
  accessToken: string;
  eventId: string;
  customerPhone: string;
  fbclid?: string;
  ip?: string;
  userAgent?: string;
  qualityTier: string;
  campaign?: string;
}): Promise<{ sent: boolean; status?: number }> {
  const userData: Record<string, unknown> = {};
  const digits = cleanPhoneDigits(params.customerPhone);
  if (digits.length >= 6) {
    userData.ph = [sha256Hex(digits)];
  }
  if (params.fbclid) {
    userData.fbc = `fb.1.${Date.now()}.${params.fbclid}`;
  }
  if (params.ip && params.ip !== 'unknown') {
    userData.client_ip_address = params.ip;
  }
  if (params.userAgent) {
    userData.client_user_agent = params.userAgent;
  }

  const eventName = params.qualityTier === 'vip' ? 'Lead' : 'Contact';
  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        action_source: 'system_generated',
        user_data: userData,
        custom_data: {
          lead_quality: params.qualityTier,
          campaign: params.campaign || 'direct',
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(params.pixelId)}/events?access_token=${encodeURIComponent(params.accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    return { sent: res.ok, status: res.status };
  } catch {
    return { sent: false };
  }
}

/**
 * POST /api/integrations/scrm/lead-sync
 * Real-time webhook for SCRM to sync captured WhatsApp phone numbers,
 * SCRM customer IDs, quality ratings, and anti-leak mismatch flags back to CityHost.
 */
export async function POST(req: NextRequest) {
  try {
    const config = await getStealthConfig();
    if (!config.scrmSyncSecret) {
      return error('SCRM sync secret is not configured in CityHost Admin yet.', 503);
    }

    const headerSecret =
      req.headers.get('x-scrm-secret') ||
      (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

    if (!headerSecret || headerSecret !== config.scrmSyncSecret) {
      return error('Unauthorized SCRM sync secret.', 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return error('Invalid JSON payload.', 400);
    }

    const rawCode = typeof body.leadCode === 'string' ? body.leadCode.replace(/^#/, '').trim() : '';
    const customerPhone = cleanPhoneDigits(
      typeof body.customerPhone === 'string' ? body.customerPhone : ''
    );
    const scrmCustomerId =
      typeof body.scrmCustomerId === 'string' ? body.scrmCustomerId.trim().slice(0, 120) : '';
    const customerName =
      typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 100) : '';
    const qualityTierRaw =
      typeof body.qualityTier === 'string' ? body.qualityTier.trim().toLowerCase() : '';
    const qualityTier =
      qualityTierRaw === 'vip' || qualityTierRaw === 'low' || qualityTierRaw === 'standard'
        ? qualityTierRaw
        : 'standard';
    const mismatchFlag = Boolean(body.mismatchFlag);
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

    if (!rawCode && !customerPhone) {
      return error('Either leadCode or customerPhone is required.', 400);
    }

    // Try matching existing wa_redirect event by leadCode
    let matchedEvent: { id: string; eventData: Prisma.JsonValue } | null = null;
    if (rawCode) {
      const recent = await prisma.analyticsEvent.findMany({
        where: { eventType: { in: ['wa_redirect', 'scrm_lead'] } },
        orderBy: { createdAt: 'desc' },
        take: 1500,
        select: { id: true, eventData: true },
      });
      matchedEvent =
        recent.find((ev) => {
          const d = ev.eventData as Record<string, unknown> | null;
          const code = typeof d?.leadCode === 'string' ? d.leadCode.replace(/^#/, '') : '';
          return code.toLowerCase() === rawCode.toLowerCase();
        }) || null;
    }

    const nowIso = new Date().toISOString();
    let capiResult: { sent: boolean; status?: number } | null = null;

    if (matchedEvent) {
      const prev =
        matchedEvent.eventData && typeof matchedEvent.eventData === 'object'
          ? (matchedEvent.eventData as Record<string, unknown>)
          : {};

      if (
        config.metaPixelId &&
        config.metaCapiToken &&
        (qualityTier === 'vip' || qualityTier === 'standard') &&
        !prev.capiSentAt
      ) {
        const dev = prev.device as Record<string, unknown> | undefined;
        capiResult = await sendMetaCapiLead({
          pixelId: config.metaPixelId,
          accessToken: config.metaCapiToken,
          eventId: rawCode || matchedEvent.id,
          customerPhone,
          fbclid: typeof prev.fbclid === 'string' ? prev.fbclid : undefined,
          ip: typeof prev.ip === 'string' ? prev.ip : undefined,
          userAgent: typeof dev?.rawUa === 'string' ? dev.rawUa : undefined,
          qualityTier,
          campaign: typeof prev.campaign === 'string' ? prev.campaign : undefined,
        });
      }

      const nextData = {
        ...prev,
        ...(customerPhone ? { customerPhone } : {}),
        ...(customerName ? { customerName } : {}),
        ...(scrmCustomerId ? { scrmCustomerId } : {}),
        ...(qualityTierRaw ? { qualityTier } : {}),
        ...(mismatchFlag ? { mismatchFlag: true } : {}),
        ...(notes ? { notes } : {}),
        scrmSyncedAt: nowIso,
        ...(capiResult?.sent ? { capiSentAt: nowIso } : {}),
      };

      await prisma.analyticsEvent.update({
        where: { id: matchedEvent.id },
        data: { eventData: nextData as unknown as Prisma.InputJsonValue },
      });

      return success({
        matched: true,
        eventId: matchedEvent.id,
        leadCode: rawCode,
        capiSent: Boolean(capiResult?.sent),
      });
    }

    // Create a permanent SCRM-originated lead record (e.g. agent added lead from another channel)
    const created = await prisma.analyticsEvent.create({
      data: {
        eventType: 'scrm_lead',
        utmCampaign: typeof body.source === 'string' ? body.source.slice(0, 100) : 'scrm',
        eventData: {
          leadCode: rawCode || `SCRM-${Date.now().toString(36).toUpperCase()}`,
          customerName: customerName || 'SCRM Contact',
          customerPhone,
          scrmCustomerId,
          agentId: typeof body.agentId === 'string' ? body.agentId : 'scrm',
          agentName: typeof body.agentName === 'string' ? body.agentName : 'SCRM Agent',
          agentPhone: cleanPhoneDigits(typeof body.agentPhone === 'string' ? body.agentPhone : ''),
          campaign: typeof body.source === 'string' ? body.source : 'scrm_direct',
          source: typeof body.source === 'string' ? body.source : 'scrm_manual',
          qualityTier,
          qualityScore: qualityTier === 'vip' ? 90 : qualityTier === 'low' ? 20 : 60,
          mode: 'scrm_sync',
          city: typeof body.city === 'string' ? body.city : 'Unknown',
          country: typeof body.country === 'string' ? body.country : 'Unknown',
          mismatchFlag,
          notes,
          scrmSyncedAt: nowIso,
          timestamp: nowIso,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return success({
      matched: false,
      created: true,
      eventId: created.id,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
