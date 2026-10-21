"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { MoneyText } from "@/components/clear/money";
import { Segmented } from "@/components/clear/segmented";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import { Icon, softIconColors } from "@/components/icon";
import { changeTone } from "@/lib/trends";
import { formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinancialMonthConfig } from "@/lib/date-range";

export interface ExpenseRow {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  group: "needs" | "wants";
  values: number[];
  total: number;
  avg: number;
  current: number | null;
  vsBefore: number | null;
  spike: boolean;
  /** "38% of expenses · needs" or "20% · Albert Heijn, Jumbo" — already translated. */
  meta: string;
  /** "due 25 Oct" — already translated, when nothing was spent yet this month. */
  due: string | null;
}

/** Sign first with a real minus: "+€46", "−€55". */
function signed(v: number) {
  const r = Math.round(v);
  return `${r < 0 ? "−" : "+"}${formatEurWhole(Math.abs(r))}`;
}

/** The months as a line between the category's own lowest and highest month; the
 *  running month's part dashed with a ring on it, so a dip is not read as savings. */
function Sparkline({ values, running, color, label }: { values: number[]; running: boolean; color: string; label: string }) {
  const W = 120;
  const H = 28;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const x = (i: number) => (values.length <= 1 ? W - 4 : 4 + (i / (values.length - 1)) * (W - 8));
  const y = (v: number) => H - 4 - ((v - min) / span) * (H - 8);
  const solidEnd = running ? values.length - 1 : values.length;
  const pts = (from: number, to: number) => values.slice(from, to).map((v, i) => `${x(from + i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block shrink-0" role="img" aria-label={label}>
      {solidEnd > 1 && <polyline points={pts(0, solidEnd)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {running && last > 0 && <polyline points={pts(last - 1, last + 1)} fill="none" stroke={color} strokeWidth="2" strokeDasharray="3 3" />}
      <circle cx={x(last)} cy={y(values[last] ?? 0)} r="3" fill="var(--clr-card)" stroke={color} strokeWidth="2" />
    </svg>
  );
}

// Phone: category and total. md: plus the trend, the average and the change. xl: plus
// the running month. The table scrolls inside its card, the header stays put.
const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,2fr)_124px_96px_104px_96px] md:gap-4 xl:grid-cols-[minmax(0,2fr)_124px_104px_96px_116px_104px]";

export function ExpensesTable({
  rows,
  subtitle,
  monthsLabel,
  currentLabel,
  beforeLabel,
  footer,
  financialMonth,
  periodRange,
  className,
}: {
  rows: ExpenseRow[];
  subtitle: string;
  /** "May – Oct": the sparkline column. */
  monthsLabel: string;
  /** "Oct so far", or null once every month has finished. */
  currentLabel: string | null;
  /** "vs Nov – Apr", or null without months before to compare with. */
  beforeLabel: string | null;
  footer: { left: string | null; avg: number; total: number };
  financialMonth: FinancialMonthConfig;
  periodRange: { from: string; to: string };
  className?: string;
}) {
  const t = useTranslations("insights.trendsTab.table");
  const [group, setGroup] = useState<"all" | "needs" | "wants">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const shown = group === "all" ? rows : rows.filter((r) => r.group === group);
  const hasGroups = rows.some((r) => r.group === "needs") && rows.some((r) => r.group === "wants");
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <ClearCard aria-labelledby="trends-table-title" className={cn("gap-3", className)}>
      <ClearCardHeader
        title={<span id="trends-table-title">{t("title")}</span>}
        subtitle={subtitle}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {hasGroups && (
              <Segmented
                label={t("filter")}
                surface="tile"
                size="sm"
                value={group}
                onChange={setGroup}
                items={[
                  { value: "all", label: t("all") },
                  { value: "needs", label: t("needs") },
                  { value: "wants", label: t("wants") },
                ]}
              />
            )}
            <ClearCardLink href="/transactions">{t("seeTransactions")}</ClearCardLink>
          </div>
        }
      />

      {shown.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <div className="flex min-w-0 flex-col">
          <div className={cn(GRID, "hidden h-[38px] rounded-clear-row bg-clear-tile px-3 text-xs font-semibold text-clear-ink-2 md:grid")}>
            <span>{t("category")}</span>
            <span>{monthsLabel}</span>
            <span className="hidden text-right xl:block">{currentLabel ?? ""}</span>
            <span className="text-right">{t("avg")}</span>
            <span className="text-right">{beforeLabel ?? ""}</span>
            <span className="text-right">{t("total")}</span>
          </div>
          <div className="clear-scrollbar relative max-h-[392px] overflow-y-auto overscroll-contain md:max-h-[296px]">
            {shown.map((r) => {
              const line = r.color ? softIconColors(r.color).foreground : "var(--clr-ink-2)";
              const tone = r.vsBefore == null ? null : changeTone(r.vsBefore);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(GRID, "min-h-12 w-full cursor-pointer border-b border-clear-ground px-3 py-1.5 text-left font-clear text-clear-ink transition-colors last:border-b-0 hover:rounded-clear-row hover:bg-clear-tile")}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon iconKey={r.icon} color={r.color} soft size="sm" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{r.name}</span>
                      <span className="truncate text-xs text-clear-muted">{r.meta}</span>
                    </span>
                  </span>
                  <span className="hidden md:block">
                    <Sparkline
                      values={r.values}
                      running={currentLabel != null}
                      color={line}
                      label={t("spark", { name: r.name, min: formatEurWhole(Math.min(...r.values)), max: formatEurWhole(Math.max(...r.values)) })}
                    />
                  </span>
                  <span className="hidden text-right xl:block">
                    {r.current == null ? null : r.due ? (
                      <span className="text-xs font-semibold text-clear-muted">{r.due}</span>
                    ) : (
                      <Amount value={r.current} whole className={cn("text-sm font-bold!", r.spike ? "text-clear-ember-text" : r.current === 0 && "text-clear-placeholder")} />
                    )}
                  </span>
                  <Amount value={r.avg} whole className="hidden text-right text-sm font-bold! md:block" />
                  <span className="hidden justify-end md:flex">
                    {tone && r.vsBefore != null && (
                      <ClearChip tone={tone === "same" ? "stone" : tone === "up" ? "peach" : "mint"} className="h-6 px-2.5 text-xs font-semibold">
                        {tone === "same" ? t("same") : signed(r.vsBefore)}
                      </ClearChip>
                    )}
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <Amount value={r.total} whole className="text-sm font-bold!" />
                    <span className="text-xs whitespace-nowrap text-clear-muted md:hidden">
                      <MoneyText>{t("avgPerMonth", { amount: formatEurWhole(r.avg) })}</MoneyText>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-clear-ground px-3 pt-2.5 text-xs text-clear-muted">
        <span><MoneyText>{footer.left ?? ""}</MoneyText></span>
        <span className="font-medium">
          <MoneyText>
            {t.rich("footer", {
              avg: formatEurWhole(footer.avg),
              total: formatEurWhole(footer.total),
              b: (chunks) => <b className="clear-amount text-[13px] font-bold! text-clear-ink">{chunks}</b>,
            })}
          </MoneyText>
        </span>
      </div>

      <CategoryDetailPortal
        category={selected ? { categoryId: selected.id, categoryName: selected.name, color: selected.color, icon: selected.icon } : null}
        financialMonth={financialMonth}
        budgetPeriod={periodRange}
        onClose={() => setSelectedId(null)}
      />
    </ClearCard>
  );
}
