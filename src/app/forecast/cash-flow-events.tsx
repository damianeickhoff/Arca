"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { formatEur } from "@/lib/format";
import { type ForecastEvent } from "@/lib/cash-flow-forecast-shared";
import { TransactionPanelSheet } from "@/app/transactions/_activity/transaction-panel-sheet";
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
  const t = useTranslations("insights.forecast");
  const locale = useLocale();
  const fmtDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long" });
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
      <div className="rounded-row bg-surface-2 p-8 text-center text-[13px] text-ink-3">
        {t("nothingScheduled")}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {[...byDate.entries()].map(([date, items]) => {
          const dayNet = items.reduce((sum, e) => sum + e.amount, 0);
          return (
            <div key={date} className="rounded-row bg-surface-2 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="mono-label text-[10px]">{fmtDate(date)}</span>
                {items.length > 1 && (
                  <span className="text-xs tabular-nums text-ink-3">
                    {dayNet >= 0 ? "+" : "−"}{formatEur(Math.abs(dayNet))}
                  </span>
                )}
              </div>

              <div className="flex flex-col">
                {items.map((event) => {
                  const body = (
                    <>
                      <CategoryIcon icon={event.icon} color={event.iconColor} size="sm" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="truncate text-sm font-semibold text-ink">{event.name}</p>
                        {event.kind === "recurring" && <p className="text-xs text-ink-3">{t("projected")}</p>}
                      </div>
                      <span className={event.amount >= 0 ? "ml-auto shrink-0 text-sm font-semibold tabular-nums text-positive" : "ml-auto shrink-0 text-sm font-semibold tabular-nums text-ink"}>
                        {event.amount >= 0 ? "+" : "−"}{formatEur(Math.abs(event.amount))}
                      </span>
                      <IconChevronRight className="size-4 shrink-0 text-ink-3" />
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

      <TransactionPanelSheet
        row={open}
        categories={categories}
        savingsGoals={savingsGoals}
        onClose={() => setOpenId(null)}
        onCategorized={() => setOpenId(null)}
      />
    </>
  );
}
