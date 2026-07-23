"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";

export interface FinishTransitionOptions {
  name: string;
  importResult: { imported: number; autoCategorised: number } | null;
}

interface Ctx {
  active: boolean;
  options: FinishTransitionOptions | null;
  /** Bumped every time the destination route actually mounts — see DashboardReadySignal.
   *  A counter (not a boolean) so back-to-back navigations to the same route still produce
   *  a change the overlay's effect can react to. */
  routeReadyTick: number;
  start: (opts: FinishTransitionOptions) => void;
  stop: () => void;
  notifyRouteReady: () => void;
}

const FinishTransitionContext = createContext<Ctx | null>(null);

// Lets the onboarding wizard hand its "getting things ready" loading screen off to a
// component mounted in the persistent root layout (FinishTransitionOverlay), instead of
// rendering it itself. The wizard lives inside /register's page tree, which gets torn
// down the instant a client-side navigation completes — so a fade-out timed to happen
// *inside* the wizard can never actually reveal the destination page, only an abrupt cut.
// This provider (mounted in layout.tsx, alongside the overlay) is a sibling of the page
// content, not a descendant of it, so it survives the /register → "/" navigation.
//
// The overlay doesn't guess how long the dashboard takes to fetch/render — it waits for
// the dashboard itself to report that it actually mounted (via notifyRouteReady, called
// from DashboardReadySignal at the top of src/app/page.tsx) before starting its fade.
export function FinishTransitionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [options, setOptions] = useState<FinishTransitionOptions | null>(null);
  const [routeReadyTick, setRouteReadyTick] = useState(0);
  const tickRef = useRef(0);

  function start(opts: FinishTransitionOptions) {
    setOptions(opts);
    setActive(true);
  }
  function stop() {
    setActive(false);
    setOptions(null);
  }
  function notifyRouteReady() {
    tickRef.current += 1;
    setRouteReadyTick(tickRef.current);
  }

  return (
    <FinishTransitionContext.Provider value={{ active, options, routeReadyTick, start, stop, notifyRouteReady }}>
      {children}
    </FinishTransitionContext.Provider>
  );
}

export function useFinishTransition() {
  const ctx = useContext(FinishTransitionContext);
  if (!ctx) throw new Error("useFinishTransition must be used within FinishTransitionProvider");
  return ctx;
}
