"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { IconChevronLeft, IconPlus } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { MobileTransactionList } from "./mobile-transaction-list";
import { MobileTransactionsSearch } from "./mobile-transactions-header";
import { TransactionFilterBar } from "./transaction-filter-bar";
import { ALL_FROM } from "./periods";
import type { Bank, Category, Goal } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { TransactionRow } from "./transaction-types";

export type TransactionsMobileProps = {
  cats: Category[];
  savingsGoals: Goal[];
  allBanks: Bank[];
  search?: string;
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  direction?: string;
  category?: string;
  account?: string;
  budgetType?: string;
  recurring?: boolean;
  min?: string;
  max?: string;
  upcomingCount: number;
  upcomingTotal: number;
  upcomingIcons: { icon: string | null; iconColor: string | null; iconBackground: string | null }[];
  filteredCount: number;
  visibleRows: TransactionRow[];
  income: number;
  expense: number;
  showMoreHref: string;
  hasMore: boolean;
};

// Mobile — streamlined card list, grouped by day
export function TransactionsMobile({
  cats,
  savingsGoals,
  allBanks,
  search,
  from,
  to,
  financialMonth,
  direction,
  category,
  account,
  budgetType,
  recurring,
  min,
  max,
  upcomingCount,
  upcomingTotal,
  upcomingIcons,
  filteredCount,
  visibleRows,
  income,
  expense,
  showMoreHref,
  hasMore,
}: TransactionsMobileProps) {
  // "Filtered" = anything other than the default all-time, no-facet view. Drives the
  // summary/results row so those only appear once the user has actually narrowed things down.
  const hasActiveFilters =
    from !== ALL_FROM ||
    !!direction ||
    !!category ||
    !!account ||
    !!budgetType ||
    !!recurring ||
    !!min ||
    !!max ||
    !!search;
  const router = useRouter();

  // This is a subpage reached from the dashboard's "Show all" — hide the bottom
  // nav for its lifetime and show a back button + title instead.
  useEffect(() => acquireNavHidden(), []);

  return (
    <>
      {/* Fixed header — back button + title, plus the filter pill row right beneath
          it. `fixed` (not `sticky`) takes it completely out of the document flow, so
          the content below can never scroll "into"/underneath it the way a sticky
          element's covered content does — the matching pt-[...] on the content
          wrapper below reserves exactly its height instead, the same technique the
          fixed search/add bar at the bottom already uses with pb-28. */}
      <div className="sticky top-0 z-40 bg-background">
        <div className="relative flex items-center px-4 pt-[calc(var(--sat)+0.75rem)]">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="shrink-0 size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-lg flex items-center justify-center"
          >
            <IconChevronLeft className="size-5 text-foreground" />
          </button>

          <h1 className="absolute left-1/2 -translate-x-1/2 text-md text-foreground truncate">
            Transactions
          </h1>
        </div>
        <div className="px-4 py-3">
          <TransactionFilterBar
            cats={cats}
            banks={allBanks}
            from={from}
            to={to}
            financialMonth={financialMonth}
            direction={direction}
            category={category}
            account={account}
            budgetType={budgetType}
            recurring={recurring}
            search={search}
          />
        </div>
      </div>

      {/* pt-[...] clears the fixed header above (back/title row + pills row) so
          content always starts fully below it — never partially hidden underneath. */}
      <div className="pt-15 px-4 pb-28 space-y-4 lg:max-w-3xl lg:mx-auto bg-background">
        {hasActiveFilters && (
          <p className="text-sm text-muted-foreground">
            Results: {filteredCount} transaction{filteredCount === 1 ? "" : "s"}
          </p>
        )}

        {/* Upcoming recurring bills for the current financial month — links to the calendar subpage */}
        {upcomingCount > 0 && (
          <Link
            href="/transactions/upcoming"
            className="flex items-center gap-3 rounded-2xl bg-[var(--dialog-content-background)] p-4 active:scale-[0.99] transition-transform"
          >
            {upcomingIcons.length > 0 && (
              <div className="flex shrink-0 -space-x-3">
                {upcomingIcons.map((u, i) => (
                  <div
                    key={i}
                    className="rounded-xl"
                    style={{ zIndex: upcomingIcons.length - i }}
                  >
                    <Icon iconKey={u.icon} color={u.iconColor} background={u.iconBackground} size="md" />
                  </div>
                ))}
              </div>
            )}
            <span className="text-base text-foreground leading-snug flex-1">
              {upcomingCount} upcoming transaction{upcomingCount === 1 ? "" : "s"}
              <br />this month
            </span>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground shrink-0">{formatEur(upcomingTotal)}</span>
          </Link>
        )}

        {/* Summary — reflects every filtered transaction, not just the visible page */}
        {hasActiveFilters && filteredCount > 0 && (
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg bg-[var(--dialog-content-background)] p-3">
              <p className="text-xs text-foreground/60 mb-1">Income</p>
              <p className="text-xl font-medium tabular-nums">{formatEur(income)}</p>
            </div>
            <div className="rounded-lg bg-[var(--dialog-content-background)] p-3">
              <p className="text-xs text-foreground/60 mb-1">Expenses</p>
              <p className="text-xl font-medium tabular-nums">{formatEur(expense)}</p>
            </div>
          </div>
        )}

        {filteredCount === 0 ? (
          <div className="rounded-2xl bg-[var(--dialog-content-background)] py-16 text-center text-muted-foreground">
            <p className="mb-7 text-sm">No transactions found</p>
            <Link href="/import" className="p-3 font-semibold bg-foreground rounded-lg text-background text-md">Import a CSV</Link>
          </div>
        ) : (
          <>
            <MobileTransactionList rows={visibleRows} categories={cats} savingsGoals={savingsGoals} />
            {hasMore && (
              <div className="text-center">
                <Link href={showMoreHref} scroll={false} className="text-sm text-primary hover:underline">
                  Show more ({filteredCount - visibleRows.length} resterend)
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fixed bar at the bottom of the subpage (the mobile nav is hidden here) — search + add. */}
      <div className="fixed bottom-[var(--sab)] left-4 right-4 z-40 flex items-center gap-3 pb-3">
        <div className="flex-1 min-w-0">
          <MobileTransactionsSearch search={search} />
        </div>
        <Link
          href="/transactions/add"
          aria-label="Add new transaction"
          className="shrink-0 size-12 rounded-full bg-white dark:bg-white/7 backdrop-blur-lg flex items-center justify-center shadow-floating shadow-primary/30 active:scale-[0.92] transition-transform"
        >
          <IconPlus className="size-5" />
        </Link>
      </div>
    </>
  );
}
