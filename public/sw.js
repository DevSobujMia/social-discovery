/**
 * City Host service worker.
 *
 * Two jobs:
 *   1. Make the site installable, so it can sit on a lead's home screen and
 *      receive push notifications. Chromium requires a fetch handler for this.
 *   2. Deliver push notifications, which is the only free, unlimited channel
 *      we fully own for telling someone their reply arrived.
 */

self.addEventListener('install', () => {
  // Immediately activate new service worker without waiting
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Completely clear all old caches (including stale HTML/bundles from previous versions)
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});



self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'New message on City Host';
  const conversationId = payload.conversationId || payload.data?.conversationId || null;
  const token = payload.token || payload.data?.token || null;

  const options = {
    body: payload.body || 'You have a new reply waiting.',
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || (conversationId ? `cityhost-chat-${conversationId}` : 'cityhost-message'),
    renotify: true,
    vibrate: payload.vibrate || [150, 80, 150],
    data: {
      url: payload.url || (conversationId ? `/?tab=messenger&chat=${encodeURIComponent(conversationId)}` : '/?tab=messenger'),
      conversationId,
      token,
    },
    actions: [
      {
        action: 'reply',
        type: 'text',
        title: 'Reply',
        placeholder: 'Type a reply...',
      },
      {
        action: 'open',
        title: 'Open Chat',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const conversationId = data.conversationId || null;
  const token = data.token || null;

  // Direct quick-reply without opening the app window
  if (event.action === 'reply' && event.reply) {
    const text = (event.reply || '').trim();
    if (text && conversationId) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const sendPromise = fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ content: text }),
      })
        .then(async (res) => {
          if (res.ok) {
            self.registration.showNotification('Reply sent', {
              body: text,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: 'reply-sent',
              silent: true,
            });
          }
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          for (const client of clients) {
            client.postMessage({
              type: 'cityhost:message-sent',
              conversationId,
              content: text,
            });
          }
        })
        .catch((err) => console.error('[SW] Quick reply failed:', err));

      event.waitUntil(sendPromise);
      return;
    }
  }

  const target =
    data.url ||
    (conversationId ? `/?tab=messenger&chat=${encodeURIComponent(conversationId)}` : '/?tab=messenger');

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({
              type: 'cityhost:open-chat',
              conversationId,
              url: target,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      })
  );
});
