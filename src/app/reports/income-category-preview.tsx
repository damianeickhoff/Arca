"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionHead } from "@/components/ui/page-heading";
import { CategoryIcon } from "@/components/ui/category-icon";
import { formatEur } from "@/lib/format";
import { CategorySpendingListPortal } from "@/components/category-spending-list-portal";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import type { CategorySpendCard } from "@/components/category-spending-row";
import type { FinancialMonthConfig } from "@/lib/date-range";

const PREVIEW_LIMIT = 3;

// "Income by category" preview — same shape as SpendingCategoryPreview, just
// pointed at the income-flavored list/detail portals (direction="income").
export function IncomeCategoryPreview({
  rows,
  financialMonth,
  budgetPeriod,
  emptyLabel,
  total,
}: {
  rows: CategorySpendCard[];
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
  emptyLabel: string;
  total?: number;
}) {
  const t = useTranslations("insights.overview");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const selected = rows.find((r) => r.categoryId === selectedId) ?? null;

  const top = rows.slice(0, PREVIEW_LIMIT);
  const hasMore = rows.length > top.length;

  return (
    <section className="flex flex-col gap-2 rounded-card border border-line bg-surface px-[18px] pb-2 pt-[18px] shadow-card lg:px-5">
      <SectionHead title={t("incomeByCategory")} size="sm" link={hasMore ? t("viewAll") : undefined} onClick={hasMore ? () => setShowAll(true) : undefined} />
      {top.length === 0 ? (
        <p className="pb-2 text-[13px] text-ink-3">{emptyLabel}</p>
      ) : (
        <>
          <div>
            {top.map((row, i) => (
              <div key={row.categoryId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.categoryId)}
                  className="-mx-2 flex min-h-[52px] w-[calc(100%+1rem)] items-center gap-3 rounded-row px-2 text-left transition-colors hover:bg-surface-2"
                >
                  <CategoryIcon icon={row.icon} color={row.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{row.categoryName}</span>
                  {total != null && total > 0 && (
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-3">{((row.spent / total) * 100).toFixed(1)}%</span>
                  )}
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-positive">+{formatEur(row.spent)}</span>
                </button>
                {i < top.length - 1 && <div className="border-t border-line" />}
              </div>
            ))}
          </div>
        </>
      )}

      <CategorySpendingListPortal open={showAll} rows={rows} onClose={() => setShowAll(false)} onSelect={(id) => setSelectedId(id)} title={t("incomeByCategory")} />
      <CategoryDetailPortal
        category={selected ? { categoryId: selected.categoryId, categoryName: selected.categoryName, color: selected.color, icon: selected.icon } : null}
        financialMonth={financialMonth}
        budgetPeriod={budgetPeriod}
        onClose={() => setSelectedId(null)}
        direction="income"
      />
    </section>
  );
}
