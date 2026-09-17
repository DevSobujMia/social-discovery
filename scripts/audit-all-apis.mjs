import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3000';

async function req(path, opts = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, opts);
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

async function testAllApis() {
  console.log('--- Testing API Endpoints for 500 / Crashes ---');
  const results = [];

  const endpoints = [
    { method: 'GET', path: '/api/auth/me' },
    { method: 'GET', path: '/api/profiles' },
    { method: 'GET', path: '/api/profiles?gender=female&limit=10' },
    { method: 'GET', path: '/api/profiles?gender=male&limit=10' },
    { method: 'GET', path: '/api/travel-plans' },
    { method: 'GET', path: '/api/conversations' }, // expect 401 unauth, NOT 500 crash
    { method: 'GET', path: '/api/admin/analytics' }, // expect 401 unauth, NOT 500 crash
    { method: 'GET', path: '/api/admin/conversations' }, // expect 401 unauth
    { method: 'GET', path: '/api/admin/users' }, // expect 401 unauth
    { method: 'GET', path: '/api/admin/campaigns' }, // expect 401 unauth
    { method: 'GET', path: '/api/admin/travel-plans' }, // expect 401 unauth
    { method: 'GET', path: '/api/admin/reports' }, // expect 401 unauth
    { method: 'POST', path: '/api/auth/device-resume', body: { deviceToken: 'invalid-test' } },
    { method: 'POST', path: '/api/auth/contact-login', body: { contact: '0000000000' } },
    { method: 'POST', path: '/api/auth/verify-contact', body: { method: 'phone', value: '+15551234567' } }, // unauth or handles
    { method: 'POST', path: '/api/interactions', body: { targetUserId: 'none', type: 'like' } },
    { method: 'POST', path: '/api/report', body: { targetUserId: 'none', reason: 'test' } },
    { method: 'POST', path: '/api/block', body: { targetUserId: 'none' } },
  ];

  let crashCount = 0;

  for (const ep of endpoints) {
    const opts = {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    };
    const res = await req(ep.path, opts);
    const is500 = res.status >= 500 || res.status === 0;
    if (is500) {
      crashCount++;
      console.error(`❌ CRASH / 500 on ${ep.method} ${ep.path} -> status ${res.status}:`, res.data || res.error);
    } else {
      console.log(`✅ ${ep.method} ${ep.path} -> ${res.status} (handled cleanly)`);
    }
  }

  console.log(`\nAPI Audit Complete: ${endpoints.length} endpoints tested. Crashes: ${crashCount}`);
}

testAllApis();
