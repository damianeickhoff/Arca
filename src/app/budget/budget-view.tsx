"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconChevronRight, IconDots, IconPencil, IconPlus, IconSparkles, IconTag } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEur, formatEurWhole } from "@/lib/format";
import { Icon } from "@/components/icon";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PlanSwitch } from "@/components/shell/plan-switch";
import { AnchoredTip } from "@/components/anchored-tip";
import { ContextualTip } from "@/components/contextual-tip";
import { MarkPaidButton } from "@/app/mark-paid-button";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { BudgetPeriod } from "@/lib/budget-overview";
import type { SafeToSpend } from "@/lib/safe-to-spend";
import { useBudgetEditor } from "./budget-editor";
import { MoneyText } from "@/components/clear/money";

type Strategy = { nodig: number; willen: number; sparen: number };

export interface BudgetSuggestion {
  categoryId: number;
  name: string;
  budget: number;
  spent: number;
  pct: number;
  /** How far over budget it already is (0 when not over yet). */
  over: number;
  daysLeft: number;
  move: { fromId: number; fromName: string; fromBudget: number; fromSpent: number; amount: number } | null;
}

export interface BudgetBill {
  id: number;
  name: string;
  amount: number | null;
  icon: string | null;
  iconColor: string | null;
  dueDate: string | null;
  paid: boolean;
  /** Paid because a transaction matched it — nothing to toggle. */
  paidByMatch: boolean;
  overdue: boolean;
  isIncome: boolean;
}

export interface BudgetViewData {
  hasBudget: boolean;
  period: BudgetPeriod;
  hasOverall: boolean;
  /** Home's safe-to-spend figures; null without a budget. */
  figures: SafeToSpend | null;
  from: string;
  to: string;
  /** Today is day `day` of `totalDays` in the budget period. */
  day: number;
  totalDays: number;
  daysLeft: number;
  /** How far through the period today is, 0–1 (the pace marker). */
  elapsed: number;
  allocated: number;
  unbudgeted: number;
  strategy: Strategy;
  income: number;
  actuals: Strategy;
  rows: {
    categoryId: number;
    name: string;
    icon: string | null;
    color: string | null;
    budget: number;
    spent: number;
    child: boolean;
  }[];
  suggestion: BudgetSuggestion | null;
  bills: BudgetBill[];
  billsMonth: string;
  budgetMonthName: string;
  billsMonthName: string;
  today: string;
  /** An earlier budget month, looked back at: no pace, no suggestion, nothing still to pay. */
  ended: boolean;
  /** The next expected income, also when it lands in the next financial month. */
  nextIncome: { name: string; amount: number | null; date: string } | null;
  /** Earlier / later budget month (?month=); "" is the current month, null is none. Null for weekly budgets. */
  periodNav: { prev: string | null; next: string | null } | null;
  /** For the category detail's period picker. */
  financialMonth: FinancialMonthConfig;
}

const KINDS = ["nodig", "willen", "sparen"] as const;
const KIND_FILL: Record<(typeof KINDS)[number], string> = {
  nodig: "bg-clear-primary",
  willen: "bg-clear-ember",
  sparen: "bg-clear-info",
};

/** "25 Oct" in the user's locale. */
function useShortDate() {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  return (date: string) => fmt.format(new Date(`${date}T12:00:00`));
}

function dayAfter(date: string) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d;
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Plan · Budget. One grid: the budget (black hero), the strategy and a suggestion on
 * top; the category budgets (two columns wide) beside this month's bills underneath.
 * At lg (two columns) the bills move up beside the suggestion and the category list
 * spans the full width at the bottom. Phones follow the phone mockup: budget,
 * suggestion and categories first, the strategy and the bills after them.
 */
export function BudgetView({ data }: { data: BudgetViewData }) {
  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      <BudgetHeader data={data} />

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {data.figures ? <HeroCard data={data} figures={data.figures} /> : <EmptyHeroCard />}
        <StrategyCard strategy={data.strategy} income={data.income} actuals={data.actuals} />
        <SuggestionCard data={data} />
        <CategoryBudgetsCard data={data} />
        <BillsCard data={data} />
      </div>

      <ContextualTip id="budget" />
      <AnchoredTip id="budgetStrategyTarget" anchor="budgetStrategy" />
      <AnchoredTip id="budgetMove" anchor="budgetMove" active={data.suggestion?.move != null} />
      <AnchoredTip id="budgetUnbudgeted" anchor="budgetUnbudgeted" active={data.rows.length > 0} />
      <AnchoredTip id="budgetBills" anchor="budgetBills" />
      <AnchoredTip id="budgetPeriodNav" anchor="budgetPeriodNav" active={data.periodNav != null && data.hasBudget} />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function BudgetHeader({ data }: { data: BudgetViewData }) {
  const t = useTranslations("plan.budget");
  const tPlan = useTranslations("plan");
  const editor = useBudgetEditor();
  const short = useShortDate();
  const resetDay = dayAfter(data.to).getDate();
  const editLabel = data.hasBudget ? t("editBudget") : t("createBudget");

  return (
    <div className="flex flex-col gap-4 lg:gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{tPlan("title")}</h1>
          <span className="hidden text-base text-clear-ink-2 lg:inline">
            {data.hasBudget ? t("subtitle", { period: data.period, day: resetDay }) : t("subtitleNone")}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {data.hasBudget && <MoreMenu />}
          <button
            type="button"
            onClick={editor.openEdit}
            data-tip-anchor="budgetEdit"
            aria-label={editLabel}
            className={cn(clearButtonVariants({ size: "icon" }), "size-12 lg:hidden")}
          >
            {data.hasBudget ? <IconPencil aria-hidden /> : <IconPlus aria-hidden />}
          </button>
          <button type="button" onClick={editor.openEdit} className={cn(clearButtonVariants(), "hidden lg:inline-flex")}>
            {data.hasBudget ? <IconPencil aria-hidden /> : <IconPlus aria-hidden />}
            {editLabel}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PlanSwitch />
        {data.hasBudget && <PeriodStepper data={data} label={
          data.ended
            ? t("periodLabelEnded", { from: short(data.from), to: short(data.to) })
            : t("periodLabel", { from: short(data.from), to: short(data.to), day: data.day, total: data.totalDays })
        } />}
      </div>
    </div>
  );
}

/** "‹ 25 Sep – 24 Oct · day 21 of 30 ›": steps through earlier budget months (?month=). */
function PeriodStepper({ data, label }: { data: BudgetViewData; label: string }) {
  const t = useTranslations("plan.budget");
  const nav = data.periodNav;
  const btn = "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-ground text-clear-ink transition-colors";
  const href = (month: string) => (month ? `/budget?month=${month}` : "/budget");
  return (
    <div data-tip-anchor="budgetPeriodNav" className="inline-flex h-[50px] items-center gap-1 rounded-full bg-clear-card px-[5px]">
      {nav &&
        (nav.prev != null ? (
          <Link href={href(nav.prev)} scroll={false} aria-label={t("previousPeriod")} className={cn(btn, "hover:bg-clear-line")}>
            <IconChevronLeft size={18} stroke={2.2} aria-hidden />
          </Link>
        ) : (
          <span aria-hidden className={cn(btn, "text-clear-placeholder")}>
            <IconChevronLeft size={18} stroke={2.2} />
          </span>
        ))}
      <span aria-live="polite" className={cn("text-sm font-bold tabular-nums", nav ? "px-2.5" : "px-[13px]")}>
        {label}
      </span>
      {nav &&
        (nav.next != null ? (
          <Link href={href(nav.next)} scroll={false} aria-label={t("nextPeriod")} className={cn(btn, "hover:bg-clear-line")}>
            <IconChevronRight size={18} stroke={2.2} aria-hidden />
          </Link>
        ) : (
          <span aria-hidden className={cn(btn, "text-clear-placeholder")}>
            <IconChevronRight size={18} stroke={2.2} />
          </span>
        ))}
    </div>
  );
}

/** "⋯": the budget's less common actions — the reset day lives in Settings. */
function MoreMenu() {
  const t = useTranslations("plan.budget");
  const editor = useBudgetEditor();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger aria-label={t("more")} className={cn(clearButtonVariants({ variant: "surface", size: "icon" }), "size-12 lg:size-11")}>
        <IconDots aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-52 p-1.5">
        <DropdownMenuLinkItem render={<Link href="/settings?panel=financialMonth" />}>{t("resetDay")}</DropdownMenuLinkItem>
        <DropdownMenuItem variant="destructive" disabled={editor.busy} onClick={editor.deleteBudget}>
          {t("deleteBudget")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroCard({ data, figures }: { data: BudgetViewData; figures: SafeToSpend }) {
  const t = useTranslations("plan.budget.hero");
  const short = useShortDate();
  const { target, spent, reserved, perDay, pace } = figures;
  const left = target - spent;
  const even = (target * data.day) / data.totalDays;
  const paceTone = data.ended ? (left >= 0 ? "mint" : "rose") : pace === "onPace" ? "mint" : pace === "fast" ? "butter" : "rose";
  const billsToCome = data.bills.filter((b) => !b.isIncome && !b.paid && b.dueDate != null && b.dueDate >= data.today).length;
  const tile = "flex min-w-0 flex-col gap-1 rounded-clear-tile px-3.5 py-3";

  return (
    <ClearCard hero aria-labelledby="budget-hero-title" className="gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="budget-hero-title" className="m-0 text-[17px] font-bold">
          {data.period === "weekly" ? t("titleWeekly") : t("title", { month: data.budgetMonthName })}
        </h2>
        {data.ended ? (
          <ClearChip tone={paceTone} icon={left >= 0 ? <IconCheck stroke={3} aria-hidden /> : <IconAlertTriangle stroke={2.4} aria-hidden />}>
            {left >= 0 ? t("endedUnder") : t("endedOver")}
          </ClearChip>
        ) : (
          <ClearChip tone={paceTone} icon={pace === "onPace" ? <IconCheck stroke={3} aria-hidden /> : <IconAlertTriangle stroke={2.4} aria-hidden />}>
            {t(`pace.${pace}`)}
          </ClearChip>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <Amount value={left} className="text-[44px] lg:text-[52px]" />
          <span className="text-base font-semibold text-clear-hero-ink-2">
            <MoneyText>{left >= 0 ? t("leftOf", { amount: formatEurWhole(target) }) : t("overOf", { amount: formatEurWhole(target) })}</MoneyText>
          </span>
        </span>
        <span className="text-sm text-clear-hero-ink-2">
          <MoneyText>{data.ended
            ? t("endedOn", { date: short(data.to) })
            : even >= spent
              ? t("underPace", { amount: formatEurWhole(even - spent), day: data.day })
              : t("overPace", { amount: formatEurWhole(spent - even), day: data.day })}</MoneyText>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <ClearProgress onHero value={spent / target} reserved={reserved / target} marker={data.ended ? undefined : data.elapsed} />
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1.5 text-[13px] text-clear-hero-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-clear-ember" />
            <MoneyText>{t("spent", { amount: formatEur(spent) })}</MoneyText>
          </span>
          {reserved > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="clear-hatch-hero size-2.5 rounded-[3px]" />
              <MoneyText>{t("bills", { amount: formatEur(reserved) })}</MoneyText>
            </span>
          )}
          {!data.ended && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-0.5 bg-clear-hero-ink" />
              {t("today")}
            </span>
          )}
        </div>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2">
        <div className={cn(tile, "bg-clear-hero-ink/8")}>
          <span className="text-[13px] text-clear-hero-ink-2">{t("allocated")}</span>
          <span className="clear-amount text-xl"><MoneyText>{formatEurWhole(data.allocated)}</MoneyText></span>
          <span className="truncate text-xs text-clear-hero-ink-2">{t("categories", { count: data.rows.length })}</span>
        </div>
        {data.hasOverall ? (
          <div className={cn(tile, "bg-clear-hero-ink/8")}>
            <span className="text-[13px] text-clear-hero-ink-2">{t("free")}</span>
            <Amount value={target - data.allocated} whole splitCents={false} className={cn("text-xl", target - data.allocated < 0 && "text-clear-negative")} />
            <span className="truncate text-xs text-clear-hero-ink-2">{t("freeSub")}</span>
          </div>
        ) : (
          <div className={cn(tile, "bg-clear-hero-ink/8")}>
            <span className="text-[13px] text-clear-hero-ink-2">{t("billsLeft")}</span>
            <span className="clear-amount text-xl"><MoneyText>{formatEurWhole(reserved)}</MoneyText></span>
            <span className="truncate text-xs text-clear-hero-ink-2">{t("billsLeftSub", { count: billsToCome })}</span>
          </div>
        )}
        <div className={cn(tile, "bg-clear-ember text-clear-ember-ink")}>
          <span className="text-[13px] font-semibold">{data.ended ? t("avgPerDay") : t("perDay")}</span>
          <span className="clear-amount text-xl"><MoneyText>{formatEurWhole(data.ended ? spent / data.totalDays : perDay)}</MoneyText></span>
          <span className="truncate text-xs font-semibold">
            {data.ended ? t("overDays", { count: data.totalDays }) : t("until", { date: short(figures.resetsOn) })}
          </span>
        </div>
      </div>
    </ClearCard>
  );
}

function EmptyHeroCard() {
  const t = useTranslations("plan.budget.empty");
  const editor = useBudgetEditor();
  return (
    <ClearCard hero aria-labelledby="budget-hero-title" className="justify-between gap-5">
      <div className="flex flex-col gap-3">
        <h2 id="budget-hero-title" className="m-0 text-[17px] font-bold">{t("title")}</h2>
        <span className="clear-amount text-[52px]">—</span>
        <p className="m-0 text-[15px] leading-[1.45] text-clear-hero-ink-2">{t("body")}</p>
      </div>
      <button
        type="button"
        onClick={editor.openEdit}
        data-tip-anchor="budgetEdit"
        className={cn(clearButtonVariants({ size: "lg" }), "bg-clear-hero-ink text-clear-hero hover:opacity-90")}
      >
        <IconPlus aria-hidden />
        {t("create")}
      </button>
    </ClearCard>
  );
}

// ── Strategy ──────────────────────────────────────────────────────────────────

/**
 * The Needs / Wants / Savings split, one bar per kind: the share of income actually
 * spent or saved so far (solid) over the target share (hatched, ending in a tick), all
 * on one shared scale. Kept short so the cards beside it don't stretch.
 */
function StrategyCard({ strategy, income, actuals }: { strategy: Strategy; income: number; actuals: Strategy }) {
  const t = useTranslations("plan.budget.strategy");
  const editor = useBudgetEditor();
  const actualPct = (k: (typeof KINDS)[number]) => (income > 0 ? (actuals[k] / income) * 100 : 0);
  const top = Math.max(...KINDS.map((k) => Math.max(strategy[k], actualPct(k))));
  // The scale runs to the next multiple of 20 (at least 60%), so short bars stay readable.
  const scale = Math.min(100, Math.max(60, Math.ceil(top / 20) * 20));
  const pos = (pct: number) => `${Math.min(100, (pct / scale) * 100)}%`;
  const share = (pct: number) => formatEurWhole((income * pct) / 100);

  return (
    <ClearCard data-tip-anchor="budgetStrategy" aria-labelledby="budget-strategy-title" className="order-1 gap-4 lg:order-none">
      <ClearCardHeader
        title={<span id="budget-strategy-title">{t("title")}</span>}
        subtitle={t("subtitle")}
        action={
          <ClearChip>
            {strategy.nodig} / {strategy.willen} / {strategy.sparen}
          </ClearChip>
        }
      />
      <div className="flex flex-col gap-3">
        {KINDS.map((k) => {
          const actual = actualPct(k);
          const over = actual > strategy[k] && k !== "sparen";
          return (
            <div key={k} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-bold">
                  {t(k)} <span className="font-semibold text-clear-muted">· <MoneyText>{formatEurWhole(actuals[k])}</MoneyText></span>
                </span>
                <span className="shrink-0 tabular-nums text-clear-ink-2">
                  {t.rich("of", {
                    actual: `${Math.round(actual)}%`,
                    target: `${strategy[k]}%`,
                    b: (c) => <b className={cn("text-[15px]", over ? "text-clear-negative" : "text-clear-ink")}>{c}</b>,
                  })}
                </span>
              </div>
              <span aria-hidden className="relative block h-2.5 rounded-full bg-clear-tile">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-[repeating-linear-gradient(135deg,var(--clr-line)_0_3px,var(--clr-card)_3px_7px)]"
                  style={{ width: pos(strategy[k]) }}
                />
                <span className={cn("absolute inset-y-0 left-0 rounded-full", KIND_FILL[k])} style={{ width: pos(actual) }} />
                <span className="absolute -inset-y-1 w-0.5 rounded-full bg-clear-ink" style={{ left: `calc(${pos(strategy[k])} - 1px)` }} />
              </span>
            </div>
          );
        })}
      </div>
      {/* Legend right under the bars; the income split and Adjust in a tile at the foot. */}
      <div aria-hidden className="-mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs font-semibold text-clear-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[18px] rounded-full bg-clear-primary" />
          {t("actual")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[18px] rounded-full bg-[repeating-linear-gradient(135deg,var(--clr-line)_0_2px,var(--clr-card)_2px_4px)] ring-1 ring-clear-line ring-inset" />
          {t("target")}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 rounded-clear-tile bg-clear-tile px-4 py-3.5">
        <span className="text-sm leading-[1.45] text-clear-ink-2">
          <MoneyText>{income > 0
            ? t("onIncome", { income: formatEurWhole(income), needs: share(strategy.nodig), wants: share(strategy.willen), savings: share(strategy.sparen) })
            : t("noIncome")}</MoneyText>
        </span>
        <button type="button" onClick={editor.openStrategy} className="shrink-0 cursor-pointer text-[15px] font-bold text-clear-ember-text hover:underline">
          {t("adjust")}
        </button>
      </div>
    </ClearCard>
  );
}

// ── Suggestion ────────────────────────────────────────────────────────────────

// "Not now" hides a suggestion for this category until the next budget period. It is a
// per-browser convenience, so it lives in localStorage (guarded: it can be unavailable).
const DISMISS_KEY = "centje.budget.suggestionDismissed";
const DISMISS_EVENT = "centje-budget-suggestion";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function subscribeDismissed(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}

function SuggestionCard({ data }: { data: BudgetViewData }) {
  const t = useTranslations("plan.budget.suggestion");
  const editor = useBudgetEditor();
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => null);
  const s = data.suggestion;
  const dismissId = s ? `${s.categoryId}:${data.from}` : null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, dismissId!);
    } catch {
      // Unavailable storage: the suggestion simply comes back on the next visit.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  if (data.rows.length === 0) return <StartCard />;
  if (!s || dismissed === dismissId) return <OnTrackCard data={data} />;

  const tileClass = "flex min-w-0 flex-col gap-1 rounded-clear-tile bg-white/70 px-3.5 py-3 dark:bg-clear-card/60";
  const afterHot = s.move ? s.budget + s.move.amount - s.spent : null;
  const afterDonor = s.move ? s.move.fromBudget - s.move.amount - s.move.fromSpent : null;

  return (
    <ClearCard aria-labelledby="budget-suggestion-title" className="bg-clear-peach text-clear-ink lg:self-start xl:self-stretch">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-clear-card text-clear-peach-ink">
          <IconAlertTriangle size={18} stroke={2} />
        </span>
        <span className="text-sm font-bold text-clear-ink-2">{t("label")}</span>
      </div>
      <h2 id="budget-suggestion-title" className="m-0 text-2xl leading-[1.25] font-extrabold tracking-[-0.02em]">
        <MoneyText>{s.over > 0
          ? t("over", { name: s.name, amount: formatEurWhole(s.over), days: s.daysLeft })
          : t("near", { name: s.name, pct: s.pct, days: s.daysLeft })}</MoneyText>
      </h2>
      {s.move && afterHot != null && afterDonor != null && (
        <div className="grid grid-cols-2 gap-2">
          <div className={tileClass}>
            <span className="truncate text-[13px] font-bold text-clear-peach-ink">{s.name}</span>
            <span className="text-[15px] font-extrabold tabular-nums">
              <MoneyText>{t("change", { from: formatEurWhole(s.budget), to: formatEurWhole(s.budget + s.move.amount) })}</MoneyText>
            </span>
            <span className="text-xs text-clear-ink-2">
              <MoneyText>{afterHot >= 0 ? t("backOnBudget") : t("stillOver", { amount: formatEurWhole(-afterHot) })}</MoneyText>
            </span>
          </div>
          <div className={tileClass}>
            <span className="truncate text-[13px] font-bold text-clear-ink-2">{s.move.fromName}</span>
            <span className="text-[15px] font-extrabold tabular-nums">
              <MoneyText>{t("change", { from: formatEurWhole(s.move.fromBudget), to: formatEurWhole(s.move.fromBudget - s.move.amount) })}</MoneyText>
            </span>
            <span className="text-xs text-clear-ink-2"><MoneyText>{t("stillLeft", { amount: formatEurWhole(Math.max(0, afterDonor)) })}</MoneyText></span>
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2.5">
        {s.move ? (
          <button
            type="button"
            data-tip-anchor="budgetMove"
            disabled={editor.busy}
            onClick={() => editor.moveBudget(s.move!.fromId, s.categoryId, s.move!.amount)}
            className={clearButtonVariants()}
          >
            <MoneyText>{t("move", { amount: formatEurWhole(s.move.amount), name: s.move.fromName })}</MoneyText>
          </button>
        ) : (
          <button type="button" onClick={() => editor.openCategory(s.categoryId)} className={clearButtonVariants()}>
            {t("editCategory", { name: s.name })}
          </button>
        )}
        <button type="button" onClick={dismiss} className={cn(clearButtonVariants({ variant: "surface" }), "bg-white/70 dark:bg-clear-card/60")}>
          {t("notNow")}
        </button>
      </div>
    </ClearCard>
  );
}

/** No category runs hot: which one is closest to its limit, and which has most room. */
function OnTrackCard({ data }: { data: BudgetViewData }) {
  const t = useTranslations("plan.budget.suggestion.onTrack");
  const closest = [...data.rows].sort((a, z) => z.spent / z.budget - a.spent / a.budget)[0];
  const roomiest = [...data.rows].sort((a, z) => z.budget - z.spent - (a.budget - a.spent))[0];
  const tileClass = "flex min-w-0 flex-col gap-1 rounded-clear-tile bg-white/70 px-3.5 py-3 dark:bg-clear-card/60";
  return (
    <ClearCard aria-labelledby="budget-suggestion-title" className="bg-clear-mint text-clear-ink lg:self-start xl:self-stretch">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-clear-card text-clear-mint-ink">
          <IconCheck size={18} stroke={2.4} />
        </span>
        <span className="text-sm font-bold text-clear-ink-2">{t("label")}</span>
      </div>
      <h2 id="budget-suggestion-title" className="m-0 text-2xl leading-[1.25] font-extrabold tracking-[-0.02em]">
        {t("title")}
      </h2>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <div className={tileClass}>
          <span className="text-xs text-clear-ink-2">{t("closest")}</span>
          <span className="truncate text-[15px] font-extrabold">{closest.name}</span>
          <span className="text-xs font-bold text-clear-mint-ink">{t("used", { pct: Math.round((closest.spent / closest.budget) * 100) })}</span>
        </div>
        <div className={tileClass}>
          <span className="text-xs text-clear-ink-2">{t("room")}</span>
          <span className="truncate text-[15px] font-extrabold">{roomiest.name}</span>
          <span className="text-xs font-bold text-clear-mint-ink"><MoneyText>{t("left", { amount: formatEurWhole(roomiest.budget - roomiest.spent) })}</MoneyText></span>
        </div>
      </div>
    </ClearCard>
  );
}

/** No category budgets yet: suggestions need them. */
function StartCard() {
  const t = useTranslations("plan.budget.suggestion.start");
  const editor = useBudgetEditor();
  return (
    <ClearCard aria-labelledby="budget-suggestion-title" className="bg-clear-butter text-clear-ink lg:self-start xl:self-stretch">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-clear-card text-clear-butter-ink">
          <IconSparkles size={18} stroke={2} />
        </span>
        <span className="text-sm font-bold text-clear-ink-2">{t("label")}</span>
      </div>
      <h2 id="budget-suggestion-title" className="m-0 text-2xl leading-[1.25] font-extrabold tracking-[-0.02em]">
        {t("title")}
      </h2>
      <div className="mt-auto">
        <button type="button" onClick={editor.openManage} className={clearButtonVariants()}>
          <IconPlus aria-hidden />
          {t("add")}
        </button>
      </div>
    </ClearCard>
  );
}

// ── Category budgets ──────────────────────────────────────────────────────────

function CategoryBudgetsCard({ data }: { data: BudgetViewData }) {
  const t = useTranslations("plan.budget.categories");
  const editor = useBudgetEditor();
  const [openId, setOpenId] = useState<number | null>(null);
  const opened = data.rows.find((r) => r.categoryId === openId) ?? null;
  const spent = data.rows.reduce((s, r) => s + r.spent, 0);
  const free = (data.figures?.target ?? 0) - data.allocated;

  return (
    <ClearCard aria-labelledby="budget-categories-title" className="gap-3.5 lg:order-last lg:col-span-2 xl:order-none">
      <ClearCardHeader
        title={<span id="budget-categories-title">{t("title")}</span>}
        subtitle={<MoneyText>{data.rows.length > 0 ? t("subtitle", { spent: formatEurWhole(spent), allocated: formatEurWhole(data.allocated) }) : undefined}</MoneyText>}
        action={
          <button type="button" onClick={editor.openManage} className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
            <IconPlus aria-hidden />
            {t("add")}
          </button>
        }
      />

      {data.rows.length === 0 ? (
        <p className="m-0 text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {data.rows.map((row, i) => {
            const left = row.budget - row.spent;
            const over = left < 0;
            const near = !over && row.spent / row.budget >= 0.85;
            return (
              <li key={row.categoryId} className="flex items-center gap-2 border-b border-clear-ground last:border-b-0">
                {/* The row opens the category's detail; the pencil beside it edits its budget. */}
                <button
                  type="button"
                  onClick={() => setOpenId(row.categoryId)}
                  aria-label={t("open", { name: row.name })}
                  data-tip-anchor={i === 0 ? "budgetCategoryRow" : undefined}
                  className={cn(
                    "-ml-2 flex min-h-[72px] min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-clear-row px-2 py-2 text-left transition-shadow hover:ring-2 hover:ring-clear-ink/10",
                    row.child && "pl-8",
                  )}
                >
                  <Icon iconKey={row.icon} color={row.color} size={row.child ? "sm" : "md"} soft />
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[15px] font-bold">{row.name}</span>
                      <span className="shrink-0 text-sm tabular-nums text-clear-ink-2">
                        <MoneyText>{t.rich("of", { spent: formatEurWhole(row.spent), budget: formatEurWhole(row.budget), b: (c) => <b className="text-clear-ink"><MoneyText>{c}</MoneyText></b> })}</MoneyText>
                      </span>
                    </span>
                    <ClearProgress
                      size="sm"
                      value={row.spent / row.budget}
                      marker={data.elapsed}
                      className="bg-clear-tile"
                      fillColor={over ? undefined : row.color ?? undefined}
                      fillClassName={over ? "bg-clear-negative-fill" : undefined}
                      markerClassName="bg-clear-ink/35"
                    />
                  </span>
                  <span className="hidden w-[104px] shrink-0 flex-col items-end gap-0.5 sm:flex">
                    <span className={cn("text-[15px] font-extrabold tabular-nums", over ? "text-clear-negative" : near ? "text-clear-warning" : "text-clear-ink-2")}>
                      <MoneyText>{over ? t("over", { amount: formatEurWhole(-left) }) : t("left", { amount: formatEurWhole(left) })}</MoneyText>
                    </span>
                    <span className="text-xs text-clear-muted"><MoneyText>{over ? t("overBudget") : t("perDay", { amount: formatEur(left / data.daysLeft) })}</MoneyText></span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => editor.openCategory(row.categoryId)}
                  aria-label={t("edit", { name: row.name })}
                  className={cn(clearButtonVariants({ variant: "secondary", size: "icon" }), "shrink-0")}
                >
                  <IconPencil aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {data.unbudgeted > 0 && (
        <Link
          href="/transactions"
          data-tip-anchor="budgetUnbudgeted"
          className="mt-auto flex min-h-[68px] items-center gap-3.5 rounded-clear-tile bg-clear-tile px-4 text-clear-ink no-underline transition-shadow hover:ring-2 hover:ring-clear-ink/10"
        >
          <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-clear-icon bg-clear-card text-clear-ink-2">
            <IconTag size={20} stroke={1.9} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{t("unbudgeted.title")}</span>
            <span className="truncate text-[13px] text-clear-muted">
              <MoneyText>{data.hasOverall ? t("unbudgeted.bodyFree", { amount: formatEurWhole(Math.max(0, free)) }) : t("unbudgeted.body")}</MoneyText>
            </span>
          </span>
          <Amount value={data.unbudgeted} sign="none" className="text-[17px]" splitCents={false} />
          <IconChevronRight aria-hidden size={18} stroke={2.2} className="shrink-0 text-clear-muted" />
        </Link>
      )}

      <AnchoredTip id="budgetCategoryDetail" anchor="budgetCategoryRow" active={data.rows.length > 0 && openId == null} />
      <CategoryDetailPortal
        category={opened ? { categoryId: opened.categoryId, categoryName: opened.name, color: opened.color, icon: opened.icon } : null}
        financialMonth={data.financialMonth}
        budgetPeriod={{ from: data.from, to: data.to }}
        onClose={() => setOpenId(null)}
      />
    </ClearCard>
  );
}

// ── Bills ─────────────────────────────────────────────────────────────────────

/**
 * This month's bills: the paid ones, a "Today" line, then the ones still to come, with
 * a paid-of-total bar on top and the next income beside what is still to pay below.
 */
function BillsCard({ data }: { data: BudgetViewData }) {
  const t = useTranslations("plan.budget.bills");
  const short = useShortDate();
  const out = data.bills.filter((b) => !b.isIncome);
  const paid = out.filter((b) => b.paid);
  const due = out.filter((b) => !b.paid);
  const paidTotal = paid.reduce((s, b) => s + (b.amount ?? 0), 0);
  const dueTotal = due.reduce((s, b) => s + (b.amount ?? 0), 0);
  const total = paidTotal + dueTotal;
  const next = data.ended ? undefined : due.find((b) => b.dueDate != null && b.dueDate >= data.today);
  const days = (date: string) =>
    Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${data.today}T12:00:00`).getTime()) / 86_400_000);
  const nextIncome = data.nextIncome;

  const summary = [
    t("summary", { paid: paid.length, due: due.length }),
    next ? t("next", { name: next.name, days: days(next.dueDate!) }) : due.length === 0 && out.length > 0 ? t("allPaid") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function status(b: BudgetBill): { text: string; tone: "mint" | "neutral" | "rose" | "peach"; ink: string } {
    if (b.paid) return { text: b.dueDate ? t("paidOn", { date: short(b.dueDate) }) : t("paid"), tone: "mint", ink: "text-clear-positive" };
    if (!b.dueDate) return { text: t("noDate"), tone: "neutral", ink: "text-clear-muted" };
    if (b.overdue) return { text: t("overdue", { date: short(b.dueDate) }), tone: "rose", ink: "text-clear-negative" };
    return { text: b.dueDate === data.today ? t("dueToday") : t("due", { date: short(b.dueDate) }), tone: "peach", ink: "text-clear-ember-text" };
  }

  function row(b: BudgetBill) {
    const st = status(b);
    return (
      <li key={`${b.id}-${b.dueDate}`} className="flex min-h-[52px] items-center gap-3 border-b border-clear-ground py-1.5 last:border-b-0">
        <Icon iconKey={b.icon} color={b.iconColor} size="md" soft />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-bold">{b.name}</span>
          <span className={cn("truncate text-xs font-semibold sm:hidden", st.ink)}>{st.text}</span>
        </span>
        <ClearChip
          tone={st.tone}
          icon={b.paid ? <IconCheck stroke={3} aria-hidden /> : undefined}
          className="hidden h-[26px] px-2.5 text-xs font-bold sm:inline-flex"
        >
          {st.text}
        </ClearChip>
        <span className={cn("w-[76px] shrink-0 text-right text-[15px] font-extrabold tabular-nums", b.paid && "text-clear-ink-2")}>
          <MoneyText>{b.amount != null ? formatEur(b.amount) : "—"}</MoneyText>
        </span>
        {b.paidByMatch ? (
          <span
            role="img"
            aria-label={t("paidAuto")}
            title={t("paidAuto")}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-clear-positive text-white"
          >
            <IconCheck className="size-3.5" stroke={2.4} />
          </span>
        ) : (
          <MarkPaidButton recurringItemId={b.id} month={data.billsMonth} paid={b.paid} />
        )}
      </li>
    );
  }

  return (
    <ClearCard data-tip-anchor="budgetBills" aria-labelledby="budget-bills-title" className="order-2 gap-3.5 lg:order-none">
      <ClearCardHeader
        title={<span id="budget-bills-title">{t("title", { month: data.billsMonthName })}</span>}
        subtitle={out.length > 0 ? summary : undefined}
        action={<ClearCardLink href="/transactions/upcoming">{t("view")}</ClearCardLink>}
      />

      {out.length === 0 ? (
        <p className="m-0 text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <>
          {total > 0 && (
            <div className="flex flex-col gap-1.5">
              <ClearProgress value={paidTotal / total} hatchRemainder fillClassName="bg-clear-primary" />
              <div className="flex justify-between gap-3 text-[13px] tabular-nums text-clear-ink-2">
                <span><MoneyText>{t("paidAmount", { amount: formatEur(paidTotal) })}</MoneyText></span>
                <span><MoneyText>{t("total", { amount: formatEur(total) })}</MoneyText></span>
              </div>
            </div>
          )}
          <div className="flex flex-col">
            {paid.length > 0 && <ul className="m-0 flex list-none flex-col p-0">{paid.map(row)}</ul>}
            {due.length > 0 && (
              <>
                <div className="flex items-center gap-2.5 py-2.5">
                  <span className="inline-flex h-6 items-center rounded-full bg-clear-primary px-2.5 text-xs font-extrabold text-clear-primary-ink">
                    {data.ended ? t("notPaid") : t("today", { date: short(data.today) })}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-clear-line" />
                </div>
                <ul className="m-0 flex list-none flex-col p-0">{due.map(row)}</ul>
              </>
            )}
          </div>
        </>
      )}

      {(dueTotal > 0 || nextIncome) && (
        <div className="mt-auto flex items-center justify-between gap-3 rounded-clear-tile bg-clear-tile px-4 py-3.5">
          {nextIncome ? (
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] text-clear-ink-2">{t("nextIncome", { name: nextIncome.name, date: short(nextIncome.date) })}</span>
              {nextIncome.amount != null && (
                <Amount value={nextIncome.amount} sign="always" splitCents={false} className="text-sm text-clear-positive" />
              )}
            </span>
          ) : (
            <span />
          )}
          {dueTotal > 0 && (
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <Amount value={dueTotal} sign="none" splitCents={false} className="text-xl" />
              <span className="text-[13px] font-semibold text-clear-ink-2">{t("stillToPay")}</span>
            </span>
          )}
        </div>
      )}
    </ClearCard>
  );
}
