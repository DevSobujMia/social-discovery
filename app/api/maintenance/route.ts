import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { error, handleApiError, success } from '@/lib/api-helpers';
import { getStealthConfig, saveStealthConfig } from '@/lib/stealth-router';
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
    if (!body || typeof body.enabled !== 'boolean') {
      return error('Invalid maintenance toggle payload: "enabled" boolean required', 400);
    }

    const patch: {
      maintenanceEnabled: boolean;
      maintenanceTitle?: string;
      maintenanceMessage?: string;
    } = {
      maintenanceEnabled: body.enabled,
    };

    if (typeof body.title === 'string' && body.title.trim()) {
      patch.maintenanceTitle = body.title.trim();
    }
    if (typeof body.message === 'string' && body.message.trim()) {
      patch.maintenanceMessage = body.message.trim();
    }

    const saved = await saveStealthConfig(patch);
    return success({
      enabled: saved.maintenanceEnabled,
      title: saved.maintenanceTitle,
      message: saved.maintenanceMessage,
      updatedAt: saved.updatedAt,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
