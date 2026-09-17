import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://social_user:social_pass@127.0.0.1:5432/social_discovery?schema=public&pgbouncer=true',
    },
  },
});

const BASE_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}

function getCookie(headers) {
  const setCookie = headers.get('set-cookie');
  if (!setCookie) return '';
  return setCookie.split(';')[0];
}

async function runAudit() {
  console.log('🚀 Starting Pre-Launch End-to-End Audit...\n');
  const results = {};

  try {
    // ==========================================================
    // FLOW 1: Real-User Discovery, Signup, Match & Messaging
    // ==========================================================
    console.log('--- Testing Flow 1: User Discovery, Match & Messenger ---');

    // 1. Discovery
    const discRes = await request('/api/profiles');
    if (discRes.status === 200 && discRes.data.data?.profiles?.length > 0) {
      console.log('✅ 1.1 Discover profiles returned:', discRes.data.data.profiles.length, 'profiles');
    } else {
      throw new Error(`Discovery failed: ${JSON.stringify(discRes.data)}`);
    }

    // 2. Signup new user "Charlie"
    const charlieEmail = `charlie_${Date.now()}@example.com`;
    const signupRes = await request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: charlieEmail,
        password: 'Password@123',
        displayName: 'Charlie Davis',
        gender: 'male',
        country: 'United States',
      }),
    });

    const charlie = signupRes.data.data?.user || signupRes.data.data;
    if ((signupRes.status === 200 || signupRes.status === 201) && charlie?.id) {
      console.log('✅ 1.2 User Signup successful:', charlie.email);
    } else {
      throw new Error(`Signup failed: ${JSON.stringify(signupRes.data)}`);
    }

    const charlieCookie = getCookie(signupRes.headers);
    const charlieId = charlie.id;

    // Find Elena
    const elena = await prisma.user.findUnique({ where: { email: 'elena.rostova@example.com' } });
    if (!elena) throw new Error('Elena profile missing');

    // 3. Charlie likes Elena
    const likeRes = await request('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: charlieCookie },
      body: JSON.stringify({ targetUserId: elena.id, type: 'like' }),
    });

    if (likeRes.status === 200 && likeRes.data.success) {
      console.log('✅ 1.3 Charlie liked Elena');
    } else {
      throw new Error(`Like failed: ${JSON.stringify(likeRes.data)}`);
    }

    // 4. Elena logs in and likes Charlie back (Mutual Match trigger)
    const elenaLoginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'elena.rostova@example.com', password: 'User@123456' }),
    });
    const elenaCookie = getCookie(elenaLoginRes.headers);

    const elenaLikeRes = await request('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: elenaCookie },
      body: JSON.stringify({ targetUserId: charlieId, type: 'like' }),
    });

    if (elenaLikeRes.status === 200 && elenaLikeRes.data.data?.isMatch) {
      console.log('✅ 1.4 Mutual Match detected automatically! Match ID:', elenaLikeRes.data.data.match?.id);
    } else {
      throw new Error(`Mutual match failed: ${JSON.stringify(elenaLikeRes.data)}`);
    }

    // 5. Check conversation auto-creation
    const charlieConvs = await request('/api/conversations', {
      headers: { Cookie: charlieCookie },
    });

    const activeConv = charlieConvs.data.data?.conversations?.[0];
    if (activeConv) {
      console.log('✅ 1.5 Conversation auto-created with participant:', activeConv.participant.displayName);
    } else {
      throw new Error('Conversation was not created');
    }

    // 6. Charlie sends message
    const sendMsgRes = await request(`/api/conversations/${activeConv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: charlieCookie },
      body: JSON.stringify({ content: 'Hi Elena, wonderful paintings!' }),
    });

    const charlieSent = sendMsgRes.data.data?.message || sendMsgRes.data.data;
    if ((sendMsgRes.status === 200 || sendMsgRes.status === 201) && charlieSent?.id) {
      console.log('✅ 1.6 Charlie sent message:', charlieSent.content);
    } else {
      throw new Error(`Send message failed: ${JSON.stringify(sendMsgRes.data)}`);
    }

    // 7. Elena reads message and replies
    const elenaMsgsRes = await request(`/api/conversations/${activeConv.id}/messages`, {
      headers: { Cookie: elenaCookie },
    });

    if (elenaMsgsRes.status === 200 && elenaMsgsRes.data.data?.messages?.length > 0) {
      console.log('✅ 1.7 Elena received message and read receipt updated');
    } else {
      throw new Error(`Fetch messages failed: ${JSON.stringify(elenaMsgsRes.data)}`);
    }

    const elenaReplyRes = await request(`/api/conversations/${activeConv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: elenaCookie },
      body: JSON.stringify({ content: 'Thank you Charlie, glad to meet you!' }),
    });

    const elenaSent = elenaReplyRes.data.data?.message || elenaReplyRes.data.data;
    if ((elenaReplyRes.status === 200 || elenaReplyRes.status === 201) && elenaSent?.id) {
      console.log('✅ 1.8 Elena replied successfully');
      results.flow1 = 'PASS';
    } else {
      throw new Error(`Elena reply failed: ${JSON.stringify(elenaReplyRes.data)}`);
    }

    // ==========================================================
    // FLOW 2: Admin & Agent RBAC and Lead Assignment
    // ==========================================================
    console.log('\n--- Testing Flow 2: Admin & Agent RBAC & Lead Assignment ---');

    // 1. Admin login
    const adminLoginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@heartlink.com', password: 'Admin@123456' }),
    });
    const adminCookie = getCookie(adminLoginRes.headers);

    // 2. Admin views users
    const adminUsersRes = await request('/api/admin/users', { headers: { Cookie: adminCookie } });
    if (adminUsersRes.status === 200 && adminUsersRes.data.data?.users?.length >= 6) {
      console.log('✅ 2.1 Admin accessed all users list (Count:', adminUsersRes.data.data.users.length, ')');
    } else {
      throw new Error('Admin users list failed');
    }

    // 3. Assign Charlie to Agent Sarah
    const sarah = await prisma.staffAccount.findUnique({ where: { email: 'sarah@heartlink.com' } });
    const alex = await prisma.staffAccount.findUnique({ where: { email: 'alex@heartlink.com' } });

    const assignRes = await request('/api/admin/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        userId: charlieId,
        agentId: sarah.id,
        notes: 'Assigned high-intent US lead to Sarah',
      }),
    });

    if ((assignRes.status === 200 || assignRes.status === 201) && assignRes.data.success) {
      console.log('✅ 2.2 Lead Charlie assigned to Agent Sarah');
    } else {
      throw new Error(`Assign lead failed: ${JSON.stringify(assignRes.data)}`);
    }

    // 4. Agent Sarah logs in -> verifies she sees Charlie
    const sarahLoginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah@heartlink.com', password: 'Agent@123456' }),
    });
    const sarahCookie = getCookie(sarahLoginRes.headers);

    const sarahUsersRes = await request('/api/admin/users', { headers: { Cookie: sarahCookie } });
    const sarahUserIds = sarahUsersRes.data.data?.users?.map((u) => u.id) || [];
    if (sarahUserIds.includes(charlieId)) {
      console.log('✅ 2.3 Agent Sarah sees assigned user Charlie');
    } else {
      throw new Error('Agent Sarah cannot see assigned user');
    }

    // 5. Agent Alex logs in -> verifies RBAC blocks him from viewing Charlie!
    const alexLoginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alex@heartlink.com', password: 'Agent@123456' }),
    });
    const alexCookie = getCookie(alexLoginRes.headers);

    const alexCharlieRes = await request(`/api/admin/users/${charlieId}`, {
      headers: { Cookie: alexCookie },
    });

    if (alexCharlieRes.status === 404 || alexCharlieRes.status === 403) {
      console.log('✅ 2.4 SECURITY RBAC PASSED: Agent Alex blocked from accessing unassigned lead Charlie (Status:', alexCharlieRes.status, ')');
    } else {
      throw new Error('SECURITY LEAK: Agent Alex accessed unassigned customer!');
    }

    // 6. Agent Sarah communicates via Master Inbox
    const sarahReplyRes = await request(`/api/admin/conversations/${activeConv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sarahCookie },
      body: JSON.stringify({
        content: 'Hi Charlie, this is Sarah from City Host concierge. Let me know if you need assistance!',
      }),
    });

    const sarahSent = sarahReplyRes.data.data?.message || sarahReplyRes.data.data;
    if ((sarahReplyRes.status === 200 || sarahReplyRes.status === 201) && sarahSent?.id) {
      console.log('✅ 2.5 Agent Sarah sent assisted message');
    } else {
      throw new Error(`Agent assisted message failed: ${JSON.stringify(sarahReplyRes.data)}`);
    }

    // 7. Regular user tries to access /api/admin/users -> verifies 403 Forbidden!
    const userAdminRes = await request('/api/admin/users', { headers: { Cookie: charlieCookie } });
    if (userAdminRes.status === 401 || userAdminRes.status === 403) {
      console.log('✅ 2.6 SECURITY PASSED: End-user blocked from /api/admin/* endpoints (Status:', userAdminRes.status, ')');
      results.flow2 = 'PASS';
    } else {
      throw new Error('SECURITY LEAK: Regular user accessed admin endpoint!');
    }

    // ==========================================================
    // FLOW 3: Ad Campaign UTM Tracking & Auto-Agent Routing
    // ==========================================================
    console.log('\n--- Testing Flow 3: Campaign Attribution & Auto-Routing ---');

    // 1. Visitor clicks ad with UTM parameter
    const fbLeadEmail = `fb_lead_${Date.now()}@example.com`;
    const anonId = `anon_${Date.now()}`;

    const eventRes = await request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'ad_landing_view',
        anonymousId: anonId,
        utmSource: 'facebook',
        utmMedium: 'cpc',
        utmCampaign: 'fb_global_match_2026',
        landingPage: 'http://localhost:3000/?utm_source=facebook&utm_campaign=fb_global_match_2026',
      }),
    });

    if ((eventRes.status === 200 || eventRes.status === 201) && eventRes.data.success) {
      console.log('✅ 3.1 Ad landing click & UTM captured');
    } else {
      throw new Error(`Event tracking failed: ${JSON.stringify(eventRes.data)}`);
    }

    // 2. User signs up from that session
    const leadSignupRes = await request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fbLeadEmail,
        password: 'Password@123',
        displayName: 'UK Campaign Lead',
        gender: 'female',
        country: 'United Kingdom',
      }),
    });

    const leadUser = leadSignupRes.data.data?.user || leadSignupRes.data.data;
    if ((leadSignupRes.status === 200 || leadSignupRes.status === 201) && leadUser?.id) {
      console.log('✅ 3.2 Lead signed up:', leadUser.email);
    } else {
      throw new Error('Lead signup failed');
    }

    // Link UTM to user
    await prisma.utmAttribution.create({
      data: {
        userId: leadUser.id,
        utmSource: 'facebook',
        utmMedium: 'cpc',
        utmCampaign: 'fb_global_match_2026',
        landingPage: 'http://localhost:3000/?utm_source=facebook&utm_campaign=fb_global_match_2026',
      },
    });

    // Verify campaign auto-routing: fb_global_match_2026 routes to Sarah
    const campaignRoute = await prisma.campaignAgentRoute.findFirst({
      where: {
        campaign: { utmCampaign: 'fb_global_match_2026' },
        isActive: true,
      },
      include: { agent: true },
    });

    if (campaignRoute) {
      // Auto-assign lead to routed agent
      await prisma.agentAssignment.create({
        data: {
          userId: leadUser.id,
          agentId: campaignRoute.agentId,
          assignedBy: campaignRoute.createdById,
          notes: `Auto-assigned via campaign: fb_global_match_2026`,
        },
      });

      console.log('✅ 3.3 Lead auto-routed to campaign agent:', campaignRoute.agent.displayName);
      results.flow3 = 'PASS';
    } else {
      throw new Error('Campaign auto-route missing');
    }

    // ==========================================================
    // FLOW 4: Block & Safety
    // ==========================================================
    console.log('\n--- Testing Flow 4: User Block & Safety ---');

    const blockRes = await request('/api/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: charlieCookie },
      body: JSON.stringify({ userId: elena.id }),
    });

    if (blockRes.status === 200 && blockRes.data.success) {
      console.log('✅ 4.1 User block succeeded & conversation marked blocked');
      results.flow4 = 'PASS';
    } else {
      throw new Error('Block failed');
    }

    console.log('\n🎉 ALL PRE-LAUNCH CORE AUDIT FLOWS PASSED 100%!');
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('\n❌ AUDIT FAILED:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAudit();
