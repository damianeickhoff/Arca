"use client";
import { useSyncExternalStore } from "react";

// useSyncExternalStore avoids the "setState synchronously within an effect" lint warning
// that a useState+useEffect version triggers (and the initial-render flash it caused).
function subscribe(breakpoint: number, callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function useIsMobile(breakpoint = 640) {
  return useSyncExternalStore(
    (callback) => subscribe(breakpoint, callback),
    () => window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches,
    () => false,
  );
}
