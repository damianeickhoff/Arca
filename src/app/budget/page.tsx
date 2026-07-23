import { formatEur } from "@/lib/format";
import { SplitEur } from "@/components/split-eur";
import { MonthPicker } from "@/components/month-picker";
import { BudgetTargetsClient, BudgetCategoriesMobile } from "./target-client";
import { SearchTriggerButton } from "@/components/search-trigger-button";
import { Icon } from "@/components/icon";
import {
  IconCoinEuroFilled
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { getFinancialMonthConfig, getBudgetStrategy, getBudgetRollover } from "@/lib/app-settings";
import { currentFinancialMonth, financialMonthRangeByMonth } from "@/lib/date-range";
import { getBudgetData } from "@/lib/budget-data";
import { BudgetTabs } from "./budget-tabs";
import { getBillStatuses } from "@/lib/bill-status";
import { BillsCalendar, type CalendarBill } from "./bills-calendar";
import { classifyBudgetRows } from "@/lib/budget-overspend";
import { WarningBanner } from "@/components/warning-banner";
import { ScrollStickyHeader } from "@/components/scroll-sticky-header";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; nodig?: string; willen?: string; sparen?: string }>;
}) {
  const sp = await searchParams;
  const [financialMonth, strategy, rolloverEnabled] = await Promise.all([getFinancialMonthConfig(), getBudgetStrategy(), getBudgetRollover()]);
  const month = sp.month ?? currentFinancialMonth(financialMonth);
  const { from: rangeStart, to: rangeEnd } = financialMonthRangeByMonth(month, financialMonth);
  function fmtDisplayDate(d: string) {
    return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  const monthLabel = new Date(rangeStart + "T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const nodigPct = Math.max(0, Math.min(100, parseInt(sp.nodig ?? String(strategy.nodig))));
  const willenPct = Math.max(0, Math.min(100, parseInt(sp.willen ?? String(strategy.willen))));
  const sparenPct = Math.max(0, Math.min(100, parseInt(sp.sparen ?? String(strategy.sparen))));

  const [data, billStatuses] = await Promise.all([
    getBudgetData(month, financialMonth, rolloverEnabled),
    getBillStatuses(month, financialMonth),
  ]);
  const { overRows: overBudgetRows, nearRows: nearBudgetRows } = classifyBudgetRows(
    data.targetRows.map((r) => ({ ...r, target: r.effectiveTarget })),
  );
  const calendarBills: CalendarBill[] = billStatuses.map(({ item, icon, iconColor, iconBackground, dueDate, paid, paidSource, overdue }) => ({
    id: item.id,
    name: item.name,
    amount: item.amount,
    icon,
    iconColor,
    iconBackground,
    dueDate,
    paid,
    paidSource,
    overdue,
  }));

  const buckets = [
    {
      key: "nodig" as const,
      label: "Needs",
      desc: "Necessities & essentials",
      pct: nodigPct,
      color: "var(--color-nodig)",
    },
    {
      key: "willen" as const,
      label: "Wants",
      desc: "Fun spending & personal",
      pct: willenPct,
      color: "var(--color-willen)",
    },
    {
      key: "sparen" as const,
      label: "Savings & Debts",
      desc: "Savings goals & debt payments",
      pct: sparenPct,
      color: "var(--color-sparen)",
    },
  ];

  // Aggregate across categories that have a budget target set — used by the mobile "left to spend" card.
  const targetedRows = data.targetRows.filter((r) => r.target != null && r.target > 0);
  const totalTarget = targetedRows.reduce((s, r) => s + (r.effectiveTarget ?? r.target!), 0);
  const totalSpentOnTargets = targetedRows.reduce((s, r) => s + r.actual, 0);
  const totalLeft = totalTarget - totalSpentOnTargets;
  const rawTotalPct = totalTarget > 0 ? (totalSpentOnTargets / totalTarget) * 100 : 0;
  const totalPct = Math.min(100, rawTotalPct);
  const totalOver = totalLeft < 0 && totalTarget > 0;

  return (
    <div className="-mt-14 lg:mt-0 min-h-screen">
      {/* ── MOBILE BUDGET PAGE ── */}
      <div className="lg:hidden">
        {/* Top bar — matches dashboard/reports mobile top bar */}
        <div className="sticky top-[var(--sat)] z-40 px-4 pt-2 pb-3 space-y-2">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-3">
              <SearchTriggerButton />
            </div>
          </div>
          <BudgetTabs />
        </div>

        <div className="px-4 pb-4 space-y-4">
          {/* Income card */}
          <div className="rounded-2xl bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">My income</h2>
              <MonthPicker current={month} />
            </div>

            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-foreground/60 mb-1">Total Income</p>
                <p className="text-4xl font-medium tabular-nums tracking-tight">
                  <SplitEur formatted={formatEur(data.income)} />
                </p>
              </div>
              {/* Blocky bar chart — one column per recent day, stacked unit squares bottom-to-top
                  (nodig → willen → sparen), block opacity = spend that day in that bucket */}
              <div className="flex items-end gap-1.5 shrink-0 mt-1">
                {(() => {
                  const rowMaxByBucket = new Map(
                    buckets.map((b) => [b.key, Math.max(1, ...data.dailySplit.map((d) => d.byBucket[b.key] ?? 0))]),
                  );
                  return data.dailySplit.map((d) => (
                    <div key={d.date} className="flex flex-col-reverse gap-1">
                      {buckets.map((bucket) => {
                        const amount = d.byBucket[bucket.key] ?? 0;
                        const rowMax = rowMaxByBucket.get(bucket.key)!;
                        const active = amount > 0;
                        return (
                          <div
                            key={bucket.key}
                            title={`${bucket.label} · ${d.date}: ${formatEur(amount)}`}
                            className="size-3 rounded-[3px]"
                            style={{
                              backgroundColor: bucket.color,
                              opacity: active ? Math.max(0.35, amount / rowMax) : 0.1,
                            }}
                          />
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-4 mt-3">
              {buckets.map((bucket) => (
                <div key={bucket.key} className="min-w-0 pl-2 border-l-2" style={{ borderColor: bucket.color }}>
                  <p className="text-sm text-foreground/60 truncate">{bucket.label}</p>
                  <p className="text-base font-semibold tabular-nums truncate"><SplitEur formatted={formatEur(data.income * (bucket.pct / 100))} /></p>
                </div>
              ))}
            </div>
          </div>

          {/* Left-to-spend bar card — same visual language as the savings goal card on the dashboard */}
          <div className="rounded-2xl bg-card p-4">
            <div className="flex items-start justify-between mb-10">
              <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                <div className="size-14 rounded-full shrink-0 flex items-center justify-center bg-foreground/3">
                  <Icon iconKey="IconCoinEuroFilled" size="xxl" gradient={["#0f5e5a", "#2dd4bf"]} backgroundGradient={["var(--goal-icon-bg-from)", "var(--goal-icon-bg-to)"]} round />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-base leading-tight truncate">{totalOver ? "Total Budget" : formatEur(totalLeft)}</p>
                  <p className="text-sm font-medium text-foreground/60 mt-0.5">Left this month</p>
                </div>
              </div>
            </div>
            {/* Progress bar with floating % badge */}
            <div className="relative mb-2 mt-7">
              <div
                className="absolute -top-7.5"
                style={{
                  left: `${Math.max(0, Math.min(100, totalPct))}%`,
                  transform: totalPct <= 12 ? "translateX(0)" : totalPct >= 88 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                <span className="bg-foreground text-background text-[11px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap">
                  {rawTotalPct.toFixed(0)}%
                </span>
              </div>
              <div className="h-3.5 rounded-full overflow-hidden relative" style={{ background: "var(--gradient-goal-track)"  }}>
                <div
                  className="absolute top-0 left-0 bottom-0 rounded-full transition-all"
                  style={{ width: `${totalPct}%`, background: totalOver ? "var(--danger)" : "var(--gradient-goal-fill)" }}
                />
              </div>
            </div>
            <div className="flex justify-between text-[14px] text-foreground/60 tabular-nums">
              <span>{formatEur(totalSpentOnTargets)}</span>
              <span>{formatEur(totalTarget)}</span>
            </div>
          </div>

          {/* Budget alerts */}
          {overBudgetRows.length > 0 && (
            <WarningBanner severity="danger">
              <span className="font-semibold">{overBudgetRows.length} {overBudgetRows.length === 1 ? "category" : "categories"} over budget:</span>
              <span>{overBudgetRows.map((r) => r.categoryName).join(", ")}</span>
            </WarningBanner>
          )}
          {overBudgetRows.length === 0 && nearBudgetRows.length > 0 && (
            <WarningBanner severity="warning">
              <span className="font-semibold">{nearBudgetRows.length} {nearBudgetRows.length === 1 ? "category" : "categories"} near budget:</span>
              <span>{nearBudgetRows.map((r) => r.categoryName).join(", ")}</span>
            </WarningBanner>
          )}

          <BillsCalendar from={rangeStart} to={rangeEnd} bills={calendarBills} month={month} />

          {/* Per-category budgets */}
          {data.targetRows.length > 0 ? (
            <div id="per-category">
              <BudgetCategoriesMobile rows={data.targetRows} month={data.month} />
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-8 text-center text-foreground">
              <p className="text-sm">No variable categories found.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── DESKTOP BUDGET PAGE ── */}
      <div className="hidden lg:block">
      {/* Desktop header */}
      <ScrollStickyHeader
        className="flex sticky top-0 z-10 px-6 md:px-8 py-4 items-end justify-between gap-4"
        scrolledClassName="bg-white/40 dark:bg-white/5 backdrop-blur-xl border-b border-white/30 dark:border-white/10"
      >
        <div className="mt-6">
          <h1 className="text-3xl font-black tracking-tight text-foreground">Budget</h1>
          <p className="text-sm text-muted-foreground">{fmtDisplayDate(rangeStart)} – {fmtDisplayDate(rangeEnd)}</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthPicker current={month} />
        </div>
      </ScrollStickyHeader>

    <div className="px-4 pt-1 pb-4 md:px-6 md:pb-6 lg:px-8 lg:pb-8 lg:pt-4 space-y-4 lg:space-y-5">

      {/* Income strip */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Income {monthLabel}</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-income)" }}>{formatEur(data.income)}</p>
        </div>
        <div className="rounded-2xl bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Variable spent</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {formatEur(Object.values(data.byBudgetType).reduce((s, v) => s + v, 0))}
          </p>
        </div>
      </div>

      {/* 3-column bucket cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {buckets.map((bucket) => {
          const spent = data.byBudgetType[bucket.key] ?? 0;
          const goal = data.income * (bucket.pct / 100);
          const pct = goal > 0 ? Math.min(100, (spent / goal) * 100) : 0;
          const over = spent > goal && goal > 0;

          return (
            <div key={bucket.key} className="rounded-2xl bg-card p-5 flex flex-col gap-3">
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: bucket.color }} />
                    <h3 className="font-semibold text-sm">{bucket.label}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{bucket.pct}%</span>
                </div>
                <p className="text-xs text-muted-foreground ml-4">{bucket.desc}</p>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className={cn("text-2xl font-bold tabular-nums", over ? "text-red-600" : "text-foreground")}>
                    {formatEur(spent)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">of {formatEur(goal)}</p>
                </div>
                {over ? (
                  <span className="text-xs font-medium tabular-nums text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                    +{formatEur(spent - goal)}
                  </span>
                ) : (
                  <span className="text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                    {formatEur(goal - spent)} over
                  </span>
                )}
              </div>

              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: over ? "#ef4444" : bucket.color }}
                />
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">{pct.toFixed(0)}% used</p>
            </div>
          );
        })}
      </div>

      {/* Budget alerts */}
      {overBudgetRows.length > 0 && (
        <WarningBanner severity="danger">
          <span className="font-semibold">{overBudgetRows.length} {overBudgetRows.length === 1 ? "category" : "categories"} over budget:</span>
          <span>{overBudgetRows.map((r) => r.categoryName).join(", ")}</span>
        </WarningBanner>
      )}
      {overBudgetRows.length === 0 && nearBudgetRows.length > 0 && (
        <WarningBanner severity="warning">
          <span className="font-semibold">{nearBudgetRows.length} {nearBudgetRows.length === 1 ? "category" : "categories"} near budget:</span>
          <span>{nearBudgetRows.map((r) => r.categoryName).join(", ")}</span>
        </WarningBanner>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2">
          {/* Full-width per-category section */}
          {data.targetRows.length > 0 ? (
            <div className="rounded-2xl bg-card p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-base">Per category</h2>
                <p className="text-xs text-muted-foreground">Set a monthly target. Click a field to edit.</p>
              </div>
              <BudgetTargetsClient rows={data.targetRows} month={data.month} />
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-8 text-center text-muted-foreground">
              <p className="text-sm">No variable categories found.</p>
            </div>
          )}
        </div>
        <BillsCalendar from={rangeStart} to={rangeEnd} bills={calendarBills} month={month} />
      </div>
    </div>
    </div>
    </div>
  );
}
