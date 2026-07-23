import { db } from "@/db";
import { transactions, categories, recurringItems } from "@/db/schema";
import { eq, and, gte, sql, asc } from "drizzle-orm";
import { formatEur, formatCompactEur, BUDGET_TYPE_LABELS, normalizeBudgetType, pctChangeLabel, MONTH_NAMES } from "@/lib/format";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import {
  IconTrendingUp as TrendingUp,
  IconTrendingDown as TrendingDown,
  IconPercentage as Percentage,
} from "@tabler/icons-react";
import { CategoryPieClient } from "./category-pie";
import { ChangeRow, ChangePill } from "@/components/change-pill";
import { Icon } from "@/components/icon";
import { PairedBarChart, type Bucket } from "@/components/mini-bar-chart";
import { StatTile, TileBadge } from "@/components/stat-tile";
import { cookies } from "next/headers";
import { SearchTriggerButton } from "@/components/search-trigger-button";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { MonthlyLineChart } from "@/components/dashboard-charts";
import { ScrollStickyHeader } from "@/components/scroll-sticky-header";
import { CategoryTrendList } from "./category-trend-list";
import { MonthComparison } from "./month-comparison";
import { RecurringCostTrendCard } from "@/app/reports/recurring-cost-trend-card";
import { SavingsRateTrendCard } from "@/app/reports/savings-rate-trend-card";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { financialMonthForDate, monthsInRange, precedingMonths } from "@/lib/date-range";
import { PeriodSelector } from "@/app/reports/period-selector";

// ─── Helpers ────────────────────────────────────────────────────────────────

function longMonth(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shortMonth(ym: string): string {
  return MONTH_NAMES[parseInt(ym.slice(5), 10) - 1]?.slice(0, 3) ?? ym;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function spanDaysCount(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1;
}

// Same shape-detection idea as PeriodSelector's isCalendarMonthSpan — a plain
// 1st-to-last-day span, independent of the financial-month config.
function isSingleCalendarMonthSpan(from: string, to: string): boolean {
  const d = new Date(`${from}T00:00:00`);
  if (d.getDate() !== 1) return false;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return toDateStr(last) === to;
}

// Splits a single-month [from,to] into ~weekly buckets, same day-bucketing idea as
// analytics-tab.tsx's buildBuckets.
function buildWeeklyBuckets(from: string, to: string, dailyIncome: Map<string, number>, dailyExpense: Map<string, number>) {
  const buckets: { label: string; income: number; expense: number }[] = [];
  const end = new Date(`${to}T00:00:00`);
  let cursor = new Date(`${from}T00:00:00`);
  let weekIdx = 1;
  while (cursor <= end) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const boundedEnd = weekEnd > end ? end : weekEnd;
    let income = 0, expense = 0;
    for (let d = new Date(cursor); d <= boundedEnd; d.setDate(d.getDate() + 1)) {
      const key = toDateStr(d);
      income += dailyIncome.get(key) ?? 0;
      expense += dailyExpense.get(key) ?? 0;
    }
    buckets.push({ label: `Week ${weekIdx}`, income, expense });
    weekIdx++;
    cursor = new Date(boundedEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const BUDGET_GROUPS = ["nodig", "willen"] as const;

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ netto?: string; cmpA?: string; cmpB?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const netto = (sp.netto ?? cookieStore.get("netto")?.value) === "1";
  const financialMonth = await getFinancialMonthConfig();

  // Period picked via PeriodSelector — shares the same date_from/date_to cookie
  // convention as the Analytics tab, but defaults to the current calendar year
  // (instead of Analytics' month/budget default) when nothing's been picked yet.
  const cookieFrom = sp.from ?? cookieStore.get("date_from")?.value;
  const cookieTo = sp.to ?? cookieStore.get("date_to")?.value;
  const thisYear = new Date().getFullYear();
  const from = cookieFrom && cookieTo ? cookieFrom : `${thisYear}-01-01`;
  const to = cookieFrom && cookieTo ? cookieTo : `${thisYear}-12-31`;

  const months = monthsInRange(from, to); // the months the page charts
  const prevMonths = precedingMonths(months); // comparison-only window right before it
  const months24 = [...prevMonths, ...months];
  const currentSet = new Set(months);
  const startDate = `${months24[0]}-01`;

  // Whether transaction history actually reaches back far enough to cover the whole
  // comparison window — if the earliest transaction is younger than that, the "previous
  // period" total is an undercount, not a real zero, so vs-prior-period figures should
  // read "no data" instead of a misleading (or "New") percentage.
  const [earliestRow] = await db.select({ minDate: sql<string | null>`MIN(${transactions.date})` }).from(transactions);
  const prevPeriodDataComplete = !!earliestRow?.minDate && earliestRow.minDate <= `${prevMonths[0]}-01`;

  const allCats = await db.select().from(categories).orderBy(categories.group, categories.name);

  // Sub-category totals roll up into their parent, so graphs count a parent as the sum
  // of itself plus all its children. rollupId maps any category id to the id it counts
  // towards (its parent, or itself when top-level).
  const catById = new Map(allCats.map((c) => [c.id, c]));
  const rollupId = (id: number) => catById.get(id)?.parentCategoryId ?? id;

  const monthlyRows = await db.select({
    id: transactions.id,
    date: transactions.date,
    direction: transactions.direction,
    amount: transactions.amount,
    correctedAmount: transactions.correctedAmount,
    reimbursedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id}), 0)`,
    categoryId: transactions.categoryId,
    categoryName: categories.name,
    categoryColor: categories.color,
    categoryIcon: categories.icon,
    categoryGroup: categories.group,
    recurringType: recurringItems.type,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
  })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(recurringItems, eq(transactions.recurringItemId, recurringItems.id))
    .where(and(gte(transactions.date, startDate)))
    .orderBy(asc(transactions.date), asc(transactions.id));

  const recurringTypeByTxn = new Map(monthlyRows.map((row) => [row.id, row.recurringType]));
  const splitRows = await getTransactionSplitRows(monthlyRows.map((row) => row.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(monthlyRows, splitMap, { netto });

  const monthlyMap: Record<string, { income: number; expense: number }> = {};
  for (const m of months24) monthlyMap[m] = { income: 0, expense: 0 };
  // Daily income/expense — only used to build finer-grained buckets when the picked
  // period is a single week or calendar month (see chartData/expenseBuckets/
  // incomeBuckets below); cheap to build unconditionally since `allocations` is
  // already in memory.
  const dailyIncome = new Map<string, number>();
  const dailyExpense = new Map<string, number>();
  // Fixed-cost buckets — driven off the recurring item a transaction is matched to
  // (bill | subscription | debt), same convention as the Reports "Rapporten" tab.
  const fixedCostMap = new Map(months.map((m) => [m, { bill: 0, subscription: 0, debt: 0 }]));
  for (const row of allocations) {
    if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
    const month = row.date.slice(0, 7);
    if (!monthlyMap[month]) continue;
    if (row.direction === "income") {
      monthlyMap[month].income += row.amount;
      dailyIncome.set(row.date, (dailyIncome.get(row.date) ?? 0) + row.amount);
    } else {
      monthlyMap[month].expense += row.amount;
      dailyExpense.set(row.date, (dailyExpense.get(row.date) ?? 0) + row.amount);
    }

    const fixedBucket = fixedCostMap.get(month);
    if (fixedBucket && row.direction === "expense") {
      const recurringType = recurringTypeByTxn.get(row.transactionId);
      if (recurringType === "bill" || recurringType === "subscription" || recurringType === "debt") {
        fixedBucket[recurringType] += row.amount;
      }
    }
  }
  const incomeArr = months.map((m) => monthlyMap[m].income);
  const expenseArr = months.map((m) => monthlyMap[m].expense);
  const avgIncome = incomeArr.reduce((s, v) => s + v, 0) / months.length;
  const avgExpense = expenseArr.reduce((s, v) => s + v, 0) / months.length;
  const avgBalance = avgIncome - avgExpense;

  const prevIncomeArr = prevMonths.map((m) => monthlyMap[m].income);
  const prevExpenseArr = prevMonths.map((m) => monthlyMap[m].expense);
  const prevAvgIncome = prevIncomeArr.reduce((s, v) => s + v, 0) / prevMonths.length;
  const prevAvgExpense = prevExpenseArr.reduce((s, v) => s + v, 0) / prevMonths.length;
  const prevAvgBalance = prevAvgIncome - prevAvgExpense;
  const totalIncome = incomeArr.reduce((s, v) => s + v, 0);
  const totalExpense = expenseArr.reduce((s, v) => s + v, 0);
  const prevTotalIncome = prevIncomeArr.reduce((s, v) => s + v, 0);
  const prevTotalExpense = prevExpenseArr.reduce((s, v) => s + v, 0);

  // Monthly data — stays month-grained regardless of the picked period; drives
  // savings rate, fixed-cost trend, and the stat tiles below (all inherently
  // multi-month trend widgets).
  const chartData = months.map((m) => ({ month: m, income: monthlyMap[m].income, expense: monthlyMap[m].expense }));
  const savingsRateData = chartData.map((d) => ({
    month: d.month,
    savingsRatePct: d.income > 0 ? ((d.income - d.expense) / d.income) * 100 : null,
  }));
  const fixedCostData = months.map((m) => ({ month: m, ...(fixedCostMap.get(m) ?? { bill: 0, subscription: 0, debt: 0 }) }));

  // Hero mini bar chart + "Income vs Expenses" line chart — a single financial month
  // (or less) of data collapses `months` to one bucket, so a "Week"/"Month" period
  // pick gets its own finer granularity here instead of reusing `months`: 7 daily
  // buckets for a week, ~4-5 weekly buckets for a single calendar month. Everything
  // else (3m/6m/year/custom) keeps the existing per-financial-month buckets.
  const periodSpanDays = spanDaysCount(from, to);
  const isWeekPeriod = periodSpanDays === 7;
  const isMonthPeriod = !isWeekPeriod && isSingleCalendarMonthSpan(from, to);

  let lineChartData: { month: string; income: number; expense: number; label?: string }[];
  let expenseBuckets: Bucket[];
  let incomeBuckets: Bucket[];

  if (isWeekPeriod) {
    const days: { label: string; income: number; expense: number }[] = [];
    for (let d = new Date(`${from}T00:00:00`); d <= new Date(`${to}T00:00:00`); d.setDate(d.getDate() + 1)) {
      const key = toDateStr(d);
      days.push({
        label: d.toLocaleDateString("en-GB", { weekday: "short" }),
        income: dailyIncome.get(key) ?? 0,
        expense: dailyExpense.get(key) ?? 0,
      });
    }
    lineChartData = days.map((d, i) => ({ month: `${from}-d${i}`, income: d.income, expense: d.expense, label: d.label }));
    expenseBuckets = days.map((d) => ({ label: d.label, value: d.expense }));
    incomeBuckets = days.map((d) => ({ label: d.label, value: d.income }));
  } else if (isMonthPeriod) {
    const weeks = buildWeeklyBuckets(from, to, dailyIncome, dailyExpense);
    lineChartData = weeks.map((w, i) => ({ month: `${from}-w${i}`, income: w.income, expense: w.expense, label: w.label }));
    expenseBuckets = weeks.map((w) => ({ label: w.label, value: w.expense }));
    incomeBuckets = weeks.map((w) => ({ label: w.label, value: w.income }));
  } else {
    lineChartData = chartData;
    expenseBuckets = months.map((m) => ({ label: shortMonth(m), value: monthlyMap[m].expense }));
    incomeBuckets = months.map((m) => ({ label: shortMonth(m), value: monthlyMap[m].income }));
  }

  // Stat-tile facts — best/worst month by balance, average savings rate, and the single
  // biggest category over the window.
  const balanceByMonth = months.map((m) => ({ month: m, balance: monthlyMap[m].income - monthlyMap[m].expense }));
  const bestMonth = balanceByMonth.reduce((best, cur) => (cur.balance > best.balance ? cur : best), balanceByMonth[0]);
  const worstMonth = balanceByMonth.reduce((worst, cur) => (cur.balance < worst.balance ? cur : worst), balanceByMonth[0]);
  const validRates = savingsRateData.map((d) => d.savingsRatePct).filter((v): v is number => v != null);
  const avgSavingsRate = validRates.length > 0 ? validRates.reduce((s, v) => s + v, 0) / validRates.length : null;

  // Build categoryId → { monthly, total } — restricted to the charted 12-month window,
  // not the extra 12 months pulled in just for the comparison pills above.
  const catMonthly = new Map<number, Record<string, number>>();
  const catTotal = new Map<number, number>();
  // Un-rolled-up detail (children counted on their own, not merged into the parent), plus
  // per-category transaction count / distinct active months — used only by the "Expenses
  // per category" list below, which shows subcategories individually.
  const catDetail = new Map<number, { monthly: Record<string, number>; total: number; txCount: number; monthsActive: Set<string> }>();
  for (const row of allocations) {
    if (row.direction !== "expense" || row.isInternalTransfer || row.categoryId == null) continue;
    const month = row.date.slice(0, 7);
    if (!currentSet.has(month)) continue;
    const cid = rollupId(row.categoryId);
    if (!catMonthly.has(cid)) catMonthly.set(cid, {});
    catMonthly.get(cid)![month] = (catMonthly.get(cid)![month] ?? 0) + row.amount;
    catTotal.set(cid, (catTotal.get(cid) ?? 0) + row.amount);

    const rawId = row.categoryId;
    const detail = catDetail.get(rawId) ?? { monthly: {}, total: 0, txCount: 0, monthsActive: new Set<string>() };
    detail.monthly[month] = (detail.monthly[month] ?? 0) + row.amount;
    detail.total += row.amount;
    detail.txCount += 1;
    detail.monthsActive.add(month);
    catDetail.set(rawId, detail);
  }

  // Flat list of every category (parent or child) with expenses this period — used by
  // "Expenses per category" instead of the parent-only rollup, so subcategories show up
  // as their own rows. Noise filter: only categories seen across more than one period
  // and with more than one transaction make the list.
  const categoryDetailRows = allCats
    .filter((c) => {
      const d = catDetail.get(c.id);
      return !!d && d.total > 0 && d.txCount > 1 && d.monthsActive.size > 1;
    })
    .map((c) => {
      const d = catDetail.get(c.id)!;
      const group = normalizeBudgetType(c.budgetType) === "nodig" ? "nodig" : "willen";
      return {
        id: c.id,
        name: c.name,
        color: c.color ?? null,
        icon: c.icon ?? null,
        group,
        monthly: d.monthly,
        total: d.total,
      };
    })
    .sort((a, b) => b.total - a.total);

  const grouped = BUDGET_GROUPS.map((group) => {
    // Only top-level categories with spend are listed; their totals already include children.
    const cats = allCats
      .filter((c) => c.parentCategoryId === null && normalizeBudgetType(c.budgetType) === group && (catTotal.get(c.id) ?? 0) > 0)
      .sort((a, b) => (catTotal.get(b.id) ?? 0) - (catTotal.get(a.id) ?? 0));
    return {
      group,
      label: BUDGET_TYPE_LABELS[group] ?? group,
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color ?? null,
        icon: c.icon ?? null,
        monthly: catMonthly.get(c.id) ?? {},
        total: catTotal.get(c.id) ?? 0,
      })),
    };
  }).filter((g) => g.categories.length > 0);

  const groupedDetailed = BUDGET_GROUPS.map((group) => ({
    group,
    label: BUDGET_TYPE_LABELS[group] ?? group,
    categories: categoryDetailRows.filter((c) => c.group === group),
  })).filter((g) => g.categories.length > 0);

  const pieGroups = grouped.map((g) => ({
    group: g.group,
    label: g.label,
    categories: g.categories.map((c) => ({ name: c.name, color: c.color, total: c.total })),
  }));

  const topCategory = grouped.flatMap((g) => g.categories).sort((a, b) => b.total - a.total)[0] ?? null;

  // ─── Maandvergelijking ──────────────────────────────────────────────────────
  const nowYm = months[months.length - 1];
  const cmpA = sp.cmpA && months24.includes(sp.cmpA) ? sp.cmpA : nowYm;
  const cmpB = sp.cmpB && months24.includes(sp.cmpB) ? sp.cmpB : prevMonth(nowYm);

  function getMonthStats(ym: string) {
    let income = 0, expense = 0;
    const catMap = new Map<number, { name: string; color: string | null; total: number }>();
    for (const row of allocations) {
      if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
      if (financialMonthForDate(row.date, financialMonth) !== ym) continue;
      if (row.direction === "income") income += row.amount;
      else {
        expense += row.amount;
        if (row.categoryId != null) {
          const rid = rollupId(row.categoryId);
          const pc = catById.get(rid);
          const entry = catMap.get(rid) ?? { name: pc?.name ?? row.categoryName ?? "Unknown", color: pc?.color ?? row.categoryColor ?? null, total: 0 };
          entry.total += row.amount;
          catMap.set(rid, entry);
        }
      }
    }
    const topCats = [...catMap.values()].sort((a, b) => b.total - a.total).slice(0, 6);
    return { income, expense, balance: income - expense, topCats };
  }

  const statsA = getMonthStats(cmpA);
  const statsB = getMonthStats(cmpB);

  const periodLabel = months.length === 12 && from.endsWith("-01-01") && to.endsWith("-12-31")
    ? from.slice(0, 4)
    : `${longMonth(months[0])} – ${longMonth(months[months.length - 1])}`;
  const priorCaption = `vs prior ${prevMonths.length} month${prevMonths.length === 1 ? "" : "s"}`;

  return (
    <div className="-mt-14 lg:mt-0 min-h-screen">

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-[var(--sat)] z-40 flex items-center justify-end px-4 pt-2 pb-3">
        <div className="flex items-center gap-3">
          <SearchTriggerButton />
        </div>
      </div>
      <div className="lg:hidden flex items-end justify-between gap-4 px-4 pb-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Trends</h1>
          <p className="text-sm text-foreground/60">{periodLabel}</p>
        </div>
      </div>

      {/* Desktop sticky header */}
      <ScrollStickyHeader
        className="hidden lg:flex sticky top-0 z-10 px-6 md:px-8 py-4 items-end justify-between gap-4"
        scrolledClassName="bg-white/40 dark:bg-white/5 backdrop-blur-xl border-b border-white/30 dark:border-white/10"
      >
        <div className="mt-6">
          <h1 className="text-3xl font-black tracking-tight">Trends</h1>
          <p className="text-sm text-foreground/60">{periodLabel}</p>
        </div>
        <div className="pb-1">
        </div>
      </ScrollStickyHeader>

      <div className="px-4 pb-[calc(8rem+var(--sab))] md:px-6 lg:px-8 lg:pb-8 pt-4 space-y-4">

        {/* Hero — the exact nested two-tone shell + paired mini bar chart the Analytics
            tab uses for Cashflow (see StyleDescriptions/analytics-page-style.md §2a/§6a),
            here showing the monthly balance trend instead of a single period's buckets. */}
        <div className="bg-white/5 p-1 rounded-2xl">
          <div className="rounded-b-sm rounded-t-2xl bg-white/2 py-2 px-4 pb-3">
            <p className="text-md text-foreground/60 mb-1">Avg. balance / month</p>
            <p
              className="text-2xl font-semibold tabular-nums tracking-tight"
              style={{ color: avgBalance >= 0 ? "var(--color-income)" : "var(--color-expense)" }}
            >
              {formatEur(avgBalance)}
            </p>
            <ChangeRow change={prevPeriodDataComplete ? pctChangeLabel(avgBalance, prevAvgBalance) : null} caption={priorCaption} className="mt-1 mb-5" />
            <PairedBarChart a={expenseBuckets} b={incomeBuckets} />
          </div>

          <div className="rounded-2xl px-4 mt-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-md">
              <span className="size-2 rounded-full bg-foreground/60" /> Avg. expenses
            </span>
            <span className="text-md tabular-nums">{formatEur(avgExpense)}</span>
          </div>
          <div className="rounded-2xl px-4 py-1 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-md">
              <span className="size-2 rounded-full" style={{ backgroundColor: "var(--color-income)" }} /> Avg. income
            </span>
            <span className="text-md tabular-nums" style={{ color: "var(--color-income)" }}>+{formatEur(avgIncome)}</span>
          </div>
        </div>

        {/* Quick-glance stat tiles — the theme-static "photo card" tiles from Analytics
            (§2b), reused here for the four facts that best summarize a 12-month trend. */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Best month"
            value={formatCompactEur(bestMonth.balance)}
            footer={longMonth(bestMonth.month)}
            badge={<TileBadge icon={TrendingUp} color="var(--color-income)" />}
          />
          <StatTile
            label="Toughest month"
            value={formatCompactEur(worstMonth.balance)}
            footer={longMonth(worstMonth.month)}
            badge={<TileBadge icon={TrendingDown} color="var(--color-expense)" />}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Avg. savings rate"
            value={avgSavingsRate != null ? `${avgSavingsRate.toFixed(0)}%` : "—"}
            badge={<TileBadge icon={Percentage} color={avgSavingsRate != null && avgSavingsRate >= 0 ? "var(--color-income)" : "var(--color-expense)"} />}
          />
          <StatTile
            label="Top category"
            valueClassName="text-base font-bold truncate"
            value={topCategory ? topCategory.name : <span className="text-white/40 font-normal">—</span>}
            badge={topCategory && (
              <div className="absolute bottom-3 left-3">
                <Icon iconKey={topCategory.icon} color={topCategory.color ?? undefined} size="xl" round />
              </div>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Total income"
            value={formatCompactEur(totalIncome)}
            footer={(() => {
              const change = prevPeriodDataComplete ? pctChangeLabel(totalIncome, prevTotalIncome) : null;
              return change ? <ChangePill change={change} /> : `${priorCaption} — no data`;
            })()}
            badge={<TileBadge icon={TrendingUp} color="var(--color-income)" />}
          />
          <StatTile
            label="Total expenses"
            value={formatCompactEur(totalExpense)}
            footer={(() => {
              const change = prevPeriodDataComplete ? pctChangeLabel(totalExpense, prevTotalExpense) : null;
              return change ? <ChangePill change={{ ...change, up: !change.up }} /> : `${priorCaption} — no data`;
            })()}
            badge={<TileBadge icon={TrendingDown} color="var(--color-expense)" />}
          />
        </div>

        {/* Monthly chart + Pie */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-card p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-sm">Income vs Expenses</h2>
              <p className="text-xs text-foreground/60">Last 12 months</p>
            </div>
            <MonthlyLineChart data={lineChartData} />
            <div className="flex gap-4 text-xs text-foreground/60">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-1.5 rounded-full inline-block" style={{ backgroundColor: "var(--color-income)" }} /> Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-1.5 rounded-full inline-block" style={{ backgroundColor: "var(--color-expense)" }} /> Expenses
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-card p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm">Top categories</h2>
              <p className="text-xs text-foreground/60">Filter by main category</p>
            </div>
            <CategoryPieClient groups={pieGroups} />
          </div>
        </div>

        {/* Savings rate + Fixed costs — both genuinely "trend" content (how a rate or a
            recurring-cost mix moves over months) that used to live only on the Reports
            "Rapporten" tab; the components are reused as-is. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SavingsRateTrendCard data={savingsRateData} />
          <RecurringCostTrendCard data={fixedCostData} />
        </div>

        {/* Category sparkline list — subcategories shown individually, see groupedDetailed. */}
        <CategoryTrendList groups={groupedDetailed} months={months} financialMonth={financialMonth} periodRange={{ from, to }} />

        <MonthComparison
          cmpA={cmpA}
          cmpB={cmpB}
          labelA={longMonth(cmpA)}
          labelB={longMonth(cmpB)}
          statsA={statsA}
          statsB={statsB}
        />

      </div>

      <PeriodSelector from={from} to={to} financialMonth={financialMonth} budgetPeriod={null} />
    </div>
  );
}
