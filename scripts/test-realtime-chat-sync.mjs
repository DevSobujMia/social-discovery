/**
 * Verification test for Real-Time Bidirectional Chat Sync,
 * Multiline Text Input, and Master Inbox Unread Badge Clearing.
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
  console.log(`\n=== REAL-TIME BIDIRECTIONAL CHAT & INBOX SYNC TEST ===\n`);

  // 1. Pick a model profile
  const pRes = await fetch(`${BASE}/api/profiles?limit=10`);
  const pData = await pRes.json();
  const target = pData?.data?.profiles?.find(p => p.profileOwnerType === 'staff_assisted') || pData?.data?.profiles?.[0];
  check('Target model profile found', !!target, `${target?.displayName} (${target?.userId})`);

  // 2. Visitor session starts
  const visitor = createSession('visitor');
  const visitorName = `Alex_${Date.now()}`;
  const startRes = await visitor.request('/api/auth/guest', {
    method: 'POST',
    body: {
      name: visitorName,
      age: 27,
      gender: 'male',
      lookingFor: 'travel_partner',
      targetUserId: target.userId,
    },
  });
  check('Visitor guest session created', startRes.body?.success === true, `status ${startRes.status}`);
  const convId = startRes.body?.data?.conversationId;
  check('Conversation ID returned', !!convId, convId);

  // 3. Name + phone creates the account/lead and sends the first message
  const phone = `+1555${String(Date.now()).slice(-7)}`;
  const multilineCustomerMessage = 'Hello Emma!\nI am visiting next month.\nWould love to connect!';
  const phoneRes = await visitor.request('/api/auth/phone', {
    method: 'POST',
    body: {
      name: visitorName,
      phone,
      conversationId: convId,
      firstMessage: multilineCustomerMessage,
    },
  });
  check('Visitor registers with name + phone', phoneRes.body?.success === true, `status ${phoneRes.status}`);
  check('Phone register marks verified lead', phoneRes.body?.data?.user?.isVerifiedLead === true);
  check('First message sent with register', !!phoneRes.body?.data?.message);
  check('Customer message preserves newlines', phoneRes.body?.data?.message?.content?.includes('\n'));
  check('Customer message marked isOwn = true', phoneRes.body?.data?.message?.isOwn === true);

  // 4. Staff logs in to Admin CRM
  const staff = createSession('staff');
  const staffLogin = await staff.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@heartlink.com', password: 'Admin@123456', type: 'staff' },
  });
  check('Admin staff login', staffLogin.body?.success === true, `status ${staffLogin.status}`);

  // 5. Check Master Inbox
  const inboxBefore = await staff.request('/api/admin/conversations');
  check('Master inbox API responds', inboxBefore.body?.success === true);
  const convInList = (inboxBefore.body?.data?.conversations ?? []).find(c => c.id === convId);
  check('New conversation visible in Admin Inbox', !!convInList, convInList?.customer?.displayName);
  check('Unread count reflected in inbox', (convInList?.totalUnread ?? 0) >= 1, `unread: ${convInList?.totalUnread}`);

  // 6. Admin opens conversation messages
  const adminGetMessages = await staff.request(`/api/admin/conversations/${convId}/messages`);
  check('Admin reads conversation messages', adminGetMessages.body?.success === true);
  const msgsAdminSide = adminGetMessages.body?.data?.messages ?? [];
  check('Admin sees customer message with newlines', msgsAdminSide.some(m => m.content.includes('\n')));

  // 7. Check unread count after admin opened
  const inboxAfterRead = await staff.request('/api/admin/conversations');
  const convAfterRead = (inboxAfterRead.body?.data?.conversations ?? []).find(c => c.id === convId);
  check('Conversation unread count cleared to 0', convAfterRead?.totalUnread === 0, `unread: ${convAfterRead?.totalUnread}`);

  // 8. Admin replies on behalf of the model with multiline message
  const multilineAdminReply = 'Hi Alex!\nYes, that sounds amazing!\nLet me know your travel dates.';
  const replyRes = await staff.request(`/api/admin/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: multilineAdminReply, contentType: 'text' },
  });
  check('Admin sends reply on behalf of model', replyRes.body?.success === true, `status ${replyRes.status}`);
  check('Admin reply preserves newlines', replyRes.body?.data?.content.includes('\n'));

  // 9. Customer polls and fetches messages
  const customerPoll = await visitor.request(`/api/conversations/${convId}/messages`);
  check('Customer fetches messages', customerPoll.body?.success === true);
  const customerMsgs = customerPoll.body?.data?.messages ?? [];
  check('Customer has 2 messages', customerMsgs.length >= 2, `${customerMsgs.length} messages`);

  const ownMsg = customerMsgs.find(m => m.content === multilineCustomerMessage);
  check('Own message recognized as isOwn = true', ownMsg?.isOwn === true);

  const adminMsg = customerMsgs.find(m => m.content === multilineAdminReply);
  check('Admin reply received by customer in real time', !!adminMsg);
  check('Admin reply recognized as isOwn = false', adminMsg?.isOwn === false);
  check('Admin reply senderName is model name', adminMsg?.senderName === target.displayName, adminMsg?.senderName);
  check('Admin reply has senderStaffId', !!adminMsg?.senderStaffId);

  const customerPollAgain = await visitor.request(`/api/conversations/${convId}/messages`);
  const customerMsgsAgain = customerPollAgain.body?.data?.messages ?? [];
  check(
    'Second customer poll keeps full history',
    customerMsgsAgain.length >= customerMsgs.length &&
      customerMsgsAgain.some((m) => m.content === multilineAdminReply),
    `${customerMsgsAgain.length} messages`
  );

  // 10. Test Mark-All-Read endpoint
  const markAllRes = await staff.request('/api/admin/conversations/mark-all-read', { method: 'POST' });
  check('POST /api/admin/conversations/mark-all-read succeeds', markAllRes.body?.success === true);

  const inboxFinal = await staff.request('/api/admin/conversations');
  const allConversations = inboxFinal.body?.data?.conversations ?? [];
  const remainingTotalUnread = allConversations.reduce((sum, c) => sum + (c.totalUnread || 0), 0);
  check('All conversations unread badges reset to 0', remainingTotalUnread === 0, `Total unread: ${remainingTotalUnread}`);

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
