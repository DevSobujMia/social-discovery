import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { success, error, handleApiError } from '@/lib/api-helpers';
import { resolveVisitorGeo } from '@/lib/geo';
import {
  cleanPhoneDigits,
  generateLeadCode,
  getStealthConfig,
  normalizeCustomerPhone,
  renderStealthTemplate,
  scoreQualifiedLead,
  selectTargetAgent,
  type FunnelMode,
} from '@/lib/stealth-router';

export const dynamic = 'force-dynamic';

/**
 * Public landing bootstrap endpoint for /chat and /whatsapp.
 * Resolves visitor geo & public concierge config without exposing agent phone numbers.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const timezone = sp.get('tz');
    const personaParam = (sp.get('persona') || '').trim().slice(0, 60);
    const cityParam = (sp.get('city') || sp.get('dest') || '').trim().slice(0, 60);
    const countryParam = (sp.get('country') || '').trim().slice(0, 60);
    const slug = (sp.get('slug') || '').trim().slice(0, 64);
    const campaign = sp.get('c') || sp.get('utm_campaign') || (slug ? `wa-${slug}` : '');
    const requestedMode = sp.get('mode') as FunnelMode | null;

    const [config, geo] = await Promise.all([
      getStealthConfig(),
      resolveVisitorGeo(req.headers, {
        country: countryParam || null,
        city: cityParam || null,
        timezone,
      }),
    ]);

    const configuredCity =
      config.personaCity && config.personaCity.trim().toLowerCase() !== 'your city'
        ? config.personaCity.trim()
        : '';

    let persona = {
      name: personaParam || config.personaName,
      city: cityParam || configuredCity || 'your city',
      country: countryParam || (geo.country && geo.country !== 'Unknown' && geo.country !== 'International' ? geo.country : ''),
      badge: config.personaBadge,
    };

    if (personaParam) {
      try {
        const profile = await prisma.profile.findFirst({
          where: {
            isVisible: true,
            OR: [{ userId: personaParam }, { displayName: personaParam }],
          },
          select: {
            displayName: true,
            city: true,
            country: true,
          },
        });
        if (profile) {
          persona = {
            name: profile.displayName || persona.name,
            city: cityParam || profile.city || persona.city,
            country: countryParam || profile.country || persona.country,
            badge: config.personaBadge,
          };
        }
      } catch {
        // Fallback silently to provided/default concierge persona
      }
    }

    const activeAgentsCount = config.agents.filter((a) => a.status === 'active').length;
    const effectiveMode: FunnelMode =
      requestedMode === 'interactive_qualifier' ||
      requestedMode === 'vip_card' ||
      requestedMode === 'instant_redirect'
        ? requestedMode
        : config.defaultMode;

    const renderedGreeting = renderStealthTemplate(config.greetingTemplate, {
      brand: config.brandName,
      city: persona.city || 'your area',
      country: persona.country || '',
      persona: persona.name,
    });

    return success({
      mode: effectiveMode,
      requirePhoneCapture: config.requirePhoneCapture,
      brandName: config.brandName,
      persona,
      greeting: renderedGreeting,
      activeAgentsCount,
      campaign,
      slug,
      geo: {
        city: geo.city,
        country: geo.country,
        countryCode: geo.countryCode,
        flag: geo.flag,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Qualifies visitor inputs, generates an immutable #CH-XXXX anti-cheat verification code,
 * selects the optimal active agent number, logs the redirect event, and returns a clean wa.me URL.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};

    const slug = typeof body.slug === 'string' ? body.slug.trim().slice(0, 64) : '';
    const isVipSlug = slug.toLowerCase() === 'vip';
    const rawCampaign = typeof body.campaign === 'string' ? body.campaign.trim().slice(0, 80) : '';
    const campaign = rawCampaign || (slug ? `wa-${slug}` : '');
    const rawAgentTag =
      typeof body.agentTag === 'string' ? body.agentTag.trim().slice(0, 64) : '';
    const requestedAgentTag = rawAgentTag || (slug ? slug : '');
    const requestedMode =
      typeof body.mode === 'string' ? (body.mode as FunnelMode) : undefined;
    const residencyTier = isVipSlug
      ? 'resident'
      : typeof body.residencyTier === 'string'
        ? body.residencyTier.trim()
        : 'resident';
    const occupationTier = isVipSlug
      ? 'business'
      : typeof body.occupationTier === 'string'
        ? body.occupationTier.trim()
        : 'professional';
    const customerName =
      typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 60) : '';
    const dialCode = typeof body.dialCode === 'string' ? body.dialCode : '';
    const rawPhone = typeof body.phone === 'string' ? body.phone : '';
    const anonymousId =
      typeof body.anonymousId === 'string' ? body.anonymousId.trim().slice(0, 100) : null;
    const customText =
      typeof body.customText === 'string' ? body.customText.trim().slice(0, 240) : '';
    const cityOverride =
      typeof body.city === 'string' ? body.city.trim().slice(0, 60) : '';
    const countryOverride =
      typeof body.country === 'string' ? body.country.trim().slice(0, 60) : '';
    const personaOverride =
      typeof body.persona === 'string' ? body.persona.trim().slice(0, 60) : '';
    const timezone = typeof body.timezone === 'string' ? body.timezone : null;
    const skipPhone = body.skipPhone === true;
    const device =
      body.device && typeof body.device === 'object'
        ? (body.device as Prisma.InputJsonValue)
        : undefined;

    const [config, geo] = await Promise.all([
      getStealthConfig(),
      resolveVisitorGeo(req.headers, {
        country: countryOverride || null,
        city: cityOverride || null,
        timezone,
      }),
    ]);

    const effectiveMode: FunnelMode =
      requestedMode === 'interactive_qualifier' ||
      requestedMode === 'vip_card' ||
      requestedMode === 'instant_redirect'
        ? requestedMode
        : config.defaultMode;

    const normalizedPhone = normalizeCustomerPhone(dialCode, rawPhone);

    if (
      effectiveMode !== 'instant_redirect' &&
      config.requirePhoneCapture &&
      !skipPhone &&
      normalizedPhone.length < 6
    ) {
      return error('Please enter a valid WhatsApp number to receive your verified pass.', 400);
    }

    const { qualityTier, qualityScore } = scoreQualifiedLead({
      residencyTier,
      occupationTier,
      hasPhone: normalizedPhone.length >= 6,
      countryCode: geo.countryCode,
    });

    const targetAgent = await selectTargetAgent(config, {
      requestedAgentTag,
      qualityTier,
    });

    const leadCode = generateLeadCode();
    const configuredPersonaCity =
      config.personaCity && config.personaCity.trim().toLowerCase() !== 'your city'
        ? config.personaCity.trim()
        : '';
    const displayCity =
      cityOverride ||
      configuredPersonaCity ||
      (geo.city && geo.city !== 'Unknown' && geo.city !== 'your city' ? geo.city : 'your city');

    const templateVars: Record<string, string> = {
      code: leadCode,
      name: customerName || 'Guest',
      city: displayCity,
      country:
        countryOverride ||
        (geo.country && geo.country !== 'Unknown' && geo.country !== 'International' ? geo.country : ''),
      tier: qualityTier.toUpperCase(),
      campaign: campaign || 'concierge',
      phone: normalizedPhone ? `+${normalizedPhone}` : 'direct',
      agent: targetAgent.name,
      persona: personaOverride || config.personaName,
      brand: config.brandName,
    };

    let messageText = renderStealthTemplate(config.whatsappMessageTemplate, templateVars);
    if (customText) {
      messageText = `${messageText}\nNote: ${customText}`;
    }

    const cleanAgentPhone = cleanPhoneDigits(targetAgent.phone);
    const whatsappUrl = `https://wa.me/${cleanAgentPhone}?text=${encodeURIComponent(
      messageText
    )}`;

    // Link or update an existing User CRM record if matched by phone or anonymousId
    let matchedUserId: string | undefined;
    try {
      const orClauses: Array<Record<string, unknown>> = [];
      if (normalizedPhone.length >= 6) {
        orClauses.push({ whatsapp: normalizedPhone });
        orClauses.push({ phone: normalizedPhone });
        orClauses.push({ whatsapp: `+${normalizedPhone}` });
      }
      if (anonymousId) {
        orClauses.push({ anonymousId });
      }

      if (orClauses.length > 0) {
        const existingUser = await prisma.user.findFirst({
          where: { OR: orClauses },
          select: { id: true },
        });
        if (existingUser) {
          matchedUserId = existingUser.id;
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              whatsapp: normalizedPhone ? `+${normalizedPhone}` : undefined,
              phone: normalizedPhone ? `+${normalizedPhone}` : undefined,
              isVerifiedLead: true,
              verifiedVia: 'STEALTH_ROUTER',
              leadStage: 'WHATSAPP_ROUTED',
              leadScore: qualityScore,
              geoCountry: geo.country !== 'Unknown' ? geo.country : undefined,
              geoCity: geo.city !== 'Unknown' ? geo.city : undefined,
              deviceMeta: device,
              lastActiveAt: new Date(),
            },
          });
        }
      }
    } catch (crmErr) {
      console.warn('[stealth-route] Non-fatal CRM link update error:', crmErr);
    }

    // Write immutable Anti-Cheat Ledger row
    await prisma.analyticsEvent.create({
      data: {
        userId: matchedUserId,
        anonymousId: anonymousId || undefined,
        eventType: 'wa_redirect',
        utmCampaign: campaign || null,
        eventData: {
          leadCode,
          customerName: customerName || 'Guest',
          customerPhone: normalizedPhone ? `+${normalizedPhone}` : '',
          agentId: targetAgent.id,
          agentName: targetAgent.name,
          agentPhone: cleanAgentPhone,
          campaign: campaign || 'direct',
          qualityTier,
          qualityScore,
          residencyTier,
          occupationTier,
          mode: effectiveMode,
          city: geo.city,
          country: geo.country,
          countryCode: geo.countryCode,
          flag: geo.flag,
          ip: geo.ip,
          device: device ?? null,
          referrerStripped: true,
          timestamp: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return success(
      {
        leadCode,
        whatsappUrl,
        qualityTier,
        qualityScore,
        agentName: targetAgent.name,
        agentRole: targetAgent.roleLabel,
        city: displayCity,
        flag: geo.flag,
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
