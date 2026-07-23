"use client";

import { useState } from "react";
import { AnimatedEur } from "@/components/animated-eur";
import { WalletBalanceLineChart } from "@/components/dashboard-charts";

interface HistoryPoint {
  date: string;
  balance: number;
}

// The dashboard's gradient hero. Tapping the big amount toggles — in a loop, no
// swipe/indicators — between period cash flow (income − expense) and the total
// account balance. Each view has its own history line: the per-period net flow
// and the 180-day total-balance series.
export function WalletHero({
  cashflowBalance,
  periodLabel,
  walletHistory,
  totalBalance,
  accountHistory,
}: {
  cashflowBalance: number;
  periodLabel: string;
  walletHistory: HistoryPoint[];
  totalBalance: number;
  accountHistory: HistoryPoint[];
}) {
  const [viewIndex, setViewIndex] = useState(0);
  // Once the user taps to switch views, replay the line's draw-in on every toggle.
  // Stays off for the very first render so the session-scoped initial-load guard
  // (and back-navigation) still decides whether the entrance animation plays.
  const [interacted, setInteracted] = useState(false);
  const viewCount = 2;

  const view =
    viewIndex === 0
      ? { label: "Cash flow", value: cashflowBalance, history: walletHistory }
      : { label: "Total balance", value: totalBalance, history: accountHistory };

  function nextView() {
    setInteracted(true);
    setViewIndex((i) => (i + 1) % viewCount);
  }

  return (
    <div className="mt-30 py-3">
      <button
        type="button"
        onClick={nextView}
        aria-label={`Showing ${view.label} — tap to switch`}
        className="w-full active:opacity-80 transition-opacity"
      >
        <p className="text-center text-xs font-semibold text-white/60 dark:text-muted-foreground mb-1 uppercase tracking-wide truncate px-6">
          {view.label}
        </p>
        <p className="text-6xl text-center tabular-nums font-medium tracking-tight mb-2 mt-2 text-white">
          <AnimatedEur value={view.value} />
        </p>
      </button>
      <p className="text-center text-xs text-white/50 dark:text-muted-foreground mb-8">{periodLabel}</p>

      {view.history.length > 1 && (
        <div className="h-28">
          {/* Remount per view so Recharts replays its draw-in on each toggle. */}
          <WalletBalanceLineChart
            key={viewIndex}
            data={view.history}
            animate={interacted ? true : undefined}
          />
        </div>
      )}
    </div>
  );
}
