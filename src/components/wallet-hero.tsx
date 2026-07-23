"use client";

import { useState } from "react";
import { AnimatedEur } from "@/components/animated-eur";
import { WalletBalanceLineChart } from "@/components/dashboard-charts";

interface HeroAccount {
  id: string;
  name: string;
  balance: number;
}

interface HistoryPoint {
  date: string;
  balance: number;
}

// The dashboard's gradient hero used to show only period cash flow (income − expense).
// Tapping the big amount now cycles — in a loop, no swipe/indicators — through: cash
// flow, total account balance, then each individual account's own balance. Only the
// first two views have a matching history line (the per-period net flow and the
// 180-day total-balance series); individual accounts have no stored history, so the
// chart area just collapses for those.
export function WalletHero({
  cashflowBalance,
  periodLabel,
  walletHistory,
  totalBalance,
  accountHistory,
  accounts,
}: {
  cashflowBalance: number;
  periodLabel: string;
  walletHistory: HistoryPoint[];
  totalBalance: number;
  accountHistory: HistoryPoint[];
  accounts: HeroAccount[];
}) {
  const [viewIndex, setViewIndex] = useState(0);
  const viewCount = 2 + accounts.length;

  const view =
    viewIndex === 0
      ? { label: "Cash flow", value: cashflowBalance, history: walletHistory }
      : viewIndex === 1
        ? { label: "Total balance", value: totalBalance, history: accountHistory }
        : { label: accounts[viewIndex - 2].name, value: accounts[viewIndex - 2].balance, history: [] as HistoryPoint[] };

  function nextView() {
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
          <WalletBalanceLineChart data={view.history} />
        </div>
      )}
    </div>
  );
}
