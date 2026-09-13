/**
 * Shared PGlite boot helpers.
 *
 * A crashed Windows run can leave a stale postmaster.pid / half-written
 * .pgdata, which makes the next start abort with RuntimeError. We detect that
 * and recreate the data directory once so `npm run dev` just works.
 */

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import fs from 'fs';
import net from 'net';
import path from 'path';

export const DB_HOST = '127.0.0.1';
export const DB_PORT = 5432;
export const dataDir = path.resolve(process.cwd(), '.pgdata');

export function portInUse(host = DB_HOST, port = DB_PORT) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function wipeDataDir() {
  if (!fs.existsSync(dataDir)) return;
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`[db] Cleared broken database folder: ${dataDir}`);
}

/**
 * Start PGlite socket server. If the data dir is corrupt, wipe once and retry.
 */
export async function startPGliteServer({
  host = DB_HOST,
  port = DB_PORT,
} = {}) {
  if (await portInUse(host, port)) {
    console.log(`[db] Postgres already listening on ${host}:${port} — reusing it.`);
    return null;
  }

  // Stale pid with nothing listening = previous crash. Safer to wipe.
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    console.log('[db] Found leftover postmaster.pid with nothing on the port.');
    wipeDataDir();
  }

  async function boot() {
    const db = new PGlite(dataDir);
    // Force the WASM engine to finish init before opening the socket.
    await db.query('select 1');
    const server = new PGLiteSocketServer({
      db,
      port,
      host,
      maxConnections: 100,
    });
    await server.start();
    return server;
  }

  try {
    const server = await boot();
    console.log(`[db] Postgres ready on ${host}:${port} (data in .pgdata)`);
    return server;
  } catch (err) {
    console.error('[db] First start failed:', err?.message || err);
    console.log('[db] Retrying with a fresh .pgdata ...');
    wipeDataDir();
    const server = await boot();
    console.log(`[db] Postgres ready on ${host}:${port} (fresh .pgdata)`);
    return server;
  }
}
