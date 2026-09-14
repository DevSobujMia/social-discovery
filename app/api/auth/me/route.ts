import { getCurrentUser, getCurrentStaff, getAuthToken, removeAuthCookie } from '@/lib/auth';
import { success, handleApiError } from '@/lib/api-helpers';

/**
 * Returns BOTH sessions when present.
 *
 * Admin and visitor cookies are separate on purpose so the same browser can
 * hold a guest lead and a staff login. Older code returned the first match
 * only (user before staff), which made /admin look "logged out" on every
 * refresh whenever the public site had created a guest cookie.
 */
export async function GET() {
  try {
    const token = await getAuthToken();
    const user = await getCurrentUser();

    // After a DB wipe/reseed the JWT can still be in the browser while the
    // user row is gone. Drop the orphan cookie so the client stops 401-polling.
    if (token && !user) {
      await removeAuthCookie();
    }

    const staff = await getCurrentStaff();

    const userPayload = user
      ? {
          id: user.id,
          email: user.email,
          phone: user.phone,
          whatsapp: user.whatsapp,
          telegram: user.telegram,
          isVerifiedLead: user.isVerifiedLead,
          leadStage: user.leadStage,
          verifiedVia: user.verifiedVia,
          hideContactNumber: Boolean(user.hideContactNumber),
          age: user.age,
          profile: user.profile,
        }
      : null;

    const staffPayload = staff
      ? {
          id: staff.id,
          email: staff.email,
          role: staff.role,
          displayName: staff.displayName,
        }
      : null;

    return success({
      user: userPayload,
      staff: staffPayload,
      // Convenience fields kept for older callers
      type: staffPayload ? 'staff' : userPayload ? 'user' : null,
      id: staffPayload?.id || userPayload?.id || null,
      email: staffPayload?.email || userPayload?.email || null,
      profile: userPayload?.profile || null,
      role: staffPayload?.role || null,
      displayName: staffPayload?.displayName || null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
