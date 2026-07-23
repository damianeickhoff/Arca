"use client";

import { useEffect } from "react";

// Production-only: dev-server HMR and a caching service worker fight each other
// constantly, so registering in development just causes stale-bundle confusion.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    // When a newly-installed SW calls skipWaiting() + clients.claim(), the browser
    // fires controllerchange. Reload once so the page is served by (and behaves
    // like) the new worker — this is what lets a fix ship without users having to
    // delete and re-add the installed PWA on iOS.
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        // Proactively check for a new sw.js on load and whenever the app is brought
        // back to the foreground, so long-lived installed PWAs don't stay pinned to
        // a stale worker for days.
        reg.update().catch(() => {});
        const onVisible = () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch(() => {
        // Registration failures (unsupported browser, blocked storage, etc.) are non-fatal.
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
