// Remove all caching logic; make service worker a no-op or pass-through
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Just fetch from network, do not use cache
  e.respondWith(fetch(e.request));
});