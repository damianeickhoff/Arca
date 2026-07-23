"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createElement } from "react";

// The dashboard's hero entrance animations (balance count-up, wallet line
// chart draw-in) are mount-only. They're harmless on a real first load, but
// "Upcoming Bills" / "Needs review" navigate to their own routes
// (/transactions/upcoming, /transactions/needs-review) instead of opening as
// an in-page portal like the category/budget/accounts portals do — so
// navigating back remounts the dashboard's server component tree and replays
// them. This tracks "already animated once this browser session" so a
// back-navigation renders the final state immediately instead of replaying.
const SESSION_KEY = "dashboard-hero-animated";

const DashboardAnimationContext = createContext(true);

function readShouldAnimate() {
  if (typeof window === "undefined") return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) !== "1";
  } catch {
    return true;
  }
}

export function DashboardAnimationProvider({ children }: { children: ReactNode }) {
  const [shouldAnimate] = useState(readShouldAnimate);

  useEffect(() => {
    if (!shouldAnimate) return;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }
  }, [shouldAnimate]);

  return createElement(DashboardAnimationContext.Provider, { value: shouldAnimate }, children);
}

export function useDashboardShouldAnimate() {
  return useContext(DashboardAnimationContext);
}
