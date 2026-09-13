/**
 * Test Travel Plan Publishing, Multi-Plan Support,
 * Filtering, and Profile Integration.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return !!condition;
}

function createSession(name) {
  const jar = new Map();
  return {
    name,
    async request(path, { method = 'GET', body } = {}) {
      const headers = { accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (jar.size > 0) {
        headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      }
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, body: json };
    },
  };
}

async function run() {
  console.log(`\n=== TRAVEL PLAN PUBLISHING & MULTI-PLAN TEST ===\n`);

  // 1. Create traveler user
  const traveler = createSession('traveler');
  const regRes = await traveler.request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: `traveler_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Globetrotter Alex',
      age: 28,
      gender: 'male',
      country: 'United States',
    },
  });
  check('Traveler user registered', regRes.body?.success === true, `status ${regRes.status}`);

  // 2. Publish First Travel Plan: Dubai
  const fromDubai = new Date(Date.now() + 7 * 86400000).toISOString();
  const toDubai = new Date(Date.now() + 14 * 86400000).toISOString();
  const dubaiRes = await traveler.request('/api/travel-plans', {
    method: 'POST',
    body: {
      city: 'Dubai',
      country: 'United Arab Emirates',
      fromDate: fromDubai,
      toDate: toDubai,
      note: '[City Exploration & Cafes] Looking for a fun partner to explore Dubai Marina & Old Souks!',
    },
  });
  check('First travel plan (Dubai) published', dubaiRes.body?.success === true, `status ${dubaiRes.status}`);
  const dubaiPlanId = dubaiRes.body?.data?.travelPlan?.id;
  check('Dubai plan ID generated', !!dubaiPlanId, dubaiPlanId);

  // 3. Publish Second Travel Plan: Bangkok (Multi-trip support)
  const fromBangkok = new Date(Date.now() + 30 * 86400000).toISOString();
  const toBangkok = new Date(Date.now() + 40 * 86400000).toISOString();
  const bangkokRes = await traveler.request('/api/travel-plans', {
    method: 'POST',
    body: {
      city: 'Bangkok',
      country: 'Thailand',
      fromDate: fromBangkok,
      toDate: toBangkok,
      note: '[Foodie & Nightlife] Weekend street food tour and night markets.',
    },
  });
  check('Second travel plan (Bangkok) published', bangkokRes.body?.success === true, `status ${bangkokRes.status}`);
  const bangkokPlanId = bangkokRes.body?.data?.travelPlan?.id;
  check('Bangkok plan ID generated', !!bangkokPlanId, bangkokPlanId);

  // 4. Query public GET /api/travel-plans
  const allPlansRes = await fetch(`${BASE}/api/travel-plans`);
  const allPlansData = await allPlansRes.json();
  check('GET /api/travel-plans responds successfully', allPlansData.success === true);
  const plans = allPlansData.data?.travelPlans ?? [];
  check('Travel plans list contains both published trips', plans.some(p => p.id === dubaiPlanId) && plans.some(p => p.id === bangkokPlanId));

  // 5. City filter test: GET /api/travel-plans?city=Dubai
  const filteredRes = await fetch(`${BASE}/api/travel-plans?city=Dubai`);
  const filteredData = await filteredRes.json();
  const dubaiMatches = filteredData.data?.travelPlans ?? [];
  check('City filter returns Dubai plans', dubaiMatches.some(p => p.id === dubaiPlanId) && !dubaiMatches.some(p => p.id === bangkokPlanId));

  // 6. User profile sync: GET /api/auth/me includes travelPlans
  const meRes = await traveler.request('/api/auth/me');
  const myPlans = meRes.body?.data?.user?.profile?.travelPlans ?? [];
  check('User profile includes active travelPlans array', Array.isArray(myPlans) && myPlans.length >= 2, `Count: ${myPlans.length}`);

  // 7. Another user tries to delete Alex's plan (Should be forbidden 403)
  const otherUser = createSession('otherUser');
  await otherUser.request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: `stranger_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Stranger',
      age: 25,
      gender: 'female',
      country: 'Canada',
    },
  });
  const unauthDel = await otherUser.request(`/api/travel-plans/${dubaiPlanId}`, { method: 'DELETE' });
  check('Other user cannot delete foreign travel plan (403)', unauthDel.status === 403, `status: ${unauthDel.status}`);

  // 8. Owner deletes the Bangkok plan
  const ownerDel = await traveler.request(`/api/travel-plans/${bangkokPlanId}`, { method: 'DELETE' });
  check('Owner deletes Bangkok plan successfully', ownerDel.body?.success === true, `status: ${ownerDel.status}`);

  // Verify it's gone from travel plans
  const postDelCheck = await fetch(`${BASE}/api/travel-plans?city=Bangkok`);
  const postDelData = await postDelCheck.json();
  const bangkokRemaining = (postDelData.data?.travelPlans ?? []).filter(p => p.id === bangkokPlanId);
  check('Deleted plan no longer appears in listings', bangkokRemaining.length === 0);

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
