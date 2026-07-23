"use client";

import { useState } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import { CategorySpendingListPortal } from "@/components/category-spending-list-portal";
import { ProgressRing } from "@/components/progress-ring";
import type { FinancialMonthConfig } from "@/lib/date-range";

export interface CategorySpendCard {
  categoryId: number;
  categoryName: string;
  color: string | null;
  icon: string | null;
  spent: number;
  budget: number | null;
  pct: number | null; // null when the category has no budget set
  excluded: boolean; // hidden from the row itself, but still listed (and re-includable) from "View all"
}

const ROW_LIMIT = 5;

export function CategorySpendCardButton({ card, periodElapsedPct, onClick }: { card: CategorySpendCard; periodElapsedPct: number; onClick: () => void }) {
  const over = card.pct != null && card.pct > 1;
  return (
    <button
      type="button"
      onClick={onClick}
      className="snap-start shrink-0 w-40 aspect-square rounded-2xl bg-card p-4 text-left flex flex-col active:scale-[0.98] transition-transform  overflow-hidden"
    >
    <ProgressRing pct={card.pct != null ? card.pct * 100 : null} periodElapsedPct={periodElapsedPct} color={card.color}>
      <Icon iconKey={card.icon} color={card.color ?? undefined} size="lg" round />
    </ProgressRing>

    <p className="mt-3 text-sm font-medium text-foreground truncate">
      {card.categoryName}
    </p>

    <div className="mt-auto">
      <p className="text-sm font-semibold text-foreground tabular-nums">{formatEur(card.spent)}</p>
      {card.budget != null ? (
        over ? (
          <p className="text-sm text-[var(--color-expense)] tabular-nums">/ {formatEur(card.spent - card.budget)} over</p>
        ) : (
          <p className="text-sm text-foreground/40 tabular-nums">of {formatEur(card.budget)}</p>
        )
      ) : (
        <p className="text-sm text-foreground/40">No limit</p>
      )}
    </div>
    </button>
  );
}

// Owns the tap-to-open-detail state for the dashboard's "Spending by category" row —
// same pattern as DebtsInteractive (src/app/debts/debts-interactive.tsx): tracks the
// selected id (not the row object) so the detail portal's header/icon stay in sync
// with fresh server data after router.refresh() following an edit.
//
// `rows` (already excludes hidden categories) drives the row itself; `allRows`
// (every category with spend, hidden or not) drives the "View all" list so a hidden
// category can still be found and re-included from there.
export function CategorySpendingRow({
  rows,
  allRows,
  periodElapsedPct,
  financialMonth,
  budgetPeriod,
}: {
  rows: CategorySpendCard[];
  allRows: CategorySpendCard[];
  periodElapsedPct: number;
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const selected = allRows.find((r) => r.categoryId === selectedId) ?? null;

  const visible = rows.slice(0, ROW_LIMIT);
  const hasMore = allRows.length > visible.length;

  return (
    <div className="mt-5">
      <div className="mx-3 mb-2 flex items-center justify-between">
        <p className="text-base font-semibold text-foreground">Spending by category</p>
        {hasMore && (
          <button type="button" onClick={() => setShowAll(true)} className="text-sm text-muted-foreground active:opacity-70">
            View all
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pl-3 pr-3 pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((c) => (
          <CategorySpendCardButton key={c.categoryId} card={c} periodElapsedPct={periodElapsedPct} onClick={() => setSelectedId(c.categoryId)} />
        ))}

        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="snap-start shrink-0 w-42 aspect-square rounded-2xl bg-card p-4 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <div className="size-14 rounded-full bg-foreground/10 flex items-center justify-center">
              <IconArrowRight className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Show more</p>
          </button>
        )}
      </div>

      <CategorySpendingListPortal
        open={showAll}
        rows={allRows}
        onClose={() => setShowAll(false)}
        onSelect={(id) => setSelectedId(id)}
      />

      <CategoryDetailPortal
        category={selected ? { categoryId: selected.categoryId, categoryName: selected.categoryName, color: selected.color, icon: selected.icon } : null}
        financialMonth={financialMonth}
        budgetPeriod={budgetPeriod}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
