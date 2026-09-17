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

/** Remove stale lock only — never delete profile/trip data for a leftover pid. */
function clearStalePidOnly() {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return;
  try {
    fs.unlinkSync(pidFile);
    console.log('[db] Removed leftover postmaster.pid (kept .pgdata / your profiles).');
  } catch (err) {
    console.warn('[db] Could not remove leftover postmaster.pid:', err?.message || err);
  }
}

/**
 * Start PGlite socket server. If the data dir is corrupt, wipe once and retry.
 */
export async function startPGliteServer({
  host = DB_HOST,
  port = DB_PORT,
} = {}) {
  if (await portInUse(host, port)) {
    // Reuse only if the listener actually answers SQL. A crashed leftover
    // process on :5432 causes "prepared statement does not exist" on push.
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      await prisma.$disconnect();
      console.log(`[db] Postgres already listening on ${host}:${port} — reusing it.`);
      return null;
    } catch (err) {
      console.log(
        `[db] Port ${port} is occupied but unhealthy (${err?.message || err}). NOT wiping .pgdata — close other npm run dev windows, then retry.`
      );
      try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        await prisma.$disconnect().catch(() => {});
      } catch {
        // ignore
      }
      throw new Error(
        `Stale Postgres is still bound to ${host}:${port}. Close other npm run dev windows, then run again. (Profiles were NOT deleted.)`
      );
    }
  }

  // Stale pid with nothing listening = previous crash. Keep data; drop lock only.
  if (!(await portInUse(host, port))) {
    clearStalePidOnly();
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
    // Do NOT auto-wipe curated profile data. Only wipe when explicitly forced.
    if (process.env.FORCE_DB_WIPE === '1') {
      console.log('[db] FORCE_DB_WIPE=1 — recreating .pgdata ...');
      wipeDataDir();
      const server = await boot();
      console.log(`[db] Postgres ready on ${host}:${port} (fresh .pgdata)`);
      return server;
    }
    throw new Error(
      `Database failed to start (${err?.message || err}). Profiles were NOT deleted. ` +
        `Fix the error, or only if data is corrupt set FORCE_DB_WIPE=1 and retry.`
    );
  }
}
