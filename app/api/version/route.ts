import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Google Cloud Run sets K_REVISION for each revision (e.g. cityhost-app-00021-x4b).
// This guarantees a unique version string on every single deployment.
const BUILD_VERSION =
  process.env.NODE_ENV !== 'production'
    ? 'dev-local'
    : process.env.K_REVISION ||
      process.env.BUILD_ID ||
      'v-prod';

export async function GET() {
  return NextResponse.json(
    {
      version: BUILD_VERSION,
      timestamp: Date.now(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
