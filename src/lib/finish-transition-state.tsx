"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export interface FinishTransitionOptions {
  name: string;
  /** Where the ember bloom starts: the finish step's check circle (viewport px). */
  origin: { x: number; y: number; r: number } | null;
  /** What the welcome screen ticks off. */
  summary: {
    imported: number;
    bills: number;
    strategy: { needs: number; wants: number; savings: number };
  };
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

// Lets the onboarding wizard hand its "welcome to Arca" transition off to a component
// mounted in the persistent root layout (FinishTransitionOverlay), instead of rendering
// it itself. The wizard lives inside /register's page tree, which gets torn down the
// instant a client-side navigation completes — so a reveal timed to happen *inside* the
// wizard could never actually show the destination page, only an abrupt cut.
// This provider (mounted in layout.tsx, alongside the overlay) is a sibling of the page
// content, not a descendant of it, so it survives the /register → "/" navigation.
//
// The overlay doesn't guess how long the dashboard takes to fetch/render — it waits for
// the dashboard itself to report that it actually mounted (via notifyRouteReady, called
// from DashboardReadySignal at the top of src/app/page.tsx) before it reveals Home.
export function FinishTransitionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [options, setOptions] = useState<FinishTransitionOptions | null>(null);
  const [routeReadyTick, setRouteReadyTick] = useState(0);
  const tickRef = useRef(0);

  // Stable, so the overlay's effects don't restart when the provider re-renders.
  const start = useCallback((opts: FinishTransitionOptions) => {
    setOptions(opts);
    setActive(true);
  }, []);
  const stop = useCallback(() => {
    setActive(false);
    setOptions(null);
  }, []);
  const notifyRouteReady = useCallback(() => {
    tickRef.current += 1;
    setRouteReadyTick(tickRef.current);
  }, []);

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
