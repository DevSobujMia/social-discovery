import webpush from 'web-push';
import { prisma } from './db';

// VAPID keys for City Host Web Push Notifications
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BBOjm0rqo1zAZmMX43AK6HW5-Moua8Khbbs-XLn_8OaDv0JWmteLFqDvcWbD42Ihbak6mEGRyW2Av0MMRIPHRvg';

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  'J7ip6pEzH-R2wkqbrAvliXyjL-EGPud2RLcOwLRQ6CM';

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:support@cityhost.live';

// Configure Web Push once
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.warn('[Push] Error configuring VAPID:', err);
}

let tableEnsured = false;

export async function ensurePushTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_id TEXT,
        staff_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    tableEnsured = true;
  } catch (err) {
    console.warn('[Push] Could not ensure push_subscriptions table:', err);
  }
}

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id?: string | null;
  staff_id?: string | null;
}

export async function savePushSubscription(params: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId?: string | null;
  staffId?: string | null;
}): Promise<boolean> {
  await ensurePushTable();
  const id = 'sub_' + Math.random().toString(36).substring(2, 11);
  try {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id, staff_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_id = COALESCE(EXCLUDED.user_id, push_subscriptions.user_id),
        staff_id = COALESCE(EXCLUDED.staff_id, push_subscriptions.staff_id),
        updated_at = NOW();
      `,
      id,
      params.endpoint,
      params.keys.p256dh,
      params.keys.auth,
      params.userId || null,
      params.staffId || null
    );
    return true;
  } catch (err) {
    console.error('[Push] Failed to save push subscription:', err);
    return false;
  }
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await ensurePushTable();
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM push_subscriptions WHERE endpoint = $1`,
      endpoint
    );
  } catch {}
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  conversationId?: string;
  token?: string;
}

export async function sendPushToSubscriptions(
  subs: StoredSubscription[],
  payload: PushPayload
): Promise<number> {
  let sentCount = 0;
  const jsonPayload = JSON.stringify({
    title: payload.title || 'City Host',
    body: payload.body || 'New message waiting',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    url: payload.url || '/?tab=messenger',
    conversationId: payload.conversationId || null,
    token: payload.token || null,
  });

  const promises = subs.map(async (sub) => {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSub, jsonPayload, {
        TTL: 86400,
        urgency: 'high',
      });
      sentCount++;
    } catch (err: any) {
      // If subscription expired or was unsubscribed (404/410), clean it up
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await removePushSubscription(sub.endpoint);
      } else {
        console.warn('[Push] Error sending to endpoint:', err?.message || err);
      }
    }
  });

  await Promise.allSettled(promises);
  return sentCount;
}

/**
 * Send real Web Push to a user when a message arrives (wakes phone even when app is killed).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<number> {
  await ensurePushTable();
  try {
    const subs = (await prisma.$queryRawUnsafe(
      `SELECT id, endpoint, p256dh, auth, user_id, staff_id FROM push_subscriptions WHERE user_id = $1`,
      userId
    )) as StoredSubscription[];

    if (!subs || !subs.length) return 0;
    return await sendPushToSubscriptions(subs, payload);
  } catch (err) {
    console.error('[Push] Error sending push to user:', err);
    return 0;
  }
}

/**
 * Send real Web Push to staff/admin when a customer messages (wakes staff phone even when app is killed).
 */
export async function sendPushToStaff(payload: PushPayload): Promise<number> {
  await ensurePushTable();
  try {
    const subs = (await prisma.$queryRawUnsafe(
      `SELECT id, endpoint, p256dh, auth, user_id, staff_id FROM push_subscriptions WHERE staff_id IS NOT NULL`
    )) as StoredSubscription[];

    if (!subs || !subs.length) return 0;
    return await sendPushToSubscriptions(subs, payload);
  } catch (err) {
    console.error('[Push] Error sending push to staff:', err);
    return 0;
  }
}
