import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, signToken, setAuthCookie, attachUserCookie } from '@/lib/auth';
import { success, error, handleApiError, checkRateLimit } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return error('Public signup is closed. Start a chat with your name and number.', 404);
  }
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`signup:${ip}`, 10, 60 * 60 * 1000)) {
      return error('Too many signup attempts. Try again later.', 429);
    }

    const body = await req.json();
    const { email, password, displayName, gender, country, utm } = body;

    if (!email || !password) {
      return error('Email and password are required');
    }

    if (password.length < 6) {
      return error('Password must be at least 6 characters');
    }

    const emailLower = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existing) {
      return error('An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: emailLower,
        passwordHash,
        signupStage: 'active',
        profile: {
          create: {
            displayName: displayName || emailLower.split('@')[0],
            gender: gender || undefined,
            country: country || undefined,
          },
        },
      },
      include: { profile: true },
    });

    const token = signToken({
      id: user.id,
      email: user.email!,
      type: 'user',
    });

    await setAuthCookie(token);

    // UTM Attribution & Agent Auto-Routing
    if (utm && (utm.utmSource || utm.utm_source || utm.utmCampaign || utm.utm_campaign)) {
      try {
        const utmCampaignKey = utm.utmCampaign || utm.utm_campaign;
        const utmSourceKey = utm.utmSource || utm.utm_source;
        const utmMediumKey = utm.utmMedium || utm.utm_medium;
        const utmContentKey = utm.utmContent || utm.utm_content;
        const utmTermKey = utm.utmTerm || utm.utm_term;

        let campaignId: string | undefined;
        if (utmCampaignKey) {
          const camp = await prisma.campaign.findUnique({
            where: { utmCampaign: utmCampaignKey },
          });
          campaignId = camp?.id;
        }

        await prisma.utmAttribution.create({
          data: {
            userId: user.id,
            campaignId,
            utmSource: utmSourceKey,
            utmMedium: utmMediumKey,
            utmCampaign: utmCampaignKey,
            utmContent: utmContentKey,
            utmTerm: utmTermKey,
            landingPage: utm.landingPage || utm.landing_page,
            referrerUrl: utm.referrerUrl || utm.referrer,
            ipAddress: ip,
            userAgent: req.headers.get('user-agent') || '',
          },
        });

        // Auto-assign to agent if campaign has active route
        if (utmCampaignKey) {
          const route = await prisma.campaignAgentRoute.findFirst({
            where: {
              campaign: { utmCampaign: utmCampaignKey },
              isActive: true,
            },
          });

          if (route) {
            await prisma.agentAssignment.create({
              data: {
                userId: user.id,
                agentId: route.agentId,
                assignedBy: route.agentId,
                status: 'active',
                notes: `Auto-assigned from campaign: ${utmCampaignKey}`,
              },
            });

            await prisma.assignmentHistory.create({
              data: {
                userId: user.id,
                newAgentId: route.agentId,
                action: 'assigned',
                performedBy: route.agentId,
                reason: `Auto-assigned from campaign: ${utmCampaignKey}`,
              },
            });
          }
        }
      } catch (utmErr) {
        console.error('Non-critical UTM error during signup:', utmErr);
      }
    }

    // Track signup event
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: user.id,
          eventType: 'signup_complete',
          eventData: { method: 'email' },
          utmCampaign: utm?.utmCampaign || utm?.utm_campaign || undefined,
        },
      });
    } catch {
      // Non-critical
    }

    const response = NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        profile: user.profile,
      },
    }, { status: 201 });

    return attachUserCookie(response, token);
  } catch (err) {
    return handleApiError(err);
  }
}
