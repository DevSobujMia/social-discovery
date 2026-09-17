/**
 * MatchFunnel rotation smoke — no-repeat until pool exhausted, never blank.
 *   node scripts/test-match-rotation.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

function check(label, ok, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return !!ok;
}

async function fetchProfiles(qs) {
  const res = await fetch(`${BASE}/api/profiles?${qs}`, { cache: 'no-store' });
  const json = await res.json();
  return (json?.data?.profiles || []).filter((p) => p.userId && p.gender);
}

async function buildPool(lookingFor, city) {
  const seen = new Set();
  const merged = [];
  const push = (items) => {
    for (const p of items) {
      if (p.gender?.toLowerCase() !== lookingFor) continue;
      if (seen.has(p.userId)) continue;
      seen.add(p.userId);
      merged.push(p);
    }
  };

  const base = new URLSearchParams({ gender: lookingFor, limit: '50' });
  if (city) base.set('city', city);

  push(await fetchProfiles(`${base}&travellingOnly=true&minAge=20&maxAge=32`));
  push(await fetchProfiles(`${base}&travellingOnly=true`));
  push(await fetchProfiles(`gender=${lookingFor}&limit=50&travellingOnly=true`));
  push(await fetchProfiles(`gender=${lookingFor}&limit=50`));
  return merged;
}

function pick(list, exclude, lookingFor) {
  const gendered = list.filter((p) => p.gender?.toLowerCase() === lookingFor);
  let available = gendered.filter((p) => !exclude.includes(p.userId));
  let reset = false;
  if (!available.length) {
    available = gendered;
    reset = true;
  }
  const windowSize = Math.min(available.length, Math.max(3, Math.ceil(available.length * 0.4)));
  const window = available.slice(0, windowSize);
  const chosen = window[Math.floor(Math.random() * window.length)] || available[0];
  return { chosen, reset };
}

async function run() {
  console.log(`\nMatch rotation smoke → ${BASE}\n`);
  let failed = 0;
  const pass = (l, o, d) => {
    if (!check(l, o, d)) failed++;
  };

  try {
    await fetch(`${BASE}/api/auth/me`);
  } catch {
    console.error('Server not reachable. Start npm run dev first.');
    process.exit(1);
  }

  for (const gender of ['female', 'male']) {
    const pool = await buildPool(gender, 'Dubai');
    pass(`${gender}: pool never blank`, pool.length > 0, `${pool.length} profiles`);
    if (!pool.length) continue;

    const seen = [];
    const ids = [];
    for (let i = 0; i < pool.length; i++) {
      const { chosen, reset } = pick(pool, ids, gender);
      pass(`${gender}: pick ${i + 1} exists`, !!chosen);
      pass(`${gender}: pick ${i + 1} no premature repeat`, !ids.includes(chosen.userId), chosen.displayName);
      pass(`${gender}: pick ${i + 1} no cycle reset yet`, reset === false);
      ids.push(chosen.userId);
      seen.push(chosen.userId);
    }

    const unique = new Set(seen);
    pass(`${gender}: full cycle unique`, unique.size === pool.length, `${unique.size}/${pool.length}`);

    const after = pick(pool, ids, gender);
    pass(`${gender}: after exhaustion resets`, after.reset === true);
    pass(`${gender}: after exhaustion still returns a profile`, !!after.chosen);
  }

  console.log(`\nDone. ${failed === 0 ? 'All checks passed.' : failed + ' failed.'}`);
  if (failed) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
