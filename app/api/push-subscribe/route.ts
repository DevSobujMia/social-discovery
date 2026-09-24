import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getCurrentStaff } from '@/lib/auth';
import { savePushSubscription } from '@/lib/push-service';
import { success, error } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscription } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return error('Invalid push subscription', 400);
    }

    const user = await getCurrentUser(req);
    const staff = await getCurrentStaff(req);

    const saved = await savePushSubscription({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      userId: user?.id || null,
      staffId: staff?.id || null,
    });

    return success({ saved, userId: user?.id || null, staffId: staff?.id || null });
  } catch (err: any) {
    return error(err?.message || 'Failed to save push subscription', 500);
  }
}
