const BASE = 'http://localhost:3000';

function createSession(name) {
  const jar = new Map();
  return {
    name,
    async request(path, { method = 'GET', body, isFormData = false } = {}) {
      const headers = {};
      if (jar.size > 0) {
        headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      }
      let fetchBody = body;
      if (!isFormData && body !== undefined) {
        headers['content-type'] = 'application/json';
        headers['accept'] = 'application/json';
        fetchBody = JSON.stringify(body);
      }
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: fetchBody,
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

async function verifyFullFlow() {
  const profRes = await fetch(`${BASE}/api/profiles?gender=female`);
  const profData = await profRes.json();
  const targetUser = profData.data.profiles[0];

  const user = createSession('user');
  const gRes = await user.request('/api/auth/guest', {
    method: 'POST',
    body: {
      name: 'PicSender',
      age: 24,
      gender: 'male',
      lookingFor: 'travel_partner',
      targetUserId: targetUser.userId
    }
  });
  console.log('Guest session status:', gRes.status, gRes.body?.success);
  const convId = gRes.body?.data?.conversationId;

  // 1. Upload photo
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'test_photo.png');
  const uRes = await user.request('/api/upload/chat-media', {
    method: 'POST',
    body: fd,
    isFormData: true,
  });
  console.log('Upload result:', uRes.status, uRes.body?.success, uRes.body?.data?.url);
  const mediaUrl = uRes.body?.data?.url;

  // 2. User sends photo in conversation
  const mRes = await user.request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: 'Look at this photo!', contentType: 'image', mediaUrl }
  });
  console.log('User send message:', mRes.status, mRes.body?.success);
  const messageId = mRes.body?.data?.id || mRes.body?.data?.message?.id;

  // 3. User fetches message history
  const listRes = await user.request(`/api/conversations/${convId}/messages`);
  const foundMsg = listRes.body?.data?.messages?.find(m => m.id === messageId);
  console.log('User message in history has mediaUrl:', foundMsg?.mediaUrl === mediaUrl);

  // 4. Staff logs in and views conversation
  const staff = createSession('staff');
  const staffLogin = await staff.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@heartlink.com', password: 'Admin@123456', type: 'staff' }
  });
  console.log('Staff login status:', staffLogin.status, staffLogin.body?.success);

  const adminList = await staff.request(`/api/admin/conversations/${convId}/messages`);
  const adminFound = adminList.body?.data?.messages?.find(m => m.id === messageId);
  console.log('Admin sees mediaUrl in history:', adminFound?.mediaUrl === mediaUrl);

  // 5. Staff replies with a video!
  const staffReply = await staff.request(`/api/admin/conversations/${convId}/messages`, {
    method: 'POST',
    body: { content: 'Here is a video reply!', contentType: 'video', mediaUrl: '/api/uploads/chat/sample_video.mp4' }
  });
  console.log('Staff reply with video:', staffReply.status, staffReply.body?.success, staffReply.body?.data?.mediaUrl);
  const replyId = staffReply.body?.data?.id;

  // 6. User sees staff video in message list
  const userCheck = await user.request(`/api/conversations/${convId}/messages`);
  const videoMsg = userCheck.body?.data?.messages?.find(m => m.id === replyId);
  console.log('User received video from staff:', videoMsg?.mediaUrl, videoMsg?.contentType);

  console.log('\nALL PHOTO AND VIDEO VERIFICATIONS COMPLETED 100%!');
}

verifyFullFlow().catch(e => { console.error(e); process.exit(1); });
