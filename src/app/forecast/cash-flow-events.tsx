"use client";

import { useState } from "react";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { formatForecastDate, type ForecastEvent } from "@/lib/cash-flow-forecast-shared";
import { TransactionDetailDialog } from "@/app/transactions/transaction-detail-dialog";
import type { TransactionDetail } from "@/app/transactions/transaction-types";
import type { Category, Goal } from "@/db/schema";

// Upcoming cash flow events, grouped by date. Two kinds of row, behaving differently
// on tap: an already-booked future transaction opens the normal transaction sheet; a
// projected recurring occurrence has no transaction yet, so it links to the recurring
// item it was projected from.
//
// Rows follow the Prognose tab's own item-card shape (icon chip, name, amount pushed
// right with ml-auto) rather than inventing a new list style.
export function CashFlowEvents({
  events,
  transactions,
  categories,
  savingsGoals,
}: {
  events: ForecastEvent[];
  /** Detail rows for the booked future transactions, so a tap can open the sheet. */
  transactions: TransactionDetail[];
  categories: Category[];
  savingsGoals: Goal[];
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const open = openId != null ? byId.get(openId) ?? null : null;

  const byDate = new Map<string, ForecastEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.date) ?? [];
    list.push(event);
    byDate.set(event.date, list);
  }

  if (events.length === 0) {
    return (
      <div className="rounded-2xl bg-[var(--dialog-content-background)] p-8 text-center text-sm text-muted-foreground">
        Nothing scheduled in the forecast period.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {[...byDate.entries()].map(([date, items]) => {
          const dayNet = items.reduce((sum, e) => sum + e.amount, 0);
          return (
            <div key={date} className="rounded-2xl bg-[var(--dialog-content-background)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground/60">{formatForecastDate(date)}</span>
                {items.length > 1 && (
                  <span className="text-xs text-foreground/40 tabular-nums">
                    {dayNet >= 0 ? "+" : "−"}{formatEur(Math.abs(dayNet))}
                  </span>
                )}
              </div>

              <div className="flex flex-col">
                {items.map((event) => {
                  const body = (
                    <>
                      <Icon iconKey={event.icon} color={event.iconColor} background={event.iconBackground} round size="sm" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium truncate">{event.name}</p>
                        {event.kind === "recurring" && <p className="text-xs text-foreground/40">Projected</p>}
                      </div>
                      <span
                        className="text-sm font-semibold tabular-nums shrink-0 ml-auto"
                        style={{ color: event.amount >= 0 ? "var(--color-income)" : "var(--color-expense)" }}
                      >
                        {event.amount >= 0 ? "+" : "−"}{formatEur(Math.abs(event.amount))}
                      </span>
                      <IconChevronRight className="size-4 text-foreground/25 shrink-0" />
                    </>
                  );
                  const rowClass = "w-full flex items-center gap-2.5 min-w-0 py-2 active:opacity-70 transition-opacity";

                  return event.transactionId != null ? (
                    <button key={event.key} type="button" onClick={() => setOpenId(event.transactionId)} className={rowClass}>
                      {body}
                    </button>
                  ) : (
                    <Link key={event.key} href="/recurring" className={rowClass}>
                      {body}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <TransactionDetailDialog
        row={open}
        categories={categories}
        savingsGoals={savingsGoals}
        onClose={() => setOpenId(null)}
        onCategorized={() => setOpenId(null)}
      />
    </>
  );
}
