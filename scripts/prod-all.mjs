/**
 * ONE command — this is what `npm run dev` runs.
 *
 * You only type:
 *   cd C:\Dev\social-discovery
 *   npm run dev
 *
 * Internally this script does the rest:
 *   1. Start database
 *   2. Create / update tables
 *   3. Seed profiles on first run
 *   4. Start the website at http://localhost:3000
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { startPGliteServer } from './pglite-boot.mjs';

const root = process.cwd();
let dbServer = null;
let nextChild = null;
let shuttingDown = false;

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envFile = fs.readFileSync(path.join(root, '.env'), 'utf8');
    const match = envFile.match(/^DATABASE_URL=(.*)$/m);
    if (!match) return '';
    return match[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

function usesLocalPglite(url) {
  if (!url) return true;
  return /localhost|127\.0\.0\.1/i.test(url);
}

function run(command, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n→ ${label}`);
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (exit ${code})`));
    });
  });
}

async function databaseNeedsSeed() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const count = await prisma.staffAccount.count();
      return count === 0;
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    return true;
  }
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (nextChild && nextChild.exitCode === null) {
    nextChild.kill();
  }
  if (dbServer) {
    console.log('\n[db] Stopping...');
    await dbServer.stop().catch(() => {});
  }
  process.exit(code);
}

async function main() {
  process.on('SIGINT', () => {
    shutdown(0);
  });
  process.on('SIGTERM', () => {
    shutdown(0);
  });

  console.log('');
  console.log('  City Host starting...');
  console.log('  (database + website — one command)');
  console.log('');

  if (!fs.existsSync(path.join(root, 'node_modules', 'next'))) {
    try {
      await run('npm', ['install'], 'Installing packages (first time)');
    } catch (err) {
      console.error('\nCould not install packages:', err?.message || err);
      process.exit(1);
    }
  }

  const databaseUrl = readDatabaseUrl();
  const localDb = usesLocalPglite(databaseUrl);

  if (localDb) {
    try {
      dbServer = await startPGliteServer();
    } catch (err) {
      console.error('\nDatabase failed to start:', err?.message || err);
      console.error('\nOne-time fix, then run again:');
      console.error('  rmdir /s /q .pgdata');
      console.error('  npm run dev\n');
      process.exit(1);
    }
  } else {
    console.log(`\n→ Using hosted Postgres (${databaseUrl.replace(/:[^:@/]+@/, ':****@')})`);
  }

  try {
    await run('npx', ['prisma', 'db', 'push'], 'Preparing database');

    if (await databaseNeedsSeed()) {
      await run('node', ['scripts/seed.mjs'], 'Loading profiles (first run only)');
    } else {
      console.log('\n→ Profiles already loaded');
    }
  } catch (err) {
    console.error('\nSetup failed:', err?.message || err);
    await shutdown(1);
  }

  console.log('\n→ Website: http://localhost:3000');
  console.log('   Keep this window open. Stop with Ctrl+C.\n');

  const nextBin = path.resolve(root, 'node_modules/next/dist/bin/next');
  nextChild = spawn(process.execPath, [nextBin, 'start', '-H', '0.0.0.0', '-p', '3000', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });

  nextChild.on('exit', (code, signal) => {
    shutdown(signal ? 0 : (code ?? 0));
  });
}

main().catch(async (err) => {
  console.error('\nFailed to start:', err?.message || err);
  await shutdown(1);
});
