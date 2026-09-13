import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

// GET /api/admin/campaigns
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const campaigns = await prisma.campaign.findMany({
      include: {
        routes: {
          where: { isActive: true },
          include: { agent: { select: { displayName: true, email: true } } },
        },
        _count: { select: { attributions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return success(campaigns);
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/admin/campaigns — create campaign with agent routing
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { name, platform, utmSource, utmMedium, utmCampaign, agentId } = body;

    if (!name || !utmCampaign) return error('Name and UTM campaign are required');

    const existing = await prisma.campaign.findUnique({
      where: { utmCampaign },
    });
    if (existing) return error('Campaign with this UTM already exists');

    const campaign = await prisma.campaign.create({
      data: {
        name,
        platform: platform || 'facebook',
        utmSource: utmSource || undefined,
        utmMedium: utmMedium || undefined,
        utmCampaign,
        createdById: admin.id,
        ...(agentId ? {
          routes: {
            create: {
              agentId,
              createdById: admin.id,
            },
          },
        } : {}),
      },
      include: {
        routes: {
          include: { agent: { select: { displayName: true } } },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        staffId: admin.id,
        action: 'campaign.create',
        targetType: 'campaign',
        targetId: campaign.id,
        details: { name, utmCampaign, agentId },
      },
    });

    return success(campaign, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH /api/admin/campaigns — update campaign
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { id, status, agentId } = body;

    if (!id) return error('Campaign ID is required');

    if (status) {
      await prisma.campaign.update({
        where: { id },
        data: { status },
      });
    }

    // Update agent routing
    if (agentId !== undefined) {
      // Deactivate existing routes
      await prisma.campaignAgentRoute.updateMany({
        where: { campaignId: id },
        data: { isActive: false },
      });

      if (agentId) {
        await prisma.campaignAgentRoute.create({
          data: {
            campaignId: id,
            agentId,
            createdById: admin.id,
          },
        });
      }
    }

    const updated = await prisma.campaign.findUnique({
      where: { id },
      include: {
        routes: {
          where: { isActive: true },
          include: { agent: { select: { displayName: true } } },
        },
      },
    });

    return success(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
