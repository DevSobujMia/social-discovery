import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('🚀 Starting Core Assisted Matchmaking & Messaging Test Suite...\n');

  // Helper for requests with cookies
  async function api(path, options = {}, cookie = '') {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (cookie) headers['Cookie'] = cookie;
    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    const setCookie = res.headers.get('set-cookie');
    const authCookie = setCookie ? setCookie.split(';')[0] : '';
    let json = null;
    try {
      json = await res.json();
    } catch {
      // ignore
    }
    return { status: res.status, data: json, cookie: authCookie || cookie };
  }

  // -------------------------------------------------------------
  // TEST 1: Create / verify assisted profile Maya
  // -------------------------------------------------------------
  console.log('▶ TEST 1: Verify / Create assisted profile Maya (profileOwnerType = staff_assisted)...');
  const adminAccount = await prisma.staffAccount.findUnique({ where: { email: 'admin@heartlink.com' } });
  if (!adminAccount) throw new Error('Admin account not found in database');

  const mayaPasswordHash = await bcrypt.hash('Maya@123456', 10);
  const maya = await prisma.user.upsert({
    where: { email: 'maya.lin@example.com' },
    update: { profileOwnerType: 'staff_assisted', createdByStaffId: adminAccount.id },
    create: {
      email: 'maya.lin@example.com',
      passwordHash: mayaPasswordHash,
      signupStage: 'active',
      status: 'active',
      profileOwnerType: 'staff_assisted',
      createdByStaffId: adminAccount.id,
      profile: {
        create: {
          displayName: 'Maya Lin',
          gender: 'female',
          country: 'United States',
          city: 'New York',
          bio: 'Contemporary gallery curator & boutique travel writer.',
          interests: ['Art History', 'Boutique Travel', 'Gastronomy'],
          lookingFor: 'life_partner',
          isVerified: true,
          isVisible: true,
          photos: {
            create: [
              {
                filePath: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800',
                isPrimary: true,
                uploadedBy: 'staff',
                uploadedByStaffId: adminAccount.id,
              },
            ],
          },
        },
      },
      customerRequirements: {
        create: {
          ageRangeMin: 28,
          ageRangeMax: 40,
          preferredGender: 'male',
          preferredCountries: ['United States', 'United Kingdom'],
          relationshipIntention: 'life_partner',
          interests: ['Art', 'Travel'],
          createdById: adminAccount.id,
        },
      },
    },
    include: { profile: true, customerRequirements: true },
  });

  if (maya.profileOwnerType !== 'staff_assisted') {
    throw new Error('TEST 1 Failed: Maya profileOwnerType is not staff_assisted');
  }
  console.log(`✅ TEST 1 Passed: Maya created/verified. ID: ${maya.id}, OwnerType: ${maya.profileOwnerType}, Name: ${maya.profile?.displayName}\n`);

  // -------------------------------------------------------------
  // TEST 2: Customer John registers/logs in and discovers Maya
  // -------------------------------------------------------------
  console.log('▶ TEST 2: Customer John discovers Maya...');
  const johnPassword = 'JohnPassword@123';
  const johnEmail = 'john.customer@example.com';
  const johnPasswordHash = await bcrypt.hash(johnPassword, 10);

  const john = await prisma.user.upsert({
    where: { email: johnEmail },
    update: { profileOwnerType: 'self' },
    create: {
      email: johnEmail,
      passwordHash: johnPasswordHash,
      signupStage: 'active',
      status: 'active',
      profileOwnerType: 'self',
      profile: {
        create: {
          displayName: 'John Davis',
          gender: 'male',
          country: 'United States',
          city: 'Boston',
          bio: 'Architectural engineer who loves photography and art museums.',
          interests: ['Architecture', 'Art', 'Travel'],
          lookingFor: 'life_partner',
          isVerified: true,
          isVisible: true,
        },
      },
    },
  });

  // Login as John to get auth cookie
  const johnLoginRes = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: johnEmail, password: johnPassword }),
  });
  const johnCookie = johnLoginRes.cookie;
  if (!johnCookie) throw new Error('Failed to login as John');

  // Discover profiles as John
  const discoverRes = await api('/api/profiles', { method: 'GET' }, johnCookie);
  if (!discoverRes.data?.success) throw new Error('Failed to fetch profiles for John');
  const foundMaya = discoverRes.data.data.profiles.find((p) => p.userId === maya.id);
  if (!foundMaya) throw new Error('TEST 2 Failed: John could not discover Maya in profiles');
  console.log(`✅ TEST 2 Passed: John discovered Maya (${foundMaya.displayName}, OwnerType: ${foundMaya.profileOwnerType})\n`);

  // -------------------------------------------------------------
  // TEST 3: John starts conversation with Maya
  // -------------------------------------------------------------
  console.log('▶ TEST 3: John starts conversation with Maya...');
  // Customer initiates conversation with Maya (via interaction or direct conversation route)
  const startConvRes = await api('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ targetUserId: maya.id }),
  }, johnCookie);

  if (!startConvRes.data?.success) {
    throw new Error(`TEST 3 Failed: ${JSON.stringify(startConvRes.data)}`);
  }
  const conversationId = startConvRes.data.data.conversation.id;
  const conversationRecord = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  });

  if (!conversationRecord) throw new Error('TEST 3 Failed: Conversation not found in DB');
  if (conversationRecord.type !== 'assisted') throw new Error('TEST 3 Failed: Conversation type is not assisted');
  console.log(`✅ TEST 3 Passed: Conversation established between John and Maya. ConvId: ${conversationId}, Type: ${conversationRecord.type}\n`);

  // -------------------------------------------------------------
  // TEST 4: John sends "Hi Maya"
  // -------------------------------------------------------------
  console.log('▶ TEST 4: John sends "Hi Maya"...');
  const sendMsgRes = await api(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: 'Hi Maya, great to discover your profile!' }),
  }, johnCookie);

  if (!sendMsgRes.data?.success) {
    throw new Error(`TEST 4 Failed: ${JSON.stringify(sendMsgRes.data)}`);
  }
  const johnMsg = await prisma.message.findFirst({
    where: { conversationId, senderUserId: john.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!johnMsg || johnMsg.content !== 'Hi Maya, great to discover your profile!') {
    throw new Error('TEST 4 Failed: John message not recorded in DB');
  }
  console.log(`✅ TEST 4 Passed: Message recorded. MsgId: ${johnMsg.id}, Content: "${johnMsg.content}"\n`);

  // -------------------------------------------------------------
  // TEST 5: Admin opens Master Inbox, clearly sees Customer: John ↔ Profile: Maya
  // -------------------------------------------------------------
  console.log('▶ TEST 5: Admin opens Master Inbox and verifies conversation details...');
  const adminLoginRes = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@heartlink.com', password: 'Admin@123456' }),
  });
  const adminCookie = adminLoginRes.cookie;
  if (!adminCookie) throw new Error('Failed to login as Admin');

  const adminInboxRes = await api('/api/admin/conversations', { method: 'GET' }, adminCookie);
  if (!adminInboxRes.data?.success) throw new Error('Admin failed to load Master Inbox');
  const adminConv = adminInboxRes.data.data.conversations.find((c) => c.id === conversationId);
  if (!adminConv) throw new Error('TEST 5 Failed: Admin could not find John ↔ Maya conversation in inbox');

  if (adminConv.customer?.displayName !== 'John Davis') {
    throw new Error(`TEST 5 Failed: Expected customer 'John Davis', got '${adminConv.customer?.displayName}'`);
  }
  if (adminConv.representedProfile?.displayName !== 'Maya Lin') {
    throw new Error(`TEST 5 Failed: Expected represented profile 'Maya Lin', got '${adminConv.representedProfile?.displayName}'`);
  }
  console.log(`✅ TEST 5 Passed: Admin Master Inbox clearly identifies Customer: ${adminConv.customer.displayName} ↔ Profile: ${adminConv.representedProfile.displayName} (Assisted: ${adminConv.isAssisted})\n`);

  // -------------------------------------------------------------
  // TEST 6: Admin replies on behalf of Maya
  // -------------------------------------------------------------
  console.log('▶ TEST 6: Admin replies "Hi John, nice to meet you." on behalf of Maya...');
  const adminReplyRes = await api(`/api/admin/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: 'Hi John, nice to meet you! What gallery exhibitions do you usually enjoy?',
      sentOnBehalfOf: maya.id,
    }),
  }, adminCookie);

  if (!adminReplyRes.data?.success) {
    throw new Error(`TEST 6 Failed: ${JSON.stringify(adminReplyRes.data)}`);
  }
  const replyMessageId = adminReplyRes.data.data.id;
  const adminMsgRecord = await prisma.message.findUnique({
    where: { id: replyMessageId },
  });

  if (!adminMsgRecord) throw new Error('TEST 6 Failed: Reply message not found in DB');
  if (adminMsgRecord.senderStaffId !== adminAccount.id) {
    throw new Error(`TEST 6 Failed: Expected senderStaffId ${adminAccount.id}, got ${adminMsgRecord.senderStaffId}`);
  }
  if (adminMsgRecord.sentOnBehalfOf !== maya.id) {
    throw new Error(`TEST 6 Failed: Expected sentOnBehalfOf ${maya.id}, got ${adminMsgRecord.sentOnBehalfOf}`);
  }
  if (!adminMsgRecord.isAssisted) {
    throw new Error('TEST 6 Failed: isAssisted is not true');
  }
  console.log(`✅ TEST 6 Passed: Reply saved with senderStaffId = Admin (${adminAccount.id}) & sentOnBehalfOf = Maya (${maya.id})\n`);

  // -------------------------------------------------------------
  // TEST 7: John reloads conversation and sees it as being with Maya
  // -------------------------------------------------------------
  console.log('▶ TEST 7: John reloads conversation; verifies sender is Maya (not Admin/Assistant)...');
  const johnMessagesRes = await api(`/api/conversations/${conversationId}/messages`, { method: 'GET' }, johnCookie);
  if (!johnMessagesRes.data?.success) throw new Error('John failed to fetch messages');
  const messagesList = johnMessagesRes.data.data.messages;
  const staffReplyToJohn = messagesList.find((m) => m.id === replyMessageId);

  if (!staffReplyToJohn) throw new Error('TEST 7 Failed: Staff reply not found in John view');
  if (staffReplyToJohn.isOwn !== false) throw new Error('TEST 7 Failed: Message should not be marked as John own message');
  if (staffReplyToJohn.senderName.includes('System Administrator') || staffReplyToJohn.senderName.includes('(Assistant)')) {
    throw new Error(`TEST 7 Failed: Internal operator identity exposed! senderName: "${staffReplyToJohn.senderName}"`);
  }
  if (staffReplyToJohn.senderName !== 'Maya Lin') {
    throw new Error(`TEST 7 Failed: Expected senderName 'Maya Lin', got '${staffReplyToJohn.senderName}'`);
  }
  console.log(`✅ TEST 7 Passed: Customer John sees the message coming authentically from: "${staffReplyToJohn.senderName}"\n`);

  // -------------------------------------------------------------
  // TEST 8: Verify database/audit trail records the actual Admin operator
  // -------------------------------------------------------------
  console.log('▶ TEST 8: Verify database audit log for staff-operated reply...');
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      action: 'message.send_on_behalf',
      targetId: conversationId,
      staffId: adminAccount.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!auditLog) throw new Error('TEST 8 Failed: Audit log entry not found for message.send_on_behalf');
  console.log(`✅ TEST 8 Passed: Audit log confirmed. StaffId: ${auditLog.staffId}, Action: ${auditLog.action}, TargetId: ${auditLog.targetId}, Details:`, JSON.stringify(auditLog.details), '\n');

  // -------------------------------------------------------------
  // TEST 9: Assign John to Agent Sarah; Sarah opens and replies on behalf of Maya
  // -------------------------------------------------------------
  console.log('▶ TEST 9: Assign John to Agent Sarah; Sarah opens John ↔ Maya and replies on behalf of Maya...');
  const agentSarah = await prisma.staffAccount.findUnique({ where: { email: 'sarah@heartlink.com' } });
  if (!agentSarah) throw new Error('Agent Sarah not found');

  // Admin assigns John to Sarah
  await prisma.agentAssignment.upsert({
    where: { id: `assign-${john.id}` },
    update: { agentId: agentSarah.id, status: 'active' },
    create: {
      id: `assign-${john.id}`,
      userId: john.id,
      agentId: agentSarah.id,
      assignedBy: adminAccount.id,
      status: 'active',
      notes: 'Customer John assigned to Sarah.',
    },
  });

  // Login as Agent Sarah
  const sarahLoginRes = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'sarah@heartlink.com', password: 'Agent@123456' }),
  });
  const sarahCookie = sarahLoginRes.cookie;
  if (!sarahCookie) throw new Error('Failed to login as Agent Sarah');

  // Sarah fetches conversations — should see John ↔ Maya
  const sarahInboxRes = await api('/api/admin/conversations', { method: 'GET' }, sarahCookie);
  if (!sarahInboxRes.data?.success) throw new Error('Sarah failed to fetch conversations');
  const sarahConv = sarahInboxRes.data.data.conversations.find((c) => c.id === conversationId);
  if (!sarahConv) throw new Error('TEST 9 Failed: Sarah could not see assigned customer conversation');

  // Sarah replies on behalf of Maya
  const sarahReplyRes = await api(`/api/admin/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: 'I particularly love contemporary sculpture and post-war expressionism!',
      sentOnBehalfOf: maya.id,
    }),
  }, sarahCookie);

  if (!sarahReplyRes.data?.success) {
    throw new Error(`TEST 9 Failed: Sarah failed to reply: ${JSON.stringify(sarahReplyRes.data)}`);
  }
  const sarahMsgRecord = await prisma.message.findUnique({
    where: { id: sarahReplyRes.data.data.id },
  });
  if (sarahMsgRecord.senderStaffId !== agentSarah.id) {
    throw new Error(`TEST 9 Failed: Expected senderStaffId ${agentSarah.id}, got ${sarahMsgRecord.senderStaffId}`);
  }
  if (sarahMsgRecord.sentOnBehalfOf !== maya.id) {
    throw new Error('TEST 9 Failed: sentOnBehalfOf is not Maya');
  }
  console.log(`✅ TEST 9 Passed: Agent Sarah successfully replied on behalf of Maya. SenderStaffId = Sarah (${agentSarah.id})\n`);

  // -------------------------------------------------------------
  // TEST 10: Unassigned Agent Alex receives 403 Forbidden to John's conversation
  // -------------------------------------------------------------
  console.log('▶ TEST 10: Unassigned Agent Alex attempts to access John ↔ Maya conversation (expects 403)...');
  const alexLoginRes = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'alex@heartlink.com', password: 'Agent@123456' }),
  });
  const alexCookie = alexLoginRes.cookie;
  if (!alexCookie) throw new Error('Failed to login as Agent Alex');

  // Alex attempts to GET conversation messages
  const alexGetRes = await api(`/api/admin/conversations/${conversationId}/messages`, { method: 'GET' }, alexCookie);
  if (alexGetRes.status !== 403) {
    throw new Error(`TEST 10 Failed: Expected 403 for unassigned agent GET, got status ${alexGetRes.status}`);
  }

  // Alex attempts to POST a reply
  const alexPostRes = await api(`/api/admin/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: 'Unauthorized intrusion attempt' }),
  }, alexCookie);
  if (alexPostRes.status !== 403) {
    throw new Error(`TEST 10 Failed: Expected 403 for unassigned agent POST, got status ${alexPostRes.status}`);
  }
  console.log('✅ TEST 10 Passed: Unassigned agent correctly blocked with 403 Forbidden on both GET and POST.\n');

  // -------------------------------------------------------------
  // TEST 11: Normal user-to-user matching and messaging still works
  // -------------------------------------------------------------
  const daniel = await prisma.user.findUnique({ where: { email: 'daniel.kim@example.com' } });
  const sophia = await prisma.user.findUnique({ where: { email: 'sophia.martinez@example.com' } });
  if (!daniel || !sophia) throw new Error('Mock users Daniel or Sophia not found');

  const userPasswordHash = await bcrypt.hash('User@123456', 10);
  await prisma.user.update({ where: { email: 'daniel.kim@example.com' }, data: { passwordHash: userPasswordHash, status: 'active' } });
  await prisma.user.update({ where: { email: 'sophia.martinez@example.com' }, data: { passwordHash: userPasswordHash, status: 'active' } });

  // Daniel logs in
  const danielLoginRes = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'daniel.kim@example.com', password: 'User@123456' }),
  });
  const danielCookie = danielLoginRes.cookie;
  if (!danielCookie) throw new Error(`Daniel login failed: ${JSON.stringify(danielLoginRes.data)}`);

  // Sophia logs in
  const sophiaLoginRes = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'sophia.martinez@example.com', password: 'User@123456' }),
  });
  const sophiaCookie = sophiaLoginRes.cookie;
  if (!sophiaCookie) throw new Error(`Sophia login failed: ${JSON.stringify(sophiaLoginRes.data)}`);

  // Clean any previous match/interaction between Daniel and Sophia
  const [dId, sId] = [daniel.id, sophia.id].sort();
  await prisma.conversation.deleteMany({
    where: {
      OR: [
        { match: { userAId: dId, userBId: sId } },
        { customerUserId: dId, representedProfileUserId: sId },
        { customerUserId: sId, representedProfileUserId: dId },
      ],
    },
  });
  await prisma.match.deleteMany({ where: { userAId: dId, userBId: sId } });
  await prisma.interaction.deleteMany({
    where: {
      OR: [
        { actorUserId: daniel.id, targetUserId: sophia.id },
        { actorUserId: sophia.id, targetUserId: daniel.id },
      ],
    },
  });

  const dLikeRes = await api('/api/interactions', {
    method: 'POST',
    body: JSON.stringify({ targetUserId: sophia.id, type: 'like' }),
  }, danielCookie);
  console.log('dLikeRes:', JSON.stringify(dLikeRes.data));
  if (dLikeRes.data?.data?.isMatch === true) {
    throw new Error('TEST 11 Failed: Single like between normal users should not auto-match!');
  }

  // Sophia likes Daniel back -> reciprocal match!
  const sLikeRes = await api('/api/interactions', {
    method: 'POST',
    body: JSON.stringify({ targetUserId: daniel.id, type: 'like' }),
  }, sophiaCookie);
  console.log('sLikeRes:', JSON.stringify(sLikeRes.data));
  if (sLikeRes.data?.data?.isMatch !== true) {
    throw new Error('TEST 11 Failed: Reciprocal like between normal users should create match!');
  }

  const normalConvId = sLikeRes.data?.data?.conversationId;
  if (!normalConvId) throw new Error('TEST 11 Failed: Conversation ID not returned for normal match');

  // Sophia sends message to Daniel
  const sMsgRes = await api(`/api/conversations/${normalConvId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: 'Hello Daniel! Lovely to connect.' }),
  }, sophiaCookie);
  if (!sMsgRes.data?.success) throw new Error('TEST 11 Failed: Normal message sending failed');

  // Daniel reads message
  const dMsgRes = await api(`/api/conversations/${normalConvId}/messages`, { method: 'GET' }, danielCookie);
  if (!dMsgRes.data?.success) throw new Error('TEST 11 Failed: Daniel could not read messages');
  const normalMsg = dMsgRes.data.data.messages.find((m) => m.content === 'Hello Daniel! Lovely to connect.');
  if (!normalMsg || normalMsg.senderName !== 'Sophia Martinez') {
    throw new Error(`TEST 11 Failed: Expected sender Sophia Martinez, got ${normalMsg?.senderName}`);
  }
  console.log(`✅ TEST 11 Passed: Normal user-to-user reciprocal matching and messaging functions perfectly.\n`);

  console.log('🎉 ALL 11 TESTS PASSED SUCCESSFULLY! Core workflow and RBAC fully verified.');
}

main()
  .catch((err) => {
    console.error('❌ Test Suite Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
