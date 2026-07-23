"use client";

import { useEffect } from "react";
import { useFinishTransition } from "@/lib/finish-transition-state";

// Mounted at the top of the dashboard page (src/app/page.tsx). Its only job is to tell
// FinishTransitionOverlay "the destination route has actually rendered" the instant it
// mounts, so the overlay can time its reveal fade off a real signal instead of a guessed
// delay — a fixed timeout was firing before the dashboard's own (DB-backed) render had
// finished, revealing Next's in-between blank/loading state instead of real content.
// Harmless on every other normal visit to "/" — the overlay just ignores the signal
// while it isn't active.
export function DashboardReadySignal() {
  const { notifyRouteReady } = useFinishTransition();

  useEffect(() => {
    notifyRouteReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
