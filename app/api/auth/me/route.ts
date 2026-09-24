import { NextRequest } from 'next/server';
import {
  getCurrentUser,
  getCurrentStaff,
  getAuthToken,
  getStaffAuthToken,
  removeAuthCookie,
  removeStaffAuthCookie,
  attachStaffCookie,
  attachUserCookie,
} from '@/lib/auth';
import { success, handleApiError } from '@/lib/api-helpers';

/**
 * Returns BOTH sessions when present.
 *
 * Admin and visitor cookies are separate on purpose so the same browser can
 * hold a guest lead and a staff login. Supports both cookies and Bearer tokens,
 * automatically refreshing the persistent 365-day cookie if session resumed.
 */
export async function GET(req: NextRequest) {
  try {
    const token = await getAuthToken(req);
    const user = await getCurrentUser(req);

    // After a DB wipe/reseed the JWT can still be in the browser while the
    // user/staff row is gone. Drop orphan cookies so clients stop 401-polling.
    if (token && !user) {
      await removeAuthCookie();
    }

    const staffToken = await getStaffAuthToken(req);
    const staff = await getCurrentStaff(req);
    if (staffToken && !staff) {
      await removeStaffAuthCookie();
    }

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

    const res = success({
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

    // Re-attach cookies if bearer token was used to restore session
    if (staff && staffToken) {
      attachStaffCookie(res, staffToken);
    }
    if (user && token) {
      attachUserCookie(res, token);
    }

    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
