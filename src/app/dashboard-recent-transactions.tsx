"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { TRANSFER_TYPE_LABELS } from "@/lib/transfer-types";
import { TransactionDetailDialog } from "@/app/transactions/transaction-detail-dialog";
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
    if (date === todayStr) return "Today";
    if (date === yesterdayStr) return "Yesterday";
    return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
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

  return (
    <div className="space-y-4">
      {days.map(([date, txs]) => (

        <div key={date}>
        <p className="text-xs font-medium text-foreground/60 uppercase tracking-wide mb-4 pt-5">{dayLabel(date)}</p>
          <div className="space-y-4">
            {txs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDetailRow(t)}
                className="w-full flex items-center gap-3.5 rounded-xl text-left active:bg-foreground/[0.04] transition-colors"
              >
                {(() => { const ic = resolveTransactionIcon(t); return <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} initials={ic.initials} round size="md" />; })()}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-tight">{resolveDisplayName(t)}</p>
                  {t.isInternalTransfer ? (
                    <p className="text-xs text-foreground/60 mt-0.5 truncate">
                      {(t.transferType && TRANSFER_TYPE_LABELS[t.transferType]) || "Internal transfer"}
                    </p>
                  ) : t.categoryName ? (
                    <p className="text-xs text-foreground/60 mt-0.5 truncate">{t.categoryName}</p>
                  ) : null}
                </div>
                <p className={cn(
                  "text-md font-normal tabular-nums shrink-0",
                  t.isReimbursement ? "text-amber-600" : t.direction === "income" ? "text-green-500 dark:text-emerald-400" : "text-foreground",
                )}>
                  {formatEur(t.amount)}
                </p>
              </button>
            ))}
          </div>
        </div>
      ))}

      <TransactionDetailDialog
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
