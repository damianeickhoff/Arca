"use client";

import { useSyncExternalStore } from "react";

// lg and up (Tailwind's 1024px): where list pages show a selected item's detail inline
// instead of opening it as a bottom sheet (Activity, Debts, Goals).
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useIsDesktop() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
}
