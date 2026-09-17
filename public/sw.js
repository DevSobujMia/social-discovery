/**
 * City Host service worker.
 *
 * Two jobs:
 *   1. Make the site installable, so it can sit on a lead's home screen and
 *      receive push notifications. Chromium requires a fetch handler for this.
 *   2. Deliver push notifications, which is the only free, unlimited channel
 *      we fully own for telling someone their reply arrived.
 */

const CACHE_NAME = 'cityhost-live-v3';

self.addEventListener('install', (event) => {
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

/**
 * Live network pass-through.
 * Never lock dynamic pages, HTML, or Next.js scripts in Service Worker storage.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network-first live fetch so users always get real-time deployed updates immediately
  event.respondWith(
    fetch(request).catch(() => {
      return Response.error();
    })
  );
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

  const title = payload.title || 'New message';
  const options = {
    body: payload.body || 'You have a new reply waiting.',
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'heartlink-message',
    renotify: true,
    data: { url: payload.url || '/?tab=messenger' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/?tab=messenger';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            if (typeof client.navigate === 'function') {
              return client.navigate(target).then((c) => (c && c.focus ? c.focus() : client.focus()));
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      })
  );
});
