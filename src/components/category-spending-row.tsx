"use client";

import { useState } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import { CategorySpendingListPortal } from "@/components/category-spending-list-portal";
import { ProgressRing } from "@/components/progress-ring";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { useTranslations } from "next-intl";

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
      // md:w-full: in the desktop grid the card fills its column instead of holding a
      // fixed 160px, so five of them span the row exactly.
      className="snap-start shrink-0 w-40 md:w-full aspect-square rounded-2xl bg-card p-4 text-left flex flex-col active:scale-[0.98] transition-transform  overflow-hidden"
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
  const t = useTranslations("common");

  const visible = rows.slice(0, ROW_LIMIT);
  const hasMore = allRows.length > visible.length;

  return (
    <div className="mt-5">
      <div className="mx-6 mb-2 flex items-center justify-between">
        <p className="text-base font-semibold text-foreground">{t("spendingByCategory")}</p>
        {hasMore && (
          <button type="button" onClick={() => setShowAll(true)} className="text-sm text-muted-foreground active:opacity-70">
            View all
          </button>
        )}
      </div>
      {/* Scrollable row on mobile; from md a static 5-column grid — the shared content
          column is wide enough there to show all ROW_LIMIT cards at once, so the scroll
          (and its snapping, hidden scrollbar and trailing gutter spacer) switches off.
          px-3 at every width so the cards' outer edges line up with the Upcoming bills
          card on the dashboard, which sits at the same inset. */}
      <div className="flex gap-3 overflow-x-auto px-3 pb-1 snap-x snap-mandatory scroll-px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-5 md:overflow-visible md:snap-none">
        {visible.map((c) => (
          <CategorySpendCardButton key={c.categoryId} card={c} periodElapsedPct={periodElapsedPct} onClick={() => setSelectedId(c.categoryId)} />
        ))}

        {/* Scroll-mode only: a sixth tile would wrap the desktop grid onto a second row,
            and the header's "View all" already offers the same thing there. */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="snap-start shrink-0 w-42 aspect-square rounded-2xl bg-card p-4 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-transform md:hidden"
          >
            <div className="size-14 rounded-full bg-foreground/10 flex items-center justify-center">
              <IconArrowRight className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Show more</p>
          </button>
        )}

        {/* Restores the row's right-hand gutter, which a scroll container's padding
            collapses at the end of the scroll. Scroll-mode only — in the grid it would
            claim a whole column. */}
        <div aria-hidden className="shrink-0 w-0.5 md:hidden" />
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
