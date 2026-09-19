// FRELUX PROJECT CALC — Service Worker v4 (Workbox-powered precaching)
//
// This file is used as a TEMPLATE by scripts/generate-sw.mjs (workbox-build
// injectManifest). The Workbox marker below is replaced at build time
// with the actual precache manifest of all built assets.
//
// Features:
//   - Precache all built JS/CSS/font assets (workbox precache)
//   - Network-first for navigation (fresh pages, offline fallback)
//   - Stale-while-revalidate for same-origin static assets
//   - Push notification support (unchanged from v3)

// Load the Workbox runtime (v7.4.1, pinned to match workbox-build).
// Without this import, self.workbox is undefined, the SW throws at
// install and never activates, which kills precaching and the
// browser install prompt entirely.
importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/7.4.1/workbox-sw.js',
);

// ── Precache manifest (injected by workbox-build) ──────────────
const precacheManifest = self.__WB_MANIFEST || [];

const { precacheAndRoute } = self.workbox.precaching;

// Precache all built assets — this is the core upgrade from v3.
// Returning visitors load JS/CSS/fonts instantly from cache.
precacheAndRoute(precacheManifest);

// ── Runtime caching strategies ──────────────────────────────────
const CACHE_VERSION = 'frelux-v5';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Take control immediately when a new SW version deploys — a returning
// visitor with a long-lived tab must not keep running stale ad/JS code
// until every tab closes. Precache revision changes on every build, so
// this only fires when a genuinely new build is deployed.
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Clean up old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('frelux-') && !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — custom routing for navigation and static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip cross-origin requests (Supabase, analytics)
  if (url.origin !== self.location.origin) return;

  // Skip admin routes — always fetch fresh
  if (url.pathname.startsWith('/admin')) return;

  // Navigation requests — network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches
            .match(request)
            .then((cached) => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // Same-origin static assets — stale-while-revalidate
  // (Workbox precache already handles precached assets; this catches runtime)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.match(/\.(woff2|png|jpg|svg|webp|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }
});

// Listen for messages from the page
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// =========================================================
// PUSH NOTIFICATIONS (unchanged from v3)
// =========================================================

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'FRELUX', body: event.data.text() };
  }

  const title = payload.title || 'FRELUX PROJECT CALC';
  const body = payload.body || '';
  const url = payload.url || '/messages';
  const icon = payload.icon || '/icon-192.png';
  const badge = payload.badge || '/icon-192.png';
  const tag = payload.tag || 'frelux-message';

  const options = {
    body,
    icon,
    badge,
    tag,
    data: { url },
    requireInteraction: payload.requireInteraction || false,
    actions: payload.actions || [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — focus or open the relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/messages';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
