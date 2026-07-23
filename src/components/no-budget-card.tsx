"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { useBudgetPortal } from "@/lib/budget-portal-state";

const STORAGE_KEY = "arca:no-budget-card-dismissed";

type Dismissal = { until: number | null };

function readDismissal(): Dismissal | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Dismissal;
    if (parsed.until === null || Date.now() < parsed.until) return parsed;
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

// Shown on the dashboard in place of the budget-progress alert card when no
// overall budget is set yet (mirrors BudgetPortal's own `!data.budget` empty
// check). Tapping it jumps straight into the create-budget flow; the X lets the
// user suspend the prompt for 7 days or for good, remembered in localStorage
// (per-device — see the CLAUDE.md instructions for why this stays client-only).
export function NoBudgetCard() {
  const { openBudgetCreate } = useBudgetPortal();
  // "checking" until the mount effect below reads localStorage — avoids an
  // SSR/hydration mismatch (the server has no way to know the dismissal state).
  const [status, setStatus] = useState<"checking" | "dismissed" | "visible">("checking");
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage, not derivable from props/state
    setStatus(readDismissal() != null ? "dismissed" : "visible");
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  function suspend(days: number | null) {
    const value: Dismissal = days === null ? { until: null } : { until: Date.now() + days * 24 * 60 * 60 * 1000 };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // localStorage unavailable (private browsing etc.) — dismissal just won't persist
    }
    setStatus("dismissed");
    setMenuOpen(false);
  }

  if (status !== "visible") return null;

  return (
    <div ref={ref} className="relative mx-3 mt-5 rounded-2xl bg-card p-6 text-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        aria-label="Dismiss"
        className="absolute top-3 right-3 size-7 rounded-full flex items-center justify-center text-foreground/60 active:scale-95 transition-transform"
      >
        <IconX className="size-3.5" />
      </button>

      {menuOpen && (
        <div className="absolute top-11 right-3 z-10 w-48 rounded-xl bg-[#232327] shadow-lg overflow-hidden text-left">
          <button
            type="button"
            onClick={() => suspend(7)}
            className="w-full px-4 py-3 text-sm text-foreground active:bg-white/5 transition-colors"
          >
            Hide for 7 days
          </button>
          <button
            type="button"
            onClick={() => suspend(null)}
            className="w-full px-4 py-3 text-sm text-foreground active:bg-white/5 transition-colors border-t border-white/5"
          >
            Hide permanently
          </button>
        </div>
      )}

      <p className="text-md text-foreground/55 max-w-[240px] mx-auto">
        Create a budget to stay on top of your finances.
      </p>
      <button
        type="button"
        onClick={openBudgetCreate}
        className="mt-4 h-11 px-6 rounded-full bg-foreground/10 text-foreground font-semibold text-sm active:scale-[0.97] transition-transform"
      >
        Create budget
      </button>
    </div>
  );
}
