import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  GUEST_SESSION_DAYS,
  getCurrentUser,
  attachUserCookie,
  signToken,
} from '@/lib/auth';
import { error, handleApiError, success } from '@/lib/api-helpers';
import { mergeDeviceMeta } from '@/lib/device-meta';
import {
  findUserIdByIdentity,
  normalizeIdentityValue,
  refreshLead,
  touchIdentity,
} from '@/lib/leads';

/**
 * POST /api/auth/device-resume
 *
 * Second layer of "remember me" for visitors who never registered. The browser
 * keeps a device token in `localStorage`; if the session cookie is gone but the
 * token survives, this restores the lead and their whole chat history.
 *
 * The token is opaque and only ever issued by us, so possession of it is the
 * proof — exactly like the cookie it is replacing.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return error('A valid JSON body is required.', 400);
    }
    const { deviceToken, device } = body || {};

    if (!deviceToken || typeof deviceToken !== 'string') {
      return error('A device token is required.', 400);
    }

    const value = normalizeIdentityValue('device', deviceToken);
    if (!value) {
      return error('That device token is not valid.', 400);
    }

    // Already signed in on this browser — nothing to restore.
    const existingSession = await getCurrentUser();
    if (existingSession) {
      const merged = mergeDeviceMeta(existingSession.deviceMeta, device);
      if (merged) {
        await prisma.user
          .update({
            where: { id: existingSession.id },
            data: { deviceMeta: merged, lastActiveAt: new Date() },
          })
          .catch(() => {});
      }
      const lead = await refreshLead(existingSession.id);
      return success({
        resumed: false,
        user: {
          id: existingSession.id,
          displayName: existingSession.profile?.displayName || 'Visitor',
          isVerifiedLead: existingSession.isVerifiedLead,
          leadStage: lead.stage,
          leadScore: lead.score,
        },
      });
    }

    const userId = await findUserIdByIdentity('device', value);
    if (!userId) {
      return success({ resumed: false });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: { select: { displayName: true } } },
    });

    if (!user || user.status !== 'active') {
      return success({ resumed: false });
    }

    const token = signToken(
      { id: user.id, email: user.email || '', type: 'user' },
      GUEST_SESSION_DAYS
    );

    await touchIdentity('device', value);
    const merged = mergeDeviceMeta(user.deviceMeta, device);
    await prisma.user
      .update({
        where: { id: user.id },
        data: {
          lastActiveAt: new Date(),
          ...(merged ? { deviceMeta: merged } : {}),
        },
      })
      .catch(() => {
        // Non-critical bookkeeping.
      });

    // Tell the client whether there is anything waiting, so the UI can drop
    // them straight into the conversation with unread replies.
    const waiting = await prisma.conversationParticipant.findFirst({
      where: { userId: user.id, unreadCount: { gt: 0 } },
      orderBy: { unreadCount: 'desc' },
      select: { conversationId: true, unreadCount: true },
    });

    const lead = await refreshLead(user.id);

    return attachUserCookie(
      NextResponse.json({
        success: true,
        data: {
          resumed: true,
          user: {
            id: user.id,
            displayName: user.profile?.displayName || 'Visitor',
            age: user.age,
            isVerifiedLead: user.isVerifiedLead,
            leadStage: lead.stage,
            leadScore: lead.score,
            verifiedVia: user.verifiedVia,
          },
          unread: waiting
            ? { conversationId: waiting.conversationId, count: waiting.unreadCount }
            : null,
        },
      }),
      token,
      GUEST_SESSION_DAYS
    );
  } catch (err) {
    return handleApiError(err);
  }
}
