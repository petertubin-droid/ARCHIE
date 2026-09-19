// =========================================================
// FRELUX ARCHIE STAGE 1, PWA SERVICE WORKER
//
// Scoped to /archie/ only. Caches the offline-capable shell
// (app assets); never caches Supabase API traffic, chat
// messages or authenticated responses — those always go to
// the network and fail visibly offline.
// =========================================================
const CACHE = "archie-shell-v3";
const SHELL_ASSETS = [
  "/assets/archie/manifest.webmanifest",
  "/assets/archie/archie-icon-192.png",
  "/assets/archie/archie-icon-512.png",
  "/assets/archie/archie-icon-maskable-192.png",
  "/assets/archie/archie-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// PWA update flow: the app offers "UPDATE READY — RELOAD";
// the new shell activates only when the user accepts.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GETs inside the ARCHIE scope.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/archie") && !SHELL_ASSETS.includes(url.pathname)) return;

  // Never cache API/auth traffic.
  if (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/functions/")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request)
          .then((res) => {
            // Cache successful opaque/same-origin shell responses.
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            }
            return res;
          })
          .catch(() => caches.match("/archie/chat")),
    ),
  );
});
