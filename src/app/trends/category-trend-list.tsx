"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { Segmented } from "@/components/clear/segmented";
import { Icon, softIconColors } from "@/components/icon";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { MoneyText } from "@/components/clear/money";

interface Cat {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  monthly: Record<string, number>;
  total: number;
}

interface Group {
  group: string;
  categories: Cat[];
}

/** The category's months as a line, scaled between its own lowest and highest month,
 * with a ring on the latest month. */
function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const W = 120;
  const H = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (values.length <= 1 ? W - 6 : 4 + (i / (values.length - 1)) * (W - 10));
  const y = (v: number) => H - 4 - ((v - min) / span) * (H - 8);
  const last = values.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block shrink-0" role="img" aria-label={label}>
      {values.length > 1 && (
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <circle cx={x(last)} cy={y(values[last] ?? 0)} r="3" fill="var(--clr-card)" stroke={color} strokeWidth="2" />
    </svg>
  );
}

const VISIBLE_COUNT = 7;

// Phone: category and total. md: plus the trend and the monthly average. xl: plus the
// latest month.
const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,2fr)_minmax(120px,1.4fr)_104px_104px] md:gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(120px,1.4fr)_120px_120px_120px]";

export function CategoryTrendList({
  groups,
  months,
  inProgress,
  totalExpense,
  currentLabel,
  financialMonth,
  periodRange,
  className,
}: {
  groups: Group[];
  /** The months shown, oldest first; the last one is the latest. */
  months: string[];
  /** Whether the latest month is still running ("Oct so far"). */
  inProgress: boolean;
  /** All expenses over the months shown, for each category's share. */
  totalExpense: number;
  /** The latest month's short name, already localised ("Oct"). */
  currentLabel: string;
  financialMonth: FinancialMonthConfig;
  /** The [from,to] this list's totals were computed over — passed straight through
   * as the category detail portal's default period. */
  periodRange: { from: string; to: string };
  className?: string;
}) {
  const t = useTranslations("insights.trends");
  const [sel, setSel] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const active = sel === "all" ? groups : groups.filter((g) => g.group === sel);
  const allCats = active
    .flatMap((g) => g.categories)
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const cats = expanded ? allCats : allCats.slice(0, VISIBLE_COUNT);
  const latest = months[months.length - 1];
  const groupLabel = (group: string) => (group === "nodig" ? t("needs") : t("wants"));

  return (
    <ClearCard aria-labelledby="trends-categories-title" className={className}>
      <ClearCardHeader
        title={<span id="trends-categories-title">{t("perCategory")}</span>}
        subtitle={t("perCategorySubtitle", { count: months.length })}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {groups.length > 1 && (
              <Segmented
                label={t("filterByType")}
                surface="tile"
                size="sm"
                value={sel}
                onChange={(v) => {
                  setSel(v);
                  setExpanded(false);
                }}
                items={[{ value: "all", label: t("all") }, ...groups.map((g) => ({ value: g.group, label: groupLabel(g.group) }))]}
              />
            )}
            <ClearCardLink href="/transactions">{t("seeTransactions")}</ClearCardLink>
          </div>
        }
      />

      {cats.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-clear-muted">{t("noExpenses")}</p>
      ) : (
        <div className="flex flex-col">
          <div className={cn(GRID, "hidden h-11 rounded-clear-row bg-clear-tile px-3.5 text-[13px] font-bold text-clear-ink-2 md:grid")}>
            <span>{t("category")}</span>
            <span>{t("trend", { count: months.length })}</span>
            <span className="hidden text-right xl:block">{inProgress ? t("monthSoFar", { month: currentLabel }) : currentLabel}</span>
            <span className="text-right">{t("avgMonthHeader")}</span>
            <span className="text-right">{t("total")}</span>
          </div>
          {cats.map((c) => {
            const values = months.map((m) => c.monthly[m] ?? 0);
            const avg = c.total / months.length;
            const share = totalExpense > 0 ? Math.min(100, Math.round((c.total / totalExpense) * 100)) : null;
            const line = c.color ? softIconColors(c.color).foreground : "var(--clr-ink-2)";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  GRID,
                  "min-h-[60px] w-full cursor-pointer border-b border-clear-ground px-3.5 py-2 text-left font-clear text-clear-ink transition-colors last:border-b-0 hover:rounded-clear-row hover:bg-clear-tile",
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon iconKey={c.icon} color={c.color} soft size="md" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-bold">{c.name}</span>
                    <span className="truncate text-[13px] text-clear-muted">
                      {share != null ? t("shareOfExpenses", { pct: share }) : null}
                    </span>
                  </span>
                </span>
                <span className="hidden md:block">
                  <Sparkline
                    values={values}
                    color={line}
                    label={t("sparkLabel", { name: c.name, min: formatEurWhole(Math.min(...values)), max: formatEurWhole(Math.max(...values)) })}
                  />
                </span>
                <span className="hidden text-right text-sm whitespace-nowrap tabular-nums text-clear-ink-2 xl:block"><MoneyText>{formatEur(c.monthly[latest] ?? 0)}</MoneyText></span>
                <Amount value={avg} whole className="hidden text-right text-[15px] md:block" />
                <span className="flex flex-col items-end gap-0.5">
                  <Amount value={c.total} whole className="text-[15px]" />
                  <span className="text-xs whitespace-nowrap text-clear-muted md:hidden"><MoneyText>{t("avgPerMonth", { amount: formatEurWhole(avg) })}</MoneyText></span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {allCats.length > VISIBLE_COUNT && (
        <div>
          <button type="button" onClick={() => setExpanded((v) => !v)} className={clearButtonVariants({ variant: "secondary" })}>
            {expanded ? t("showLess") : t("showMore", { count: allCats.length - VISIBLE_COUNT })}
            {expanded ? <IconChevronUp aria-hidden /> : <IconChevronDown aria-hidden />}
          </button>
        </div>
      )}

      <CategoryDetailPortal
        category={(() => {
          const c = allCats.find((cat) => cat.id === selectedId);
          return c ? { categoryId: c.id, categoryName: c.name, color: c.color, icon: c.icon } : null;
        })()}
        financialMonth={financialMonth}
        budgetPeriod={periodRange}
        onClose={() => setSelectedId(null)}
      />
    </ClearCard>
  );
}
