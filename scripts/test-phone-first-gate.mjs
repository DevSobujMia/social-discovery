/**
 * Smoke: phone-first chat gate + blank guest bio + Ava profiles exist.
 * Usage: node scripts/test-phone-first-gate.mjs
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

function jar() {
  const cookies = new Map();
  return {
    async request(path, { method = 'GET', body } = {}) {
      const headers = { Accept: 'application/json' };
      if (body) headers['Content-Type'] = 'application/json';
      if (cookies.size) {
        headers.Cookie = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      }
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.getSetCookie?.() || [];
      for (const c of set) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      // Node fetch may only expose set-cookie via get('set-cookie') as single string
      const single = res.headers.get('set-cookie');
      if (single && !set.length) {
        for (const part of single.split(/,(?=\s*\w+=)/)) {
          const [pair] = part.split(';');
          const i = pair.indexOf('=');
          if (i > 0) cookies.set(pair.trim().slice(0, i), pair.trim().slice(i + 1));
        }
      }
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('Testing phone-first gate @', BASE);

  // Ava profiles visible
  const profiles = await fetch(`${BASE}/api/profiles?gender=female&limit=50`).then((r) => r.json());
  assert(profiles.success, 'profiles fetch failed');
  const avas = (profiles.data?.profiles || profiles.data || []).filter((p) =>
    /ava/i.test(p.displayName || '')
  );
  console.log('Ava profiles found:', avas.map((p) => `${p.displayName} (${p.age})`).join(', ') || '(none)');
  assert(avas.length >= 5, `expected >=5 Ava profiles, got ${avas.length}`);

  const target = avas[0];
  const session = jar();
  const guest = await session.request('/api/auth/guest', {
    method: 'POST',
    body: {
      name: 'Visitor',
      age: 29,
      gender: 'male',
      lookingFor: 'travel_partner',
      preferredGender: 'female',
      targetUserId: target.userId,
    },
  });
  assert(guest.data.success, `guest create failed: ${JSON.stringify(guest.data)}`);
  const bio = guest.data.data?.user?.profile?.bio;
  assert(!bio || bio === '', `guest bio should be blank, got: ${JSON.stringify(bio)}`);
  console.log('✅ Guest bio blank');

  const convId = guest.data.data?.conversationId;
  assert(convId, 'no conversationId from guest');

  const blocked = await session.request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: 'hi before phone', contentType: 'text' },
  });
  assert(blocked.status === 403, `expected 403 before phone, got ${blocked.status}`);
  assert(
    blocked.data?.error?.code === 'VERIFICATION_REQUIRED',
    `expected VERIFICATION_REQUIRED, got ${JSON.stringify(blocked.data)}`
  );
  console.log('✅ Message blocked until phone verify');

  const phone = `+1555${String(Date.now()).slice(-7)}`;
  const verify = await session.request('/api/auth/verify-contact', {
    method: 'POST',
    body: { method: 'phone', value: phone },
  });
  assert(verify.data.success, `verify failed: ${JSON.stringify(verify.data)}`);
  console.log('✅ Phone verified');

  const namePatch = await session.request('/api/profiles', {
    method: 'PATCH',
    body: { displayName: 'Green Test' },
  });
  assert(namePatch.data.success, `name patch failed: ${JSON.stringify(namePatch.data)}`);

  const sent = await session.request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: 'Hi, I am Green Test!', contentType: 'text' },
  });
  assert(sent.data.success, `message after phone failed: ${JSON.stringify(sent.data)}`);
  console.log('✅ Message allowed after phone + name');

  // Passwordless re-login with same number
  const back = jar();
  const login = await back.request('/api/auth/contact-login', {
    method: 'POST',
    body: { contact: phone },
  });
  assert(login.data.success, `contact-login failed: ${JSON.stringify(login.data)}`);
  console.log('✅ Contact login with mobile number works');

  console.log('🎉 phone-first gate smoke passed');
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
