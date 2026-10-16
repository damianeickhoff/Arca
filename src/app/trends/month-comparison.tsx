"use client";

import { useTranslations } from "next-intl";
import { IconInfoCircle } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearChip, DeltaChip } from "@/components/clear/chip";
import { Icon } from "@/components/icon";
import { formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ComparisonPicker } from "./comparison-picker";
import { MoneyText } from "@/components/clear/money";

export type MonthStats = {
  income: number;
  expense: number;
  topCats: { id?: number; name: string; color: string | null; icon?: string | null; total: number }[];
};

const VISIBLE_ROWS = 7;

/** A whole-euro figure with the minus first ("−€20"), for the quieter earlier-month column. */
function signed(v: number) {
  return `${Math.round(v) < 0 ? "−" : ""}${formatEurWhole(Math.abs(v))}`;
}

/** Change from B to A as a chip; `upIsGood` decides the colour (more income is good, more spending isn't). */
function Change({ a, b, upIsGood }: { a: number; b: number; upIsGood: boolean }) {
  const diff = Math.round(a - b);
  if (diff === 0) return <ClearChip tone="stone" className="h-[26px] px-2.5 text-xs"><MoneyText>{formatEurWhole(0)}</MoneyText></ClearChip>;
  const up = diff > 0;
  return (
    <DeltaChip direction={up ? "up" : "down"} good={up === upIsGood} className="h-[26px] px-2.5 text-xs">
      <MoneyText>{formatEurWhole(Math.abs(diff))}</MoneyText>
    </DeltaChip>
  );
}

/**
 * Two budget months side by side: per category what went out in each and the change,
 * with a footnote while one of them still runs. Column B is the earlier pick, A the
 * later one; the month totals are the Trends key figures, so they aren't repeated here.
 * All data and month names are resolved by the caller.
 */
export function MonthComparison({
  cmpA,
  cmpB,
  labelA,
  labelB,
  shortA,
  shortB,
  soFar,
  statsA,
  statsB,
  months,
  footnote,
  className,
}: {
  cmpA: string;
  cmpB: string;
  /** The months' names for the subtitle ("October") and the column heads ("Oct"). */
  labelA: string;
  labelB: string;
  shortA: string;
  shortB: string;
  /** Month A is still running ("September vs October so far"). */
  soFar: boolean;
  statsA: MonthStats;
  statsB: MonthStats;
  /** The months the picker offers, oldest first. */
  months: { value: string; label: string }[];
  /** "October runs until 24 Oct. …" — only while one of the months still runs. */
  footnote: string | null;
  className?: string;
}) {
  const t = useTranslations("insights.trends");

  // Union of the categories in either month, largest first.
  const catMap = new Map<string, { key: string; name: string; color: string | null; icon: string | null; a: number; b: number }>();
  for (const c of statsA.topCats) catMap.set(c.name, { key: String(c.id ?? c.name), name: c.name, color: c.color, icon: c.icon ?? null, a: c.total, b: 0 });
  for (const c of statsB.topCats) {
    const existing = catMap.get(c.name);
    if (existing) existing.b = c.total;
    else catMap.set(c.name, { key: String(c.id ?? c.name), name: c.name, color: c.color, icon: c.icon ?? null, a: 0, b: c.total });
  }
  const rows = [...catMap.values()].sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  const visible = rows.slice(0, VISIBLE_ROWS);
  const restCount = rows.length - visible.length;

  const grid = "grid grid-cols-[minmax(0,1fr)_64px_64px_auto] items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_80px_80px_104px]";

  return (
    <ClearCard aria-labelledby="trends-compare-title" className={cn("gap-4", className)}>
      <ClearCardHeader
        title={<span id="trends-compare-title">{t("comparison")}</span>}
        subtitle={soFar ? t("comparisonSubtitleSoFar", { a: labelA, b: labelB }) : t("comparisonSubtitle", { a: labelA, b: labelB })}
        action={<ComparisonPicker cmpA={cmpA} cmpB={cmpB} months={months} />}
      />

      {rows.length === 0 && statsA.income === 0 && statsB.income === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-clear-muted">{t("noData")}</p>
      ) : (
        <div className="flex flex-col">
          <div className={cn(grid, "h-10 rounded-clear-row bg-clear-tile px-3 text-[13px] font-bold text-clear-ink-2")}>
            <span>{t("category")}</span>
            <span className="text-right">{shortB}</span>
            <span className="text-right">{shortA}</span>
            <span className="text-right">{t("change")}</span>
          </div>
          {visible.map((row) => (
            <div key={row.key} className={cn(grid, "min-h-[52px] border-b border-clear-ground px-3")}>
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon iconKey={row.icon} color={row.color} soft size="sm" />
                <span className="truncate text-sm font-bold">{row.name}</span>
              </span>
              <span className="text-right text-sm whitespace-nowrap tabular-nums text-clear-ink-2"><MoneyText>{signed(row.b)}</MoneyText></span>
              <Amount value={row.a} whole className="text-right text-sm" />
              <span className="flex justify-end">
                <Change a={row.a} b={row.b} upIsGood={false} />
              </span>
            </div>
          ))}
          {restCount > 0 && <p className="m-0 px-3 pt-2 text-[13px] text-clear-muted">{t("moreCategories", { count: restCount })}</p>}
        </div>
      )}

      {footnote && (
        <p className="m-0 mt-auto flex items-start gap-2.5 text-[13px] leading-normal text-clear-ink-2">
          <IconInfoCircle size={18} stroke={1.9} aria-hidden className="mt-px shrink-0" />
          <MoneyText>{footnote}</MoneyText>
        </p>
      )}
    </ClearCard>
  );
}
