/**
 * Start only the embedded PGlite Postgres on 127.0.0.1:5432.
 *
 *   npm run db
 */

import { startPGliteServer } from './pglite-boot.mjs';

let server = null;

try {
  server = await startPGliteServer();
  if (!server) {
    // Already listening elsewhere — keep this process alive as a no-op holder
    // so `npm run db` still looks "running" to the user.
    console.log('[db] Keeping this terminal open. Press Ctrl+C to exit.');
    await new Promise(() => {});
  }
} catch (err) {
  console.error('\n[db] Could not start the local database.');
  console.error(err?.message || err);
  console.error('\nTry this once, then run again:');
  console.error('  rmdir /s /q .pgdata');
  console.error('  npm run db\n');
  process.exit(1);
}

console.log('Keep this terminal open. Press Ctrl+C to stop Postgres.');

process.on('SIGINT', async () => {
  console.log('\nStopping Postgres...');
  if (server) await server.stop().catch(() => {});
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (server) await server.stop().catch(() => {});
  process.exit(0);
});
