// Hand-written service worker — app-shell caching only, no offline writes/background
// sync/push. Bump CACHE_NAME on any change here so old caches get cleaned up.
const CACHE_NAME = "arca-v3";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API calls or any non-GET request — a finance app must never serve
  // stale numbers, and mutations obviously can't be served from a cache at all.
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Hashed, immutable build assets + uploaded files + fonts: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/uploads/") ||
    /\.(?:woff2?|ttf|otf)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
    return;
  }

  // Page navigations: stay completely out of the way — do NOT call respondWith.
  // Any fetch we issue here (even `fetch(request)`) is service-worker-originated,
  // and on iOS standalone PWAs WebKit drops the session cookie on SW-originated
  // navigation fetches (https://bugs.webkit.org/show_bug.cgi?id=200043). The server
  // then sees no auth and bounces to /login on every navigation. By returning
  // without respondWith, the browser performs a real, credentialed navigation. The
  // cost is losing the offline-page fallback for full document loads, which is an
  // acceptable trade for not breaking auth. (Route data is still network-first below.)
  if (request.mode === "navigate") {
    return;
  }

  // Everything else GET (RSC payloads, etc.): network-only, cache fallback on
  // failure. No caching of authenticated responses.
  event.respondWith(
    fetch(request).catch(() => caches.match(request)),
  );
});
