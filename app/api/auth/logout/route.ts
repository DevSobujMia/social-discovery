import { NextRequest } from 'next/server';
import {
  removeAllAuthCookies,
  removeAuthCookie,
  removeStaffAuthCookie,
} from '@/lib/auth';
import { success } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  let scope: 'user' | 'staff' | 'all' = 'all';
  try {
    const body = await req.json();
    if (body?.scope === 'user' || body?.scope === 'staff' || body?.scope === 'all') {
      scope = body.scope;
    }
  } catch {
    // empty body is fine
  }

  if (scope === 'user') await removeAuthCookie();
  else if (scope === 'staff') await removeStaffAuthCookie();
  else await removeAllAuthCookies();

  return success({ message: 'Logged out' });
}
