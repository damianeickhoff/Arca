"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconArrowRight, IconChevronRight } from "@tabler/icons-react";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { Segmented } from "@/components/clear/segmented";
import { CategorySpendingListPortal } from "@/components/category-spending-list-portal";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import type { CategorySpendCard } from "@/components/category-spending-row";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { formatEur, formatEurWhole } from "@/lib/format";
import { showOtherCallout, withOther } from "@/lib/period-facts";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

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
/** Rows shown before "N more" opens the full list (fewer on a phone). */
const ROWS = 10;
const PHONE_ROWS = 6;

type Mode = "expense" | "income";
type View = "group" | "category";

/**
 * Insights · Overview "Spending by group / category": the total, a proportion strip of
 * every part, then each group (or category) as a bar row, biggest first and "Other"
 * last. One switch flips it to income, another between groups and categories. A row
 * opens that group's or category's detail; Details (and "Other") opens the full list.
 * When Other is a large share, a callout points at Needs review.
 */
export function CategoryBreakdownCard({
  spendingVisible,
  spendingAll,
  spendingTotal,
  incomeAll,
  incomeTotal,
  groups,
  uncategorised,
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
  /** Transactions in the period without a category, per direction. */
  uncategorised: { expense: number; income: number };
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

  const breakdown = withOther(visible, total);
  const named = breakdown.rows.map((r, i) => ({
    key: String(r.categoryId),
    id: r.categoryId as number | null,
    name: r.categoryName,
    value: r.spent,
    color: r.color ?? PALETTE[i % PALETTE.length],
  }));
  const shown = named.slice(0, ROWS);
  const hidden = named.length - shown.length;
  const phoneHidden = Math.max(0, named.length - PHONE_ROWS);
  const other = breakdown.other > 0.005 ? { key: "other", id: null, name: t("other"), value: breakdown.other, color: OTHER_COLOR } : null;
  const strip = [...named, ...(other ? [other] : [])];
  const rows = [...shown, ...(other ? [other] : [])];
  const largest = Math.max(1, ...rows.map((r) => r.value));
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const count = isIncome ? uncategorised.income : uncategorised.expense;
  const callout = showOtherCallout(breakdown.otherShare, count);

  const totalLine = isIncome ? t("breakdown.received") : ongoing ? t("breakdown.spentSoFar") : t("breakdown.spent");
  const partsLine = t(byGroup ? "breakdown.groups" : "breakdown.categories", { count: named.length, other: other ? "yes" : "no" });

  return (
    <ClearCard aria-labelledby="insights-categories-title" className={cn("gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ClearCardHeader
          title={<span id="insights-categories-title">{title}</span>}
          subtitle={isIncome ? t("breakdown.subtitleIncome") : t("breakdown.subtitleSpending")}
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
          {all.length > 0 && (
            <button type="button" onClick={() => setShowAll(true)} className="cursor-pointer px-1 text-sm font-bold text-clear-ember-text hover:underline">
              {t("details")}
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="m-0 flex flex-1 items-center justify-center py-8 text-center text-sm text-clear-muted">
          {isIncome ? t("noIncome") : t("noSpending")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <b className="clear-amount text-[28px] leading-none tracking-[-0.02em]">
              <MoneyText>{formatEurWhole(total)}</MoneyText>
            </b>
            <span className="text-[13px] text-clear-muted">
              {totalLine} · {partsLine}
            </span>
          </div>

          <div
            role="img"
            aria-label={t("breakdown.stripLabel", { parts: strip.map((r) => `${r.name} ${share(r.value)}%`).join(", ") })}
            className="flex h-4 gap-0.5 overflow-hidden rounded-full"
          >
            {strip.map((r) => (
              <span key={r.key} className="h-full min-w-0.5" style={{ width: `${(r.value / Math.max(total, 1)) * 100}%`, background: r.color }} />
            ))}
          </div>

          <ul className="m-0 flex list-none flex-col p-0">
            {rows.map((r, i) => (
              <li key={r.key} className={cn("border-b border-clear-ground last:border-b-0", i >= PHONE_ROWS && r.id != null && "max-lg:hidden")}>
                <button
                  type="button"
                  onClick={() => (r.id != null ? setSelectedId(r.id) : setShowAll(true))}
                  className="-mx-2 grid min-h-10 w-[calc(100%+1rem)] cursor-pointer grid-cols-[10px_minmax(0,1fr)_40px_auto] items-center gap-3 rounded-clear-row px-2 text-left text-sm transition-colors hover:bg-clear-tile sm:grid-cols-[10px_minmax(0,150px)_minmax(0,1fr)_44px_96px]"
                >
                  <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: r.color }} />
                  <span className="truncate font-bold">{r.name}</span>
                  <span aria-hidden className="h-2 overflow-hidden rounded-full bg-clear-tile max-sm:hidden">
                    <span
                      className={cn("block h-full rounded-full", r.id == null && "opacity-50")}
                      style={{ width: `${(r.value / largest) * 100}%`, background: r.color }}
                    />
                  </span>
                  <span className="text-right text-[13px] text-clear-muted tabular-nums">{share(r.value)}%</span>
                  <span className="text-right font-extrabold tabular-nums">
                    <MoneyText>{formatEur(r.value)}</MoneyText>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {phoneHidden > 0 && <MoreButton count={phoneHidden} onClick={() => setShowAll(true)} className="lg:hidden" />}
          {hidden > 0 && <MoreButton count={hidden} onClick={() => setShowAll(true)} className="max-lg:hidden" />}

          {callout && (
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-clear-tile bg-clear-peach px-3.5 py-3 text-sm font-semibold text-clear-peach-ink">
              <span className="min-w-0 flex-1">
                {t(byGroup ? "breakdown.otherCalloutGroup" : "breakdown.otherCalloutCategory", { pct: share(breakdown.other), count })}
              </span>
              <Link href="/transactions/needs-review" className="inline-flex items-center gap-1 font-extrabold whitespace-nowrap text-clear-peach-ink">
                {t("breakdown.sortThem")}
                <IconArrowRight size={16} stroke={2.4} aria-hidden />
              </Link>
            </div>
          )}
        </>
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

function MoreButton({ count, onClick, className }: { count: number; onClick: () => void; className?: string }) {
  const t = useTranslations("insights.overview");
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex min-h-8 cursor-pointer items-center gap-1 self-start text-[13px] font-bold text-clear-ember-text", className)}>
      {t("moreCount", { count })}
      <IconChevronRight size={14} stroke={2.4} aria-hidden />
    </button>
  );
}
