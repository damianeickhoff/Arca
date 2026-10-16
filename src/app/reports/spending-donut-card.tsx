"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IconChevronRight } from "@tabler/icons-react";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { Segmented } from "@/components/clear/segmented";
import { CategorySpendingListPortal } from "@/components/category-spending-list-portal";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import type { CategorySpendCard } from "@/components/category-spending-row";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MoneyText, SvgMoneyText } from "@/components/clear/money";

/** Theme colours for categories without a colour of their own. */
const PALETTE = [
  "var(--clr-ink)",
  "var(--clr-ember)",
  "var(--clr-info-fill)",
  "var(--clr-positive-fill)",
  "var(--clr-warning-fill)",
  "var(--clr-lilac-ink)",
  "var(--clr-rose-ink)",
  "var(--clr-stone-ink)",
];
const OTHER_COLOR = "var(--clr-placeholder)";
/** Categories drawn as their own slice; the rest is one "Other" slice. */
const SLICES = 7;
/** Legend rows on a phone before "N more". */
const PHONE_ROWS = 4;

type Mode = "expense" | "income";
type View = "group" | "category";

/**
 * Insights · Overview "Spending by group / category": a donut of the biggest groups (or
 * categories) plus "Other", with a legend of amounts and shares. One switch flips it to
 * income, another between groups and categories. A legend row opens that group's or
 * category's detail; Details (and "Other") opens the full list.
 */
export function CategoryBreakdownCard({
  spendingVisible,
  spendingAll,
  spendingTotal,
  incomeAll,
  incomeTotal,
  groups,
  ongoing,
  financialMonth,
  budgetPeriod,
  className,
}: {
  /** Spending categories shown on the card (the ones not hidden from spending rows). */
  spendingVisible: CategorySpendCard[];
  /** Every spending category, for the full list. */
  spendingAll: CategorySpendCard[];
  spendingTotal: number;
  incomeAll: CategorySpendCard[];
  incomeTotal: number;
  /** The same lists added up per group. */
  groups: { spendingVisible: CategorySpendCard[]; spendingAll: CategorySpendCard[]; incomeAll: CategorySpendCard[] };
  /** The period includes today, so the total is "so far". */
  ongoing: boolean;
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
  className?: string;
}) {
  const t = useTranslations("insights.overview");
  const [mode, setMode] = useState<Mode>("expense");
  const [view, setView] = useState<View>("group");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const isIncome = mode === "income";
  const byGroup = view === "group";
  const visible = isIncome ? (byGroup ? groups.incomeAll : incomeAll) : byGroup ? groups.spendingVisible : spendingVisible;
  const all = isIncome ? (byGroup ? groups.incomeAll : incomeAll) : byGroup ? groups.spendingAll : spendingAll;
  const total = isIncome ? incomeTotal : spendingTotal;
  const selected = all.find((r) => r.categoryId === selectedId) ?? null;
  const title = isIncome ? (byGroup ? t("incomeByGroup") : t("incomeByCategory")) : byGroup ? t("byGroup") : t("byCategory");

  const top = visible.slice(0, SLICES);
  const other = Math.max(0, total - top.reduce((s, r) => s + r.spent, 0));
  const colorOf = (row: CategorySpendCard, i: number) => row.color ?? PALETTE[i % PALETTE.length];
  const rows = [
    ...top.map((r, i) => ({ key: String(r.categoryId), id: r.categoryId as number | null, name: r.categoryName, value: r.spent, color: colorOf(r, i) })),
    ...(other > 0.005 ? [{ key: "other", id: null, name: t("other"), value: other, color: OTHER_COLOR }] : []),
  ];
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const hiddenOnPhone = Math.max(0, rows.length - PHONE_ROWS);
  const description = t("donutLabel", {
    title,
    total: formatEur(total),
    parts: rows.map((r) => `${r.name} ${share(r.value)}%`).join(", "),
  });

  return (
    <ClearCard aria-labelledby="insights-categories-title" className={className}>
      <ClearCardHeader
        title={<span id="insights-categories-title">{title}</span>}
        action={
          all.length > 0 ? (
            <button type="button" onClick={() => setShowAll(true)} className="cursor-pointer text-sm font-bold text-clear-ember-text hover:underline">
              {t("details")}
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div data-tip-anchor="insightsCategorySwitch">
          <Segmented
            label={t("categorySwitch")}
            surface="tile"
            size="sm"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setShowAll(false);
            }}
            items={[
              { value: "expense", label: t("spending") },
              { value: "income", label: t("incomeShort") },
            ]}
          />
        </div>
        <div data-tip-anchor="insightsGroupSwitch">
          <Segmented
            label={t("groupSwitch")}
            surface="tile"
            size="sm"
            value={view}
            onChange={(v) => {
              setView(v);
              setShowAll(false);
            }}
            items={[
              { value: "group", label: t("groups") },
              { value: "category", label: t("categories") },
            ]}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="m-0 flex flex-1 items-center justify-center py-8 text-center text-sm text-clear-muted">
          {isIncome ? t("noIncome") : t("noSpending")}
        </p>
      ) : (
        <div className="flex flex-1 items-center gap-3.5 lg:flex-col lg:items-stretch lg:gap-[18px]">
          <div className="w-28 shrink-0 lg:mx-auto lg:w-44">
            <Donut parts={rows} total={total} label={description} caption={isIncome ? t("received") : ongoing ? t("spentSoFar") : t("spentCaption")} />
          </div>
          <ul className="m-0 flex min-w-0 flex-1 list-none flex-col p-0 lg:gap-0">
            {rows.map((r, i) => (
              <li key={r.key} className={cn(i >= PHONE_ROWS && "max-lg:hidden")}>
                <button
                  type="button"
                  onClick={() => (r.id != null ? setSelectedId(r.id) : setShowAll(true))}
                  className="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-clear-row text-left text-[13px] transition-colors hover:bg-clear-tile lg:-mx-2 lg:min-h-[38px] lg:w-[calc(100%+1rem)] lg:gap-2.5 lg:border-b lg:border-clear-ground lg:px-2 lg:text-sm"
                >
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full lg:rounded-[3px]" style={{ background: r.color }} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-clear-ink-2 lg:text-clear-ink">{r.name}</span>
                  <span className="hidden w-10 shrink-0 text-right text-[13px] tabular-nums text-clear-muted lg:inline">{share(r.value)}%</span>
                  <span className="shrink-0 text-right font-extrabold tabular-nums lg:w-[88px]">
                    <span className="lg:hidden"><MoneyText>{formatEurWhole(r.value)}</MoneyText></span>
                    <span className="hidden lg:inline"><MoneyText>{formatEur(r.value)}</MoneyText></span>
                  </span>
                </button>
              </li>
            ))}
            {hiddenOnPhone > 0 && (
              <li className="lg:hidden">
                <button type="button" onClick={() => setShowAll(true)} className="inline-flex min-h-8 cursor-pointer items-center gap-1 text-[13px] font-bold text-clear-ember-text">
                  {t("moreCount", { count: hiddenOnPhone })}
                  <IconChevronRight size={14} stroke={2.4} aria-hidden />
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      <CategorySpendingListPortal open={showAll} rows={all} onClose={() => setShowAll(false)} onSelect={(id) => setSelectedId(id)} title={title} income={isIncome} />
      <CategoryDetailPortal
        category={selected ? { categoryId: selected.categoryId, categoryName: selected.categoryName, color: selected.color, icon: selected.icon } : null}
        financialMonth={financialMonth}
        budgetPeriod={budgetPeriod}
        onClose={() => setSelectedId(null)}
        direction={mode}
      />
    </ClearCard>
  );
}

/** The ring itself: one arc per part with a small gap between them, the total in the middle. */
function Donut({
  parts,
  total,
  label,
  caption,
}: {
  parts: { key: string; value: number; color: string }[];
  total: number;
  label: string;
  caption: string;
}) {
  const r = 60;
  const c = 2 * Math.PI * r;
  const gap = parts.length > 1 ? 2 : 0;
  const sum = parts.reduce((s, p) => s + p.value, 0) || 1;
  const lengths = parts.map((p) => (p.value / sum) * c);
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((s, l) => s + l, 0));

  return (
    <svg viewBox="0 0 160 160" className="block h-auto w-full font-clear" role="img" aria-label={label}>
      <g transform="rotate(-90 80 80)" fill="none" strokeWidth="22">
        <circle cx="80" cy="80" r={r} stroke="var(--clr-ground)" />
        {parts.map((p, i) => (
          <circle
            key={p.key}
            cx="80"
            cy="80"
            r={r}
            stroke={p.color}
            strokeDasharray={`${Math.max(0, lengths[i] - gap)} ${c}`}
            strokeDashoffset={-starts[i]}
          />
        ))}
      </g>
      <text x="80" y="82" textAnchor="middle" fontSize="22" fontWeight="800" letterSpacing="-0.5" fill="var(--clr-ink)" className="tabular-nums">
        <SvgMoneyText>{formatEurWhole(total)}</SvgMoneyText>
      </text>
      <text x="80" y="100" textAnchor="middle" fontSize="12" fill="var(--clr-muted)">
        {caption}
      </text>
    </svg>
  );
}
