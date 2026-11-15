import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { error, handleApiError, success } from '@/lib/api-helpers';
import { getStealthConfig, saveStealthConfig, type StealthConfig } from '@/lib/stealth-router';
import { MAINTENANCE_CONFIG } from '@/config/maintenance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cfg = await getStealthConfig();
    return NextResponse.json(
      {
        success: true,
        data: {
          enabled: Boolean(MAINTENANCE_CONFIG.enabled || cfg.maintenanceEnabled),
          blockBangladesh: Boolean(cfg.blockBangladesh),
          title: cfg.maintenanceTitle || MAINTENANCE_CONFIG.title,
          message: cfg.maintenanceMessage || MAINTENANCE_CONFIG.message,
          updatedAt: cfg.updatedAt,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => null);
    const hasEnabled = typeof body?.enabled === 'boolean';
    const hasBdBlock = typeof body?.blockBangladesh === 'boolean';

    if (!body || (!hasEnabled && !hasBdBlock)) {
      return error(
        'Invalid payload: "enabled" or "blockBangladesh" boolean required',
        400
      );
    }

    const patch: Partial<StealthConfig> = {};
    if (hasEnabled) patch.maintenanceEnabled = body.enabled;
    if (hasBdBlock) patch.blockBangladesh = body.blockBangladesh;
    if (typeof body.title === 'string' && body.title.trim()) {
      patch.maintenanceTitle = body.title.trim();
    }
    if (typeof body.message === 'string' && body.message.trim()) {
      patch.maintenanceMessage = body.message.trim();
    }

    const saved = await saveStealthConfig(patch);
    return success({
      enabled: saved.maintenanceEnabled,
      blockBangladesh: saved.blockBangladesh,
      title: saved.maintenanceTitle,
      message: saved.maintenanceMessage,
      updatedAt: saved.updatedAt,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
