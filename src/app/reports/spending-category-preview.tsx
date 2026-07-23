"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { CategorySpendingListPortal } from "@/components/category-spending-list-portal";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import type { CategorySpendCard } from "@/components/category-spending-row";
import type { FinancialMonthConfig } from "@/lib/date-range";

const PREVIEW_LIMIT = 3;

// "Spending by category" preview embedded in the Analytics tab — shows the top 3
// categories inline, with a "View all" button that opens the same full-list
// portal (and category detail drill-down) as the dashboard's "Spending by
// category" row, just reached from the reports page instead.
export function SpendingCategoryPreview({
  visibleRows,
  allRows,
  financialMonth,
  budgetPeriod,
  emptyLabel,
  total,
}: {
  visibleRows: CategorySpendCard[];
  allRows: CategorySpendCard[];
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
  emptyLabel: string;
  total?: number;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const selected = allRows.find((r) => r.categoryId === selectedId) ?? null;

  const top = visibleRows.slice(0, PREVIEW_LIMIT);
  const hasMore = allRows.length > top.length;

  return (
    <div className="rounded-2xl bg-[var(--dialog-content-background)] overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2 gap-3">
        <p className="text-muted-foreground text-sm">Spending by category</p>
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-foreground/50 px-5 pb-4">{emptyLabel}</p>
      ) : (
        <>
          <div>
            {top.map((row, i) => (
              <div key={row.categoryId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.categoryId)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left active:bg-foreground/5 transition-colors"
                >
                  <Icon iconKey={row.icon} color={row.color ?? undefined} size="sm" round />
                  <span className="flex-1 min-w-0 text-sm truncate">{row.categoryName}</span>
                  {total != null && total > 0 && (
                    <span className="text-xs tabular-nums text-foreground/40 shrink-0 w-10 text-right">{((row.spent / total) * 100).toFixed(1)}%</span>
                  )}
                  <span className="text-sm tabular-nums shrink-0">{formatEur(row.spent)}</span>
                </button>
                {/* Inset divider — stops short of the card edges instead of spanning full width. */}
                {i < top.length - 1 && <div className="mx-5 border-t border-border/40" />}
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="mx-5 border-t border-border/40">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full text-center text-sm text-foreground/60 py-3 active:bg-foreground/5 transition-colors"
              >
                View all
              </button>
            </div>
          )}
        </>
      )}

      <CategorySpendingListPortal open={showAll} rows={allRows} onClose={() => setShowAll(false)} onSelect={(id) => setSelectedId(id)} />
      <CategoryDetailPortal
        category={selected ? { categoryId: selected.categoryId, categoryName: selected.categoryName, color: selected.color, icon: selected.icon } : null}
        financialMonth={financialMonth}
        budgetPeriod={budgetPeriod}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
