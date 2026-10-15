"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconPlus,
  IconTrash,
  IconTrendingUp,
  IconWallet,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEur, formatEurWhole } from "@/lib/format";
import { PageHeading, SectionHead } from "@/components/ui/page-heading";
import { Stat } from "@/components/ui/stat";
import { Pill } from "@/components/ui/pill";
import { Bar } from "@/components/ui/ring";
import { CategoryIcon } from "@/components/ui/category-icon";
import { buttonVariants } from "@/components/ui/button";
import { SearchButton } from "@/components/shell/search-context";
import { PlanSwitch } from "@/components/shell/plan-switch";
import { AnchoredTip } from "@/components/anchored-tip";
import { ContextualTip } from "@/components/contextual-tip";
import { MarkPaidButton } from "@/app/mark-paid-button";
import type { BudgetPeriod } from "@/lib/budget-overview";
import { useBudgetEditor } from "./budget-editor";

const CARD = "rounded-card border border-line bg-surface shadow-card";
const GHOST = cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-3.5 text-[13px] font-semibold");

type Strategy = { nodig: number; willen: number; sparen: number };

export interface BudgetSuggestion {
  categoryId: number;
  name: string;
  pct: number;
  /** How far over budget it already is (0 when not over yet). */
  over: number;
  daysLeft: number;
  move: { fromId: number; fromName: string; amount: number } | null;
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
}

export interface BudgetViewData {
  hasBudget: boolean;
  period: BudgetPeriod;
  hasOverall: boolean;
  limit: number;
  spent: number;
  pace: "onPace" | "fast" | "over" | null;
  daysLeft: number;
  allocated: number;
  resetDay: number;
  strategy: Strategy;
  income: number;
  actuals: Strategy;
  rows: {
    categoryId: number;
    name: string;
    icon: string | null;
    color: string | null;
    budgetType: string | null;
    budget: number;
    spent: number;
    child: boolean;
  }[];
  suggestion: BudgetSuggestion | null;
  bills: BudgetBill[];
  billsMonth: string;
  billsRange: { from: string; to: string };
  monthName: string;
  today: string;
}

const STRATEGY_COLORS: Record<keyof Strategy, string> = {
  nodig: "var(--arca-info)",
  willen: "var(--arca-accent)",
  sparen: "var(--arca-positive)",
};

const KIND_TONE = { nodig: "info", willen: "accent", sparen: "positive" } as const;

/** "Resets on the 25th" (the financial month start) or "Resets every Monday". */
function useResetsLabel() {
  const t = useTranslations("plan.budget");
  return (period: BudgetPeriod, resetDay: number) => (period === "weekly" ? t("resetsWeekly") : t("resetsMonthly", { day: resetDay }));
}

// ── Header ────────────────────────────────────────────────────────────────────

export function BudgetHeader({
  period,
  hasBudget,
  resetDay,
  strategy,
}: {
  period: BudgetPeriod;
  hasBudget: boolean;
  resetDay: number;
  strategy: Strategy;
}) {
  const t = useTranslations("plan.budget");
  const tPlan = useTranslations("plan");
  const tBudget = useTranslations("budget");
  const editor = useBudgetEditor();
  const resetsLabel = useResetsLabel();
  const subtitle = hasBudget
    ? [tBudget(`period.${period}`), resetsLabel(period, resetDay).toLowerCase(), t("strategyShort", { needs: strategy.nodig, wants: strategy.willen, savings: strategy.sparen })].join(" · ")
    : t("strategyShort", { needs: strategy.nodig, wants: strategy.willen, savings: strategy.sparen });
  return (
    <PageHeading
      className="w-full"
      title={
        <>
          <span className="lg:hidden">{tPlan("title")}</span>
          <span className="hidden lg:inline">{t("title")}</span>
        </>
      }
      subtitle={<span className="hidden lg:inline">{subtitle}</span>}
      actions={
        <>
          {hasBudget && (
            <button
              type="button"
              onClick={editor.openEdit}
              aria-label={t("editBudget")}
              className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-surface-2 lg:hidden"
            >
              <IconAdjustmentsHorizontal size={18} stroke={1.8} />
            </button>
          )}
          <Link href="/reports?tab=prognose" className={cn(GHOST, "hidden lg:inline-flex")}>
            <IconTrendingUp size={16} stroke={1.8} />
            {t("forecast")}
          </Link>
          <SearchButton />
        </>
      }
    />
  );
}

// ── Page body ─────────────────────────────────────────────────────────────────

export function BudgetView({ data }: { data: BudgetViewData }) {
  return (
    <>
      <PlanSwitch className="self-start" />

      {/* Phones: one column. lg: gauge + strategy | category budgets, with the bills
          under the gauge. 2xl: the three columns of the design. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start 2xl:grid-cols-[minmax(340px,1fr)_minmax(0,1.5fr)_minmax(340px,1fr)] 2xl:grid-rows-1">
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1">
          {data.hasBudget ? <GaugeCard data={data} /> : <EmptyBudgetCard />}
          <StrategyCard strategy={data.strategy} income={data.income} actuals={data.actuals} />
        </div>
        <div className="flex flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 2xl:row-span-1">
          <CategoryBudgets data={data} />
        </div>
        <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2 2xl:col-start-3 2xl:row-start-1">
          <BillsSection data={data} />
        </div>
      </div>

      <ContextualTip id="budget" />
      <AnchoredTip id="budgetStrategyCard" anchor="budgetStrategy" />
      <AnchoredTip id="budgetMove" anchor="budgetMove" active={data.suggestion?.move != null} />
      <AnchoredTip id="budgetBills" anchor="budgetBills" />
    </>
  );
}

// ── Gauge ─────────────────────────────────────────────────────────────────────

function GaugeCard({ data }: { data: BudgetViewData }) {
  const t = useTranslations("plan.budget");
  const editor = useBudgetEditor();
  const resetsLabel = useResetsLabel();
  const left = data.limit - data.spent;
  const perDay = Math.max(0, left) / Math.max(1, data.daysLeft);
  const free = data.limit - data.allocated;
  const pct = data.limit > 0 ? data.spent / data.limit : 0;
  const fill = data.pace === "over" ? "var(--arca-negative)" : data.pace === "fast" ? "var(--arca-warning)" : "var(--arca-accent)";
  const paceClass = data.pace === "over" ? "text-negative" : data.pace === "fast" ? "text-warning" : "text-positive";

  // Semicircle: 300 wide, the arc's centre on the bottom edge (minus the cap room).
  const size = 300;
  const r = size / 2 - 12;
  const arc = Math.PI * r;
  const d = `M12 ${size / 2} A${r} ${r} 0 0 1 ${size - 12} ${size / 2}`;

  return (
    <section className={cn(CARD, "flex flex-col items-center gap-[18px] p-[18px] lg:p-[22px]")}>
      <div className="relative flex w-full max-w-[300px] items-end justify-center" style={{ aspectRatio: `${size} / ${size / 2 + 10}` }}>
        <svg viewBox={`0 0 ${size} ${size / 2 + 10}`} aria-hidden className="absolute inset-0 size-full">
          <path d={d} fill="none" stroke="var(--arca-surface-2)" strokeWidth={14} strokeLinecap="round" />
          {pct > 0 && (
            <path
              d={d}
              fill="none"
              stroke={fill}
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={`${(arc * Math.min(1, pct)).toFixed(1)} ${arc.toFixed(1)}`}
              style={{ transition: "stroke-dasharray 500ms ease" }}
            />
          )}
        </svg>
        <span className="relative flex flex-col items-center gap-1.5 pb-0.5 text-center">
          <span className="text-[13px] font-semibold text-ink-2">{t("spentOf", { amount: formatEurWhole(data.limit) })}</span>
          <span className="amount text-[40px] leading-none tracking-[-0.035em] text-ink lg:text-[48px]">{formatEurWhole(data.spent)}</span>
          <span className="text-[13px] text-ink-2">
            {left >= 0 ? t("left", { amount: formatEurWhole(left) }) : t("over", { amount: formatEurWhole(-left) })}
            {data.pace && (
              <>
                {" · "}
                <span className={cn("font-bold", paceClass)}>{t(`pace.${data.pace}`)}</span>
              </>
            )}
          </span>
        </span>
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        <Stat label={t("allocated")} value={formatEurWhole(data.allocated)} />
        <Stat label={t("free")} value={data.hasOverall ? formatEurWhole(free) : "—"} tone={data.hasOverall && free < 0 ? "negative" : "default"} />
        <Stat label={t("perDay")} value={formatEurWhole(perDay)} />
      </div>

      <div className="flex w-full flex-wrap gap-2">
        <button type="button" onClick={editor.openEdit} data-tip-anchor="budgetEdit" className={GHOST}>
          <IconAdjustmentsHorizontal size={16} stroke={1.8} />
          {t("editBudget")}
        </button>
        {/* The reset day is the financial month's start day, which lives in Settings. */}
        <Link href="/settings?tab=general" className={GHOST}>
          <IconCalendar size={16} stroke={1.8} />
          {resetsLabel(data.period, data.resetDay)}
        </Link>
        <button
          type="button"
          onClick={editor.deleteBudget}
          disabled={editor.busy}
          aria-label={t("deleteBudget")}
          title={t("deleteBudget")}
          className={cn(GHOST, "ml-auto w-10 px-0")}
        >
          <IconTrash size={16} stroke={1.8} />
        </button>
      </div>
    </section>
  );
}

function EmptyBudgetCard() {
  const t = useTranslations("plan.budget.empty");
  const editor = useBudgetEditor();
  return (
    <section className={cn(CARD, "flex flex-col items-center gap-4 px-6 py-10 text-center")}>
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-mustard-soft text-mustard-strong">
        <IconWallet size={26} stroke={1.8} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="heading text-lg text-ink">{t("title")}</h2>
        <p className="max-w-xs text-[13px] leading-[1.45] text-ink-2">{t("body")}</p>
      </div>
      <button type="button" onClick={editor.openEdit} data-tip-anchor="budgetEdit" className={buttonVariants({ variant: "default", size: "lg" })}>
        <IconPlus size={16} stroke={2} />
        {t("create")}
      </button>
    </section>
  );
}

// ── Strategy ──────────────────────────────────────────────────────────────────

function StrategyCard({ strategy, income, actuals }: { strategy: Strategy; income: number; actuals: Strategy }) {
  const t = useTranslations("plan.budget.strategy");
  const editor = useBudgetEditor();
  const parts = (["nodig", "willen", "sparen"] as const).map((key) => ({ key, pct: strategy[key] })).filter((p) => p.pct > 0);
  const share = (pct: number) => formatEurWhole((income * pct) / 100);
  return (
    <section data-tip-anchor="budgetStrategy" className={cn(CARD, "flex flex-col gap-3.5 p-[18px]")}>
      <SectionHead title={t("title")} link={t("adjust")} onClick={editor.openStrategy} size="sm" />
      <div className="flex gap-1.5">
        {parts.map((p) => (
          <div key={p.key} className="flex min-w-0 flex-col gap-2" style={{ flexBasis: `${p.pct}%` }}>
            <span className="block h-2.5 rounded-full" style={{ background: STRATEGY_COLORS[p.key] }} />
            <span className="flex min-w-0 flex-col">
              <span className="mono-label truncate text-[10px]">{t(p.key)}</span>
              <span className="text-sm font-bold text-ink">{p.pct}%</span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs leading-[1.5] text-ink-2">
        {income > 0
          ? `${t("onIncome", { income: formatEurWhole(income), needs: share(strategy.nodig), wants: share(strategy.willen), savings: share(strategy.sparen) })} ${t("soFar", {
              needs: formatEurWhole(actuals.nodig),
              wants: formatEurWhole(actuals.willen),
              savings: formatEurWhole(actuals.sparen),
            })}`
          : t("noIncome")}
      </p>
    </section>
  );
}

// ── Category budgets ──────────────────────────────────────────────────────────

function CategoryBudgets({ data }: { data: BudgetViewData }) {
  const t = useTranslations("plan.budget.categories");
  const tSug = useTranslations("plan.budget.suggestion");
  const editor = useBudgetEditor();
  const s = data.suggestion;

  return (
    <>
      <SectionHead
        title={
          <>
            <span className="lg:hidden">{t("titleShort")}</span>
            <span className="hidden lg:inline">{t("title")}</span>
          </>
        }
        link={
          <>
            <span className="lg:hidden">{t("manage")}</span>
            <span className="hidden lg:inline">{t("add")}</span>
          </>
        }
        onClick={editor.openManage}
      />
      <div className={cn(CARD, "px-4 py-1 lg:px-5 lg:py-1.5")}>
        {data.rows.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <p className="text-[13px] text-ink-3">{t("empty")}</p>
            <button type="button" onClick={editor.openManage} className={GHOST}>
              <IconPlus size={16} stroke={1.8} />
              {t("add")}
            </button>
          </div>
        ) : (
          data.rows.map((row) => {
            const pct = (row.spent / row.budget) * 100;
            const color = pct > 100 ? "var(--arca-negative)" : pct >= 98 ? "var(--arca-warning)" : row.color ?? "var(--arca-accent)";
            const kind = row.budgetType === "nodig" || row.budgetType === "willen" || row.budgetType === "sparen" ? row.budgetType : null;
            return (
              <button
                key={row.categoryId}
                type="button"
                onClick={() => editor.openCategory(row.categoryId)}
                aria-label={t("edit", { name: row.name })}
                className={cn(
                  "-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-row px-2 text-left transition-colors hover:bg-surface-2",
                  row.child && "pl-7",
                )}
              >
                <CategoryIcon icon={row.icon} color={row.color} size={row.child ? "sm" : "md"} />
                <span className="flex min-w-0 flex-1 flex-col gap-[7px]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{row.name}</span>
                      {kind && (
                        <Pill tone={KIND_TONE[kind]} className="hidden sm:inline-flex">
                          {t(`kind.${kind}`)}
                        </Pill>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-ink-3">
                      {t.rich("of", {
                        spent: formatEurWhole(row.spent),
                        budget: formatEurWhole(row.budget),
                        b: (chunks) => <span className="text-[13px] font-semibold tabular-nums text-ink">{chunks}</span>,
                      })}
                    </span>
                  </span>
                  <Bar pct={pct} color={color} height={5} />
                </span>
              </button>
            );
          })
        )}
      </div>

      {s && (
        <div
          data-tip-anchor="budgetMove"
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-banner px-4 py-3.5 text-[13px] font-bold sm:flex-nowrap",
            s.over > 0 ? "bg-negative-soft text-negative" : "bg-warning-soft text-warning",
          )}
        >
          <IconAlertTriangle size={18} stroke={1.8} className="shrink-0" />
          <span className="min-w-0 flex-1 leading-[1.35]">
            {s.over > 0
              ? tSug("over", { name: s.name, amount: formatEurWhole(s.over), days: s.daysLeft })
              : tSug("near", { name: s.name, pct: s.pct, days: s.daysLeft })}
          </span>
          {s.move && (
            <button
              type="button"
              disabled={editor.busy}
              onClick={() => editor.moveBudget(s.move!.fromId, s.categoryId, s.move!.amount)}
              className={cn(
                "h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-xs font-bold text-white transition-opacity disabled:opacity-60",
                s.over > 0 ? "bg-negative" : "bg-warning",
              )}
            >
              {tSug("move", { amount: formatEurWhole(s.move.amount), name: s.move.fromName })}
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ── Bills ─────────────────────────────────────────────────────────────────────

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BillsSection({ data }: { data: BudgetViewData }) {
  const t = useTranslations("plan.budget.bills");
  const locale = useLocale();
  const [day, setDay] = useState<string | null>(null);

  const byDate = new Map<string, BudgetBill[]>();
  for (const b of data.bills) {
    if (!b.dueDate) continue;
    byDate.set(b.dueDate, [...(byDate.get(b.dueDate) ?? []), b]);
  }

  // The financial month's days, padded to whole Monday–Sunday weeks.
  const { from, to } = data.billsRange;
  const start = new Date(`${from}T12:00:00`);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(`${to}T12:00:00`);
  end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));
  const cells: string[] = [];
  for (const c = new Date(start); c <= end; c.setDate(c.getDate() + 1)) cells.push(toDateStr(c));

  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const short = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const fmt = (date: string) => short.format(new Date(`${date}T12:00:00`));

  const shown = day ? data.bills.filter((b) => b.dueDate === day) : data.bills;

  return (
    <>
      <SectionHead title={t("title", { month: data.monthName })} link={t("view")} href="/transactions/upcoming" />
      <section data-tip-anchor="budgetBills" className={cn(CARD, "flex flex-col gap-3.5 p-[18px]")}>
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-center font-mono text-[10px] uppercase text-ink-3">
                {weekday.format(new Date(2024, 0, w === 0 ? 7 : w, 12))}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((date) => {
              const inRange = date >= from && date <= to;
              if (!inRange) return <span key={date} />;
              const dayBills = byDate.get(date) ?? [];
              const isToday = date === data.today;
              const past = date < data.today;
              const allPaid = dayBills.length > 0 && dayBills.every((b) => b.paid);
              const overdue = dayBills.some((b) => b.overdue);
              const dot = dayBills.length === 0 ? null : allPaid ? "bg-positive" : overdue ? "bg-negative" : "bg-ink-3";
              const dayNum = Number(date.slice(8, 10));
              const selected = day === date;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={dayBills.length === 0}
                  onClick={() => setDay(selected ? null : date)}
                  aria-pressed={selected}
                  aria-label={dayBills.length > 0 ? `${fmt(date)} · ${dayBills.map((b) => b.name).join(", ")}` : fmt(date)}
                  className={cn(
                    "flex h-[34px] flex-col items-center justify-center gap-[3px] rounded-full transition-colors",
                    isToday ? "bg-mustard text-mustard-ink" : selected ? "bg-ink text-bg" : dayBills.length > 0 ? "hover:bg-surface-2" : "",
                    !isToday && !selected && past && "text-ink-3",
                    dayBills.length === 0 && "cursor-default",
                  )}
                >
                  <span className="font-mono text-[11px] leading-none">
                    {dayNum}
                  </span>
                  <span className={cn("size-[5px] rounded-full", isToday || selected ? "bg-transparent" : dot ?? "bg-transparent")} />
                </button>
              );
            })}
          </div>
        </div>

        {day && (
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="font-semibold text-ink">{fmt(day)}</span>
            <button type="button" onClick={() => setDay(null)} className="font-semibold text-mustard-strong hover:underline underline-offset-4">
              {t("showAll")}
            </button>
          </div>
        )}

        {data.bills.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t("empty")}</p>
        ) : (
          <div className="flex flex-col">
            {shown.map((b) => {
              const when = b.dueDate
                ? b.paid
                  ? t("paidOn", { date: fmt(b.dueDate) })
                  : b.overdue
                    ? t("overdue", { date: fmt(b.dueDate) })
                    : b.dueDate === data.today
                      ? t("today")
                      : fmt(b.dueDate)
                : b.paid
                  ? t("paid")
                  : t("noDate");
              return (
                <div key={b.id} className="flex min-h-[54px] items-center gap-3">
                  <CategoryIcon icon={b.icon} color={b.iconColor} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-ink">{b.name}</span>
                    <span className={cn("truncate text-xs", b.paid ? "text-positive" : b.overdue ? "text-negative" : "text-ink-3")}>{when}</span>
                  </span>
                  {b.amount != null && (
                    <span className={cn("shrink-0 text-sm font-semibold tabular-nums", b.paid ? "text-ink-3" : "text-ink")}>{formatEur(b.amount)}</span>
                  )}
                  {b.paidByMatch ? (
                    <span
                      role="img"
                      aria-label={t("paidAuto")}
                      title={t("paidAuto")}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-positive bg-positive text-white"
                    >
                      <IconCheck className="size-3.5" stroke={2.4} />
                    </span>
                  ) : (
                    <MarkPaidButton recurringItemId={b.id} month={data.billsMonth} paid={b.paid} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
