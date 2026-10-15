"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatEur, formatEurWhole } from "@/lib/format";
import { CategorySpendingListPortal } from "@/components/category-spending-list-portal";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import type { CategorySpendCard } from "@/components/category-spending-row";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { SectionHead } from "@/components/ui/page-heading";
import { Donut, LegendRow, CHART_COLORS } from "@/components/ui/charts";
import { cn } from "@/lib/utils";

const SHOWN = 4;

/**
 * Overview's "Spending by category": a donut of the biggest categories plus "Other",
 * with a legend underneath. Tapping a category opens its detail portal and "All
 * categories" opens the full list — the same two portals the old top-three preview
 * opened, so nothing that was reachable from here before has gone.
 */
export function SpendingDonutCard({
  visibleRows,
  allRows,
  total,
  periodShort,
  financialMonth,
  budgetPeriod,
  className,
}: {
  visibleRows: CategorySpendCard[];
  allRows: CategorySpendCard[];
  total: number;
  periodShort: string;
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
  className?: string;
}) {
  const t = useTranslations("insights.overview");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const selected = allRows.find((r) => r.categoryId === selectedId) ?? null;

  const top = visibleRows.slice(0, SHOWN);
  const shownTotal = top.reduce((s, r) => s + r.spent, 0);
  const other = Math.max(0, total - shownTotal);
  const colorOf = (row: CategorySpendCard, i: number) => row.color ?? CHART_COLORS[i % CHART_COLORS.length];
  const parts = [
    ...top.map((r, i) => ({ value: r.spent, color: colorOf(r, i) })),
    ...(other > 0.005 ? [{ value: other, color: "#A9A294" }] : []),
  ];

  return (
    <section className={cn("flex flex-col gap-3.5 rounded-card border border-line bg-surface p-[18px] shadow-card lg:px-5", className)}>
      <SectionHead title={t("byCategory")} size="sm" link={allRows.length > 0 ? t("allCategories") : undefined} onClick={allRows.length > 0 ? () => setShowAll(true) : undefined} />
      {top.length === 0 ? (
        <p className="text-[13px] text-ink-3">{t("noSpending")}</p>
      ) : (
        <div className="flex items-center gap-[18px] lg:flex-col lg:items-stretch">
          <Donut parts={parts} size={110} className="lg:hidden">
            <span className="amount text-base leading-none text-ink">{formatEurWhole(total)}</span>
            <span className="mono-label mt-1 text-[9px]">{periodShort}</span>
          </Donut>
          <div className="hidden justify-center lg:flex">
            <Donut parts={parts} size={170}>
              <span className="amount text-[22px] leading-none text-ink">{formatEurWhole(total)}</span>
              <span className="mono-label mt-1 text-[9px]">{periodShort}</span>
            </Donut>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {top.map((row, i) => (
              <LegendRow key={row.categoryId} color={colorOf(row, i)} label={row.categoryName} value={formatEur(row.spent)} onClick={() => setSelectedId(row.categoryId)} />
            ))}
            {other > 0.005 && <LegendRow color="#A9A294" label={t("other")} value={formatEur(other)} onClick={() => setShowAll(true)} />}
          </div>
        </div>
      )}

      <CategorySpendingListPortal open={showAll} rows={allRows} onClose={() => setShowAll(false)} onSelect={(id) => setSelectedId(id)} title={t("byCategory")} />
      <CategoryDetailPortal
        category={selected ? { categoryId: selected.categoryId, categoryName: selected.categoryName, color: selected.color, icon: selected.icon } : null}
        financialMonth={financialMonth}
        budgetPeriod={budgetPeriod}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}
