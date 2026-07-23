"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Keeps long-lived sessions (installed PWA, background tabs, back/forward navigation
// restoring stale router-cache payloads) from showing stale data indefinitely — refetches
// the current route whenever the app becomes visible/active again. Throttled so rapid
// visibility flaps (e.g. quick tab switches) don't trigger a refresh storm.
export function RefreshOnReturn() {
  const router = useRouter();
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    function refresh() {
      const now = Date.now();
      if (now - lastRefreshRef.current < 5000) return;
      lastRefreshRef.current = now;
      router.refresh();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") refresh();
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) refresh();
    }
    function onPopState() {
      refresh();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
    };
  }, [router]);

  return null;
}
