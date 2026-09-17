/**
 * Soft-launch smoke — the exact ads path that must never break:
 *   ad visitor → guest chat → customer message → admin sees it
 *   → admin reply → customer receives it → verification gate still works
 *
 *   node scripts/soft-launch-smoke.mjs
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const STAMP = Date.now();

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

function createSession() {
  const jar = new Map();
  return {
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
      return { status: res.status, body: json, jar };
    },
    has(name) {
      return jar.has(name);
    },
  };
}

async function waitForServer(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/auth/me`, { cache: 'no-store' });
      if (res.ok || res.status === 200) return true;
    } catch {
      // keep waiting
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function run() {
  console.log(`\nSoft-launch smoke against ${BASE}\n`);

  if (!(await waitForServer())) {
    console.error('Server not reachable. Run npm run dev first.');
    process.exit(1);
  }

  const profilesRes = await fetch(`${BASE}/api/profiles?gender=female&limit=20`);
  const profilesJson = await profilesRes.json();
  const profiles = profilesJson?.data?.profiles ?? [];
  const target =
    profiles.find((p) => p.profileOwnerType === 'staff_assisted') || profiles[0] || null;
  if (!check('Female travel profile exists for ads', !!target, target?.displayName)) {
    process.exit(1);
  }

  const visitor = createSession();
  const name = `Smoke_${STAMP}`;
  const guest = await visitor.request('/api/auth/guest', {
    method: 'POST',
    body: {
      name,
      age: 28,
      gender: 'male',
      lookingFor: 'travel_partner',
      preferredGender: 'female',
      targetUserId: target.userId,
      utm: {
        utmSource: 'facebook',
        utmMedium: 'cpc',
        utmCampaign: `soft_launch_${STAMP}`,
        landingPage: '/',
      },
    },
  });
  check('Guest session created', guest.body?.success === true, `status ${guest.status}`);
  check('Guest auth cookie set', visitor.has('auth_token'));
  const convId = guest.body?.data?.conversationId;
  check('Conversation opened from Say Hi', !!convId, convId);

  const msg1 = `Hi ${target.displayName}, landing from ads smoke ${STAMP}`;
  const send1 = await visitor.request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: msg1, contentType: 'text' },
  });
  check('Customer message 1 delivered', send1.body?.success === true, `status ${send1.status}`);
  check('Customer message marked isOwn', send1.body?.data?.message?.isOwn === true);

  const msg2 = 'Are you free this weekend for coffee?';
  const send2 = await visitor.request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: msg2, contentType: 'text' },
  });
  check('Customer message 2 delivered', send2.body?.success === true);

  const staff = createSession();
  const login = await staff.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@heartlink.com', password: 'Admin@123456', type: 'staff' },
  });
  check('Admin login works', login.body?.success === true, `status ${login.status}`);
  check('Staff cookie set', staff.has('staff_auth_token'));

  const inbox = await staff.request('/api/admin/conversations');
  const threads = inbox.body?.data?.conversations ?? [];
  const thread = threads.find((c) => c.id === convId);
  check('Admin inbox shows the ad lead chat', !!thread, thread?.customer?.displayName);
  check('Admin unread after customer messages', (thread?.totalUnread ?? 0) >= 1, `${thread?.totalUnread}`);

  const adminRead = await staff.request(`/api/admin/conversations/${convId}/messages`);
  const adminMsgs = adminRead.body?.data?.messages ?? [];
  check('Admin can read customer messages', adminMsgs.some((m) => m.content === msg1));
  check('Admin sees second customer message', adminMsgs.some((m) => m.content === msg2));

  const replyText = `Hey ${name.split('_')[0]}! Yes — let's meet in the city.`;
  const reply = await staff.request(`/api/admin/conversations/${convId}/messages`, {
    method: 'POST',
    body: {
      content: replyText,
      contentType: 'text',
      sentOnBehalfOf: target.userId,
      onBehalfOfUserId: target.userId,
    },
  });
  check('Admin reply saved', reply.body?.success === true, `status ${reply.status}`);

  // Simulate customer poll (open chat dashboard)
  const customerPoll = await visitor.request(`/api/conversations/${convId}/messages`);
  const customerMsgs = customerPoll.body?.data?.messages ?? [];
  const adminMsg = customerMsgs.find((m) => m.content === replyText);
  check('Customer poll returns admin reply', !!adminMsg);
  check('Admin reply is not shown as own', adminMsg?.isOwn === false);
  check('Admin reply shows profile name', adminMsg?.senderName === target.displayName, adminMsg?.senderName);
  check('Thread has customer + admin messages', customerMsgs.length >= 3, `${customerMsgs.length}`);

  // After admin reply, visitor gets 2 more free messages before gate
  const unlock1 = await visitor.request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: 'Perfect, Saturday works for me.', contentType: 'text' },
  });
  check('Customer can reply after admin unlock', unlock1.body?.success === true);

  const unlock2 = await visitor.request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: 'Where should we meet?', contentType: 'text' },
  });
  check('Second customer reply after unlock works', unlock2.body?.success === true);

  const gated = await visitor.request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: 'Still there?', contentType: 'text' },
  });
  check(
    'Verification gate still arms on message 3',
    gated.body?.error?.code === 'VERIFICATION_REQUIRED',
    gated.body?.error?.code
  );

  const wa = `+8801${String(STAMP).slice(-9)}`;
  const verify = await visitor.request('/api/auth/verify-contact', {
    method: 'POST',
    body: { method: 'whatsapp', value: wa },
  });
  check('WhatsApp verify completes lead', verify.body?.data?.user?.leadStage === 'complete');

  const afterVerify = await visitor.request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: 'Verified — continuing chat.', contentType: 'text' },
  });
  check('Chat unlocked after verify', afterVerify.body?.success === true);

  const finalPoll = await visitor.request(`/api/conversations/${convId}/messages`);
  const finalMsgs = finalPoll.body?.data?.messages ?? [];
  check(
    'Full history still loads for customer',
    finalMsgs.some((m) => m.content === replyText) &&
      finalMsgs.some((m) => m.content === msg1) &&
      finalMsgs.some((m) => m.content === 'Verified — continuing chat.')
  );

  const crm = await staff.request('/api/admin/users?leadStage=complete&limit=100');
  const lead = (crm.body?.data?.users ?? []).find((u) => u.displayName === name);
  check('Complete lead visible in CRM', !!lead);
  check('Lead WhatsApp saved', lead?.whatsapp === wa, lead?.whatsapp);

  console.log(`\n${'='.repeat(56)}`);
  console.log(`  Soft-launch smoke: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(56));
  if (failed > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error('\nSoft-launch smoke crashed:', err);
  process.exitCode = 1;
});
