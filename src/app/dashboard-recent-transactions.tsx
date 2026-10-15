"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconReload } from "@tabler/icons-react";
import { AnchoredTip } from "@/components/anchored-tip";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { TRANSFER_TYPE_LABELS } from "@/lib/transfer-types";
import { TransactionPanelSheet } from "@/app/transactions/_activity/transaction-panel-sheet";
import type { Category, Goal } from "@/db/schema";
import type { TransactionDetail } from "@/app/transactions/transaction-types";

// The dashboard "Recent transactions" list — tapping a row opens the shared
// detail dialog right here, instead of navigating to the transactions subpage.
export function DashboardRecentTransactions({
  recent,
  categories,
  savingsGoals,
}: {
  recent: TransactionDetail[];
  categories: Category[];
  savingsGoals: Goal[];
}) {
  // `tl`, not `t`: the row callbacks below already use `t` for the transaction.
  const tl = useTranslations("home.latest");
  const locale = useLocale();
  const [detailRow, setDetailRow] = useState<TransactionDetail | null>(null);
  const [categoryOverrides, setCategoryOverrides] = useState<Map<number, number | null>>(new Map());

  // Local-date (not UTC) so the Today/Yesterday split matches the user's own calendar day,
  // and computed once via lazy init rather than during render (impure `new Date()` on every
  // render trips React's "no impure calls during render" check).
  const [{ todayStr, yesterdayStr }] = useState(() => {
    const toLocalDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return { todayStr: toLocalDateStr(now), yesterdayStr: toLocalDateStr(yesterday) };
  });
  function dayLabel(date: string) {
    if (date === todayStr) return tl("today");
    if (date === yesterdayStr) return tl("yesterday");
    return new Date(date + "T00:00:00").toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  }

  function resolveRow(t: TransactionDetail): TransactionDetail {
    if (!categoryOverrides.has(t.id)) return t;
    const overrideId = categoryOverrides.get(t.id) ?? null;
    const overrideCat = categories.find((c) => c.id === overrideId);
    return {
      ...t,
      categoryId: overrideId,
      categoryName: overrideCat?.name ?? null,
      categoryColor: overrideCat?.color ?? null,
      categoryIcon: overrideCat?.icon ?? null,
      categoryBudgetType: overrideCat?.budgetType ?? null,
    };
  }

  const byDate = new Map<string, TransactionDetail[]>();
  for (const raw of recent) {
    const t = resolveRow(raw);
    const list = byDate.get(t.date) ?? [];
    list.push(t);
    byDate.set(t.date, list);
  }
  const days = Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 2);

  // The very first row carries the pointer tip's anchor — one row is enough to make
  // the point, and it's the one guaranteed to be above the fold.
  const firstRowId = days[0]?.[1][0]?.id;

  return (
    <div className="flex flex-col gap-4 py-3">
      {/* Held back while the detail sheet is open — the tip is about opening it. */}
      <AnchoredTip id="transactionDetail" anchor="transactionRow" active={detailRow == null} />

      {days.map(([date, txs]) => (

        <div key={date} className="flex flex-col gap-1">
          <p className="mono-label">{dayLabel(date)}</p>
          <div className="flex flex-col">
            {txs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDetailRow(t)}
                data-tip-anchor={t.id === firstRowId ? "transactionRow" : undefined}
                className="flex min-h-[58px] w-full items-center gap-3 rounded-row text-left transition-colors active:bg-surface-2"
              >
                {(() => { const ic = resolveTransactionIcon(t); return (
                  <div className="relative shrink-0">
                    <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} initials={ic.initials} round size="md" />
                    {/* Same recurring marker as the transactions list. */}
                    {t.recurringItemId != null && (
                      <span
                        aria-label={tl("recurring")}
                        className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-ink"
                      >
                        <IconReload className="size-3 text-bg" stroke={2.5} />
                      </span>
                    )}
                  </div>
                ); })()}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight text-ink">{resolveDisplayName(t)}</p>
                  {t.isInternalTransfer ? (
                    <p className="mt-[3px] truncate text-xs text-ink-3">
                      {(t.transferType && TRANSFER_TYPE_LABELS[t.transferType]) || tl("internalTransfer")}
                    </p>
                  ) : t.categoryName ? (
                    <p className="mt-[3px] truncate text-xs text-ink-3">{t.categoryName}</p>
                  ) : null}
                </div>
                <p className={cn(
                  "shrink-0 text-[15px] font-semibold tabular-nums tracking-[-0.01em]",
                  t.isReimbursement ? "text-warning" : t.direction === "income" ? "text-positive" : "text-ink",
                )}>
                  {formatEur(t.amount)}
                </p>
              </button>
            ))}
          </div>
        </div>
      ))}

      <TransactionPanelSheet
        row={detailRow}
        categories={categories}
        savingsGoals={savingsGoals}
        onClose={() => setDetailRow(null)}
        onCategorized={(_prev, _name, newId) => {
          if (detailRow) setCategoryOverrides((m) => new Map(m).set(detailRow.id, newId));
        }}
      />
    </div>
  );
}
