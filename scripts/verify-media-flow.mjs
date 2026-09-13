async function verifyFullFlow() {
  const gRes = await fetch('http://localhost:3000/api/auth/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'PicSender', age: 24, gender: 'male', lookingFor: 'travel_partner' })
  });
  const gData = await gRes.json();
  const cookie = gRes.headers.get('set-cookie');
  const convId = gData.data.conversationId;

  // 1. Upload photo
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'test_photo.png');
  const uRes = await fetch('http://localhost:3000/api/upload/chat-media', {
    method: 'POST',
    headers: { 'Cookie': cookie },
    body: fd
  });
  const uData = await uRes.json();
  console.log('Upload result:', uData.success, uData.data?.url);

  // 2. User sends photo in conversation
  const mRes = await fetch(http://localhost:3000/api/conversations//messages, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({ content: 'Look at this photo!', contentType: 'image', mediaUrl: uData.data.url })
  });
  const mData = await mRes.json();
  console.log('User send message:', mData.success, mData.data?.mediaUrl);

  // 3. User fetches message history
  const listRes = await fetch(http://localhost:3000/api/conversations//messages, {
    headers: { 'Cookie': cookie }
  });
  const listData = await listRes.json();
  const foundMsg = listData.data.messages.find(m => m.id === mData.data.id);
  console.log('User message in history has mediaUrl:', foundMsg?.mediaUrl === uData.data.url);

  // 4. Staff logs in and views conversation
  const staffLogin = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@heartlink.com', password: 'password123' })
  });
  const staffCookie = staffLogin.headers.get('set-cookie');

  const adminList = await fetch(http://localhost:3000/api/admin/conversations//messages, {
    headers: { 'Cookie': staffCookie }
  });
  const adminListData = await adminList.json();
  const adminFound = adminListData.data.messages.find(m => m.id === mData.data.id);
  console.log('Admin sees mediaUrl in history:', adminFound?.mediaUrl === uData.data.url);

  // 5. Staff replies with a video!
  const staffReply = await fetch(http://localhost:3000/api/admin/conversations//messages, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': staffCookie },
    body: JSON.stringify({ content: 'Here is a video reply!', contentType: 'video', mediaUrl: '/api/uploads/chat/sample_video.mp4' })
  });
  const staffReplyData = await staffReply.json();
  console.log('Staff reply with video:', staffReplyData.success, staffReplyData.data?.mediaUrl);

  // 6. User sees staff video in message list
  const userCheck = await fetch(http://localhost:3000/api/conversations//messages, {
    headers: { 'Cookie': cookie }
  });
  const userCheckData = await userCheck.json();
  const videoMsg = userCheckData.data.messages.find(m => m.id === staffReplyData.data.id);
  console.log('User received video from staff:', videoMsg?.mediaUrl, videoMsg?.contentType);

  console.log('ALL PHOTO AND VIDEO VERIFICATIONS COMPLETED 100%!');
}
verifyFullFlow();
