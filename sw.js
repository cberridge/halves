// Service worker: caches the app shell so Halves opens instantly and works offline.
// Firestore handles data offline itself, so API traffic is never intercepted here.
// Bump VERSION whenever you deploy, so phones pick up the new files.
const VERSION = 'halves-v1';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/money.js',
  './js/config.js',
  './js/firebase-backend.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Firebase SDK files from the CDN are versioned and immutable: cache-first.
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      })),
    );
    return;
  }

  // Same-origin app files: serve from cache, refresh in the background (stale-while-revalidate).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
        const network = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => hit);
        return hit || network;
      }),
    );
  }
  // Everything else (Firestore, Auth) goes straight to the network.
});
