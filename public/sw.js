// Hand-written service worker — app-shell caching and Web Push (Settings ›
// Notifications), no offline writes or background sync. Dependency-free plain JS.
// Bump CACHE_NAME on any change here so old caches get cleaned up.
const CACHE_NAME = "arca-v4";
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

// A push from src/lib/push.ts: { title, body, href, id }, already written in this
// device's language. The tag is the notification id, so a notice that was rewritten
// (today's "N new transactions" growing) replaces the one already shown.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Arca";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon",
      badge: "/icon",
      tag: data.id != null ? String(data.id) : undefined,
      renotify: data.id != null,
      data: { href: typeof data.href === "string" && data.href.startsWith("/") ? data.href : "/notifications" },
    }),
  );
});

// Tapping a notification: bring an open Arca window forward on that page, or open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/notifications";
  const target = new URL(href, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((w) => (w && "navigate" in w ? w.navigate(target) : w));
      }
      return self.clients.openWindow(target);
    }),
  );
});
