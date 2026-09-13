/**
 * Ad Funnel E2E — zero upfront registration, 2-message free tier,
 * 3-method verification, admin reply unlock, and lead collection in the CRM.
 *
 *   node scripts/test-ad-funnel-leads.mjs
 *
 * Requires the dev server on http://localhost:3000 and the local Postgres running.
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

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

/** Minimal cookie jar so guest, verified, and staff sessions stay independent. */
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
    clear() {
      jar.clear();
    },
  };
}

async function pickTargetProfile() {
  const res = await fetch(`${BASE}/api/profiles?limit=50`);
  const json = await res.json();
  const profiles = json?.data?.profiles ?? [];
  return (
    profiles.find((p) => p.profileOwnerType === 'staff_assisted') ?? profiles[0] ?? null
  );
}

async function startGuest(session, { name, age, gender, lookingFor, targetUserId, utmCampaign }) {
  return session.request('/api/auth/guest', {
    method: 'POST',
    body: {
      name,
      age,
      gender,
      lookingFor,
      targetUserId,
      utm: {
        utmSource: 'facebook',
        utmMedium: 'cpc',
        utmCampaign,
        landingPage: '/',
      },
    },
  });
}

function sendAsCustomer(session, conversationId, content) {
  return session.request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { content, contentType: 'text' },
  });
}

async function run() {
  console.log(`\nAd Funnel E2E against ${BASE}`);

  // ---------------------------------------------------------------
  section('0. Target profile');
  // ---------------------------------------------------------------
  const target = await pickTargetProfile();
  if (!check('A discoverable profile exists to chat with', !!target, target?.displayName)) {
    throw new Error('No profiles in the database — run scripts/seed.mjs first.');
  }

  // ---------------------------------------------------------------
  section('1. Ad visitor starts chatting with no registration');
  // ---------------------------------------------------------------
  const visitor = createSession('visitor');
  const criteria = {
    name: `Ad Visitor ${STAMP}`,
    age: 29,
    gender: 'male',
    lookingFor: 'relationship',
    targetUserId: target.userId,
    utmCampaign: `qa_funnel_${STAMP}`,
  };

  const guest = await startGuest(visitor, criteria);
  check('POST /api/auth/guest succeeds', guest.body?.success === true, `status ${guest.status}`);
  const conversationId = guest.body?.data?.conversationId;
  check('A conversation is opened immediately', !!conversationId, conversationId);
  check(
    'Lead starts as incomplete',
    guest.body?.data?.user?.leadStage === 'incomplete' &&
      guest.body?.data?.user?.isVerifiedLead === false
  );

  const me = await visitor.request('/api/auth/me');
  check('Guest session cookie authenticates', me.body?.success === true);
  check(
    'Search criteria are stored on the lead',
    me.body?.data?.user?.age === 29 || me.body?.data?.age === 29,
    JSON.stringify(me.body?.data?.user ?? me.body?.data ?? {}).slice(0, 120)
  );

  // ---------------------------------------------------------------
  section('2. Two free messages, then the verification gate');
  // ---------------------------------------------------------------
  const first = await sendAsCustomer(visitor, conversationId, 'Hi! I saw your profile from the ad.');
  check('Message 1 is delivered without verification', first.body?.success === true, `status ${first.status}`);

  const second = await sendAsCustomer(visitor, conversationId, 'Are you around to chat today?');
  check('Message 2 is delivered without verification', second.body?.success === true, `status ${second.status}`);

  const third = await sendAsCustomer(visitor, conversationId, 'Hello? Still there?');
  check('Message 3 is blocked', third.body?.success !== true, `status ${third.status}`);
  check('Block uses status 403', third.status === 403);
  check(
    'Block carries the VERIFICATION_REQUIRED code',
    third.body?.error?.code === 'VERIFICATION_REQUIRED',
    third.body?.error?.code
  );

  // ---------------------------------------------------------------
  section('3. Incomplete lead already visible in the CRM');
  // ---------------------------------------------------------------
  const staff = createSession('staff');
  const staffLogin = await staff.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@heartlink.com', password: 'Admin@123456', type: 'staff' },
  });
  check('Admin logs in to the CRM', staffLogin.body?.success === true, `status ${staffLogin.status}`);

  const incompleteList = await staff.request('/api/admin/users?leadStage=incomplete&limit=100');
  const incompleteLead = (incompleteList.body?.data?.users ?? []).find(
    (u) => u.displayName === criteria.name
  );
  check('Unverified visitor is listed as an incomplete lead', !!incompleteLead);
  check('Incomplete lead has no contact channel yet', !incompleteLead?.phone && !incompleteLead?.whatsapp && !incompleteLead?.telegram);
  check('Lead keeps its ad attribution', incompleteLead?.source?.utm_campaign === criteria.utmCampaign, incompleteLead?.source?.utm_campaign);
  check('Lead keeps the age from match search', incompleteLead?.age === 29, String(incompleteLead?.age));

  // ---------------------------------------------------------------
  section('4. Admin reply unlocks the unverified visitor');
  // ---------------------------------------------------------------
  const adminReply = await staff.request(`/api/admin/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { content: 'Hi there! Lovely to hear from you.' },
  });
  check('Admin replies on behalf of the profile', adminReply.body?.success === true, `status ${adminReply.status}`);

  const afterUnlock = await sendAsCustomer(visitor, conversationId, 'Oh great, thanks for replying!');
  check('Visitor may reply again without verifying', afterUnlock.body?.success === true, `status ${afterUnlock.status}`);

  const secondAfterUnlock = await sendAsCustomer(visitor, conversationId, 'What are you up to this weekend?');
  check('Second reply after the unlock still passes', secondAfterUnlock.body?.success === true, `status ${secondAfterUnlock.status}`);

  const gateRearms = await sendAsCustomer(visitor, conversationId, 'Hello again?');
  check(
    'Gate re-arms once the allowance is used up',
    gateRearms.body?.error?.code === 'VERIFICATION_REQUIRED',
    `status ${gateRearms.status}`
  );

  // ---------------------------------------------------------------
  section('5. Verifying with WhatsApp completes the lead');
  // ---------------------------------------------------------------
  const whatsappNumber = `+8801${String(STAMP).slice(-9)}`;
  const verify = await visitor.request('/api/auth/verify-contact', {
    method: 'POST',
    body: { method: 'whatsapp', value: whatsappNumber },
  });
  check('Verification succeeds', verify.body?.success === true, `status ${verify.status}`);
  check('Lead is marked complete', verify.body?.data?.user?.leadStage === 'complete');
  check('Verification channel is recorded', verify.body?.data?.user?.verifiedVia === 'whatsapp');

  const unlimited = [];
  for (let i = 1; i <= 4; i++) {
    const r = await sendAsCustomer(visitor, conversationId, `Verified message ${i}`);
    unlimited.push(r.body?.success === true);
  }
  check('Verified visitor chats without limit', unlimited.every(Boolean), `${unlimited.filter(Boolean).length}/4 delivered`);

  // ---------------------------------------------------------------
  section('6. Complete lead lands in the CRM with a reachable contact');
  // ---------------------------------------------------------------
  const completeList = await staff.request('/api/admin/users?leadStage=complete&limit=100');
  const completeLead = (completeList.body?.data?.users ?? []).find(
    (u) => u.displayName === criteria.name
  );
  check('Verified visitor is listed as a complete lead', !!completeLead);
  check('WhatsApp number is saved on the lead', completeLead?.whatsapp === whatsappNumber, completeLead?.whatsapp);
  check('Lead is flagged as verified', completeLead?.isVerifiedLead === true);

  const noLongerIncomplete = await staff.request('/api/admin/users?leadStage=incomplete&limit=100');
  check(
    'Lead moved out of the incomplete bucket',
    !(noLongerIncomplete.body?.data?.users ?? []).some((u) => u.displayName === criteria.name)
  );

  const searchByContact = await staff.request(
    `/api/admin/users?search=${encodeURIComponent(whatsappNumber.slice(-9))}&limit=100`
  );
  check(
    'CRM search finds the lead by contact number',
    (searchByContact.body?.data?.users ?? []).some((u) => u.displayName === criteria.name)
  );

  // ---------------------------------------------------------------
  section('7. Returning visitor logs back in with the same contact');
  // ---------------------------------------------------------------
  const returning = createSession('returning');
  const relogin = await returning.request('/api/auth/contact-login', {
    method: 'POST',
    body: { contact: whatsappNumber },
  });
  check('Contact login succeeds', relogin.body?.success === true, `status ${relogin.status}`);
  check('Same identity is restored', relogin.body?.data?.user?.whatsapp === whatsappNumber);

  const restoredThreads = await returning.request('/api/conversations');
  const threads = restoredThreads.body?.data?.conversations ?? restoredThreads.body?.data ?? [];
  check(
    'Chat history comes back with the session',
    Array.isArray(threads) && threads.some((c) => c.id === conversationId),
    `${Array.isArray(threads) ? threads.length : 0} thread(s)`
  );

  const unknownLogin = await returning.request('/api/auth/contact-login', {
    method: 'POST',
    body: { contact: '+000000000000' },
  });
  check('Unknown contact is rejected', unknownLogin.status === 404, `status ${unknownLogin.status}`);

  // ---------------------------------------------------------------
  section('8. Phone and Telegram are equally valid channels');
  // ---------------------------------------------------------------
  for (const [method, value] of [
    ['phone', `+8802${String(STAMP).slice(-9)}`],
    ['telegram', `qa_lead_${STAMP}`],
  ]) {
    const s = createSession(method);
    const g = await startGuest(s, {
      ...criteria,
      name: `Ad Visitor ${method} ${STAMP}`,
      utmCampaign: `qa_funnel_${method}_${STAMP}`,
    });
    const convId = g.body?.data?.conversationId;

    await sendAsCustomer(s, convId, 'Hello there');
    await sendAsCustomer(s, convId, 'Anyone home?');
    const gated = await sendAsCustomer(s, convId, 'Third one');
    check(`${method}: gate triggers on message 3`, gated.body?.error?.code === 'VERIFICATION_REQUIRED');

    const v = await s.request('/api/auth/verify-contact', {
      method: 'POST',
      body: { method, value },
    });
    check(`${method}: verification completes the lead`, v.body?.data?.user?.leadStage === 'complete');

    const after = await sendAsCustomer(s, convId, 'Now I can keep talking');
    check(`${method}: chat unlocked after verifying`, after.body?.success === true);

    const back = createSession(`${method}-return`);
    const bl = await back.request('/api/auth/contact-login', { method: 'POST', body: { contact: value } });
    check(`${method}: returning login works`, bl.body?.success === true, `status ${bl.status}`);
  }

  // ---------------------------------------------------------------
  section('9. Verification input validation');
  // ---------------------------------------------------------------
  const badMethod = await visitor.request('/api/auth/verify-contact', {
    method: 'POST',
    body: { method: 'carrier-pigeon', value: '12345678' },
  });
  check('Unknown verification method is rejected', badMethod.status === 400);

  const shortNumber = await visitor.request('/api/auth/verify-contact', {
    method: 'POST',
    body: { method: 'phone', value: '12' },
  });
  check('Too-short phone number is rejected', shortNumber.status === 400);

  const emptyValue = await visitor.request('/api/auth/verify-contact', {
    method: 'POST',
    body: { method: 'whatsapp', value: '   ' },
  });
  check('Empty contact value is rejected', emptyValue.status === 400);

  // ---------------------------------------------------------------
  console.log(`\n${'='.repeat(56)}`);
  console.log(`  Passed: ${passed}    Failed: ${failed}`);
  console.log('='.repeat(56));
  if (failed > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error('\nAd Funnel E2E crashed:', err);
  process.exitCode = 1;
});
