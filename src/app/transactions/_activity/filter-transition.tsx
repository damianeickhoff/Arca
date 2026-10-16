"use client";

import { createContext, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ActivityNavigation {
  /** Navigate to another filter / sort / search combination of Activity. */
  navigate: (href: string) => void;
  /** True while the new results are loading: the list dims until they arrive. */
  pending: boolean;
}

const ActivityNavigationContext = createContext<ActivityNavigation | null>(null);

/**
 * Wraps Activity so every filter change (chips, period, sort, search, "Clear all
 * filters") runs as one transition: the list dims while the server works and the new
 * results fade in, instead of everything jumping at once.
 */
export function ActivityNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (href: string) => startTransition(() => router.push(href, { scroll: false }));
  return <ActivityNavigationContext.Provider value={{ navigate, pending }}>{children}</ActivityNavigationContext.Provider>;
}

/** Activity's navigation; outside the provider it falls back to a plain router.push. */
export function useActivityNavigation(): ActivityNavigation {
  const ctx = useContext(ActivityNavigationContext);
  const router = useRouter();
  return ctx ?? { navigate: (href) => router.push(href, { scroll: false }), pending: false };
}
