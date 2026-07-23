import { db } from "@/db";
import { transactions, categories, banks } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { formatEur, formatCompactEur, pctChangeLabel } from "@/lib/format";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { getBudgetOverview } from "@/lib/budget-overview";
import type { FinancialMonthConfig } from "@/lib/date-range";
import {
  IconSparkles as Sparkles,
  IconPercentage as Percentage,
} from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { ChangeRow } from "@/components/change-pill";
import { MiniBarChart, PairedBarChart, type Bucket } from "@/components/mini-bar-chart";
import { StatTile, TileBadge } from "@/components/stat-tile";
import { SpendingCategoryPreview } from "./spending-category-preview";
import { IncomeCategoryPreview } from "./income-category-preview";
import { PeriodSelector } from "./period-selector";
import { AnalyticsFilterBar } from "./analytics-filter-bar";
import type { CategorySpendCard } from "@/components/category-spending-row";

// ── Small helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function spanDays(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1;
}

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
// JS getDay() is 0=Sunday..6=Saturday; rotate so the week starts Monday, matching
// the rest of the app's calendars.
function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

// Splits [from, to] into up to 5 roughly-equal day-of-month buckets ("1-7", "8-14", …)
// — a calendar-agnostic approximation that still reads naturally for both a
// calendar month and a custom financial-month range.
function buildBuckets(from: string, to: string, dailyTotals: Map<string, number>): Bucket[] {
  const total = spanDays(from, to);
  // Short (week-length) ranges get one bucket per day instead of being collapsed
  // by the div-by-7 grouping below, which degenerates to a single bucket at total=7.
  if (total <= 7) {
    const fromDate = new Date(`${from}T00:00:00`);
    const buckets: Bucket[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(fromDate);
      d.setDate(fromDate.getDate() + i);
      const iso = toDateStr(d);
      buckets.push({ label: WEEKDAY_LABELS[mondayIndex(d.getDay())], value: dailyTotals.get(iso) ?? 0 });
    }
    return buckets;
  }
  const bucketCount = Math.min(5, Math.max(1, Math.ceil(total / 7)));
  const bucketSize = Math.ceil(total / bucketCount);
  const buckets: Bucket[] = [];
  const fromDate = new Date(`${from}T00:00:00`);
  for (let i = 0; i < bucketCount; i++) {
    const startIdx = i * bucketSize;
    if (startIdx >= total) break;
    const endIdx = Math.min(total - 1, startIdx + bucketSize - 1);
    const startDate = new Date(fromDate);
    startDate.setDate(fromDate.getDate() + startIdx);
    const endDate = new Date(fromDate);
    endDate.setDate(fromDate.getDate() + endIdx);
    let value = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      value += dailyTotals.get(toDateStr(d)) ?? 0;
    }
    buckets.push({ label: startDate.getDate() === endDate.getDate() ? `${startDate.getDate()}` : `${startDate.getDate()}-${endDate.getDate()}`, value });
  }
  return buckets;
}

// ── Data ────────────────────────────────────────────────────────────────────

async function loadAllocations(from: string, to: string, categoryIds?: number[], accounts?: string[]) {
  let rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryGroup: categories.group,
      account: transactions.account,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(desc(transactions.date));

  // Category/account filter (Analytics + Trends "select one or multiple" pickers) —
  // applied to both the current and previous period so period-over-period % changes
  // stay meaningful for whatever subset is selected.
  if (categoryIds && categoryIds.length > 0) rows = rows.filter((r) => r.categoryId != null && categoryIds.includes(r.categoryId));
  if (accounts && accounts.length > 0) rows = rows.filter((r) => r.account != null && accounts.includes(r.account));

  const splitRows = await getTransactionSplitRows(rows.map((r) => r.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(rows, splitMap);
  return { rows, allocations };
}

async function getAnalyticsData(
  from: string,
  to: string,
  financialMonth: FinancialMonthConfig,
  categoryIds?: number[],
  accounts?: string[],
) {
  const days = spanDays(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  const [current, previous, allBanks, allCategories, budgetOverview] = await Promise.all([
    loadAllocations(from, to, categoryIds, accounts),
    loadAllocations(prevFrom, prevTo, categoryIds, accounts),
    db.select().from(banks),
    db.select().from(categories),
    getBudgetOverview(financialMonth).catch(() => null),
  ]);
  const bankRows = allBanks.map((b) => ({ accountNumber: b.accountNumber, displayName: b.displayName, color: b.color }));
  const excludedCategoryIds = new Set(allCategories.filter((c) => c.excludeFromSpendingRow).map((c) => c.id));

  const relevant = current.allocations.filter((r) => !r.isReimbursement && !r.isInternalTransfer && r.categoryGroup !== "savings");
  const prevRelevant = previous.allocations.filter((r) => !r.isReimbursement && !r.isInternalTransfer && r.categoryGroup !== "savings");

  const income = relevant.filter((r) => r.direction === "income").reduce((s, r) => s + r.amount, 0);
  const expense = relevant.filter((r) => r.direction === "expense").reduce((s, r) => s + r.amount, 0);
  const prevIncome = prevRelevant.filter((r) => r.direction === "income").reduce((s, r) => s + r.amount, 0);
  const prevExpense = prevRelevant.filter((r) => r.direction === "expense").reduce((s, r) => s + r.amount, 0);
  const cashflow = income - expense;
  const prevCashflow = prevIncome - prevExpense;

  // Daily net/spend/income maps, for the weekly-bucket bar charts.
  const dailyNet = new Map<string, number>();
  const dailyExpense = new Map<string, number>();
  const dailyIncome = new Map<string, number>();
  for (const r of relevant) {
    const sign = r.direction === "income" ? r.amount : -r.amount;
    dailyNet.set(r.date, (dailyNet.get(r.date) ?? 0) + sign);
    if (r.direction === "expense") dailyExpense.set(r.date, (dailyExpense.get(r.date) ?? 0) + r.amount);
    else dailyIncome.set(r.date, (dailyIncome.get(r.date) ?? 0) + r.amount);
  }
  const cashflowBuckets = buildBuckets(from, to, dailyNet);
  const spendingBuckets = buildBuckets(from, to, dailyExpense);
  const incomeBuckets = buildBuckets(from, to, dailyIncome);

  // Spend/income by category — same rollup convention as the rest of Reports (no
  // parent/child merge here, breaks down by the actual tagged category).
  function topByCategory(direction: "income" | "expense") {
    const map = new Map<string, { categoryId: number | null; name: string; color: string | null; icon: string | null; total: number; excluded: boolean }>();
    for (const row of relevant) {
      if (row.direction !== direction) continue;
      const key = row.categoryId != null ? `id:${row.categoryId}` : "uncategorized";
      const current = map.get(key) ?? {
        categoryId: row.categoryId,
        name: row.categoryName ?? "Uncategorized",
        color: row.categoryColor,
        icon: row.categoryIcon,
        total: 0,
        excluded: row.categoryId != null && excludedCategoryIds.has(row.categoryId),
      };
      current.total += row.amount;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }
  const bankByAccount = new Map(bankRows.map((b) => [b.accountNumber, b]));
  // Account grouping works off the raw rows (not the split allocations) since a
  // transaction's account isn't split-aware — the whole transaction belongs to one account.
  function topByAccount(direction: "income" | "expense") {
    const map = new Map<string, { name: string; color: string | null; total: number }>();
    for (const row of current.rows) {
      if (row.direction !== direction || row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
      const key = row.account ?? "unknown";
      const bank = row.account ? bankByAccount.get(row.account) : undefined;
      const entry = map.get(key) ?? { name: bank?.displayName ?? row.account ?? "Unknown account", color: bank?.color ?? null, total: 0 };
      entry.total += row.correctedAmount ?? row.amount;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  // Largest single expense this period vs. the previous period's, for the stat tile.
  const expenseRows = relevant.filter((r) => r.direction === "expense");
  const largestExpense = expenseRows.reduce((max, r) => (r.amount > max ? r.amount : max), 0);
  const prevLargestExpense = prevRelevant.filter((r) => r.direction === "expense").reduce((max, r) => (r.amount > max ? r.amount : max), 0);

  const expenseByCategory = topByCategory("expense");
  const incomeByCategory = topByCategory("income");
  // Skip the "uncategorized" bucket (null categoryId) — "Favorite category" should
  // surface an actual category, not the catch-all for untagged spend.
  const favoriteCategory = expenseByCategory.find((c) => c.categoryId != null) ?? null;

  // "Spending by category" preview (top 3 + View all) reuses the same portal the
  // dashboard's own spending row opens — so each card needs the same shape,
  // including per-category budget/pct merged in from the budget overview.
  const budgetByCategoryId = new Map((budgetOverview?.categories ?? []).map((c) => [c.categoryId, c.budget]));
  const spendingCategoryAll: CategorySpendCard[] = expenseByCategory
    .filter((c): c is typeof c & { categoryId: number } => c.categoryId != null)
    .map((c) => {
      const budget = budgetByCategoryId.get(c.categoryId) ?? null;
      return {
        categoryId: c.categoryId,
        categoryName: c.name,
        color: c.color,
        icon: c.icon,
        spent: c.total,
        budget,
        pct: budget != null && budget > 0 ? c.total / budget : null,
        excluded: c.excluded,
      };
    });
  const spendingCategoryVisible = spendingCategoryAll.filter((c) => !c.excluded);
  const budgetPeriod = budgetOverview ? { from: budgetOverview.from, to: budgetOverview.to } : { from, to };

  // "Income by category" preview (top 3 + View all) — income categories don't carry
  // a budget/pct or a spending-row exclusion flag, so those are always null/false.
  const incomeCategoryAll: CategorySpendCard[] = incomeByCategory
    .filter((c): c is typeof c & { categoryId: number } => c.categoryId != null)
    .map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.name,
      color: c.color,
      icon: c.icon,
      spent: c.total,
      budget: null,
      pct: null,
      excluded: false,
    }));

  // Popular weekday, by transaction count within the period (any direction).
  const weekdayCounts = new Array(7).fill(0);
  for (const row of relevant) {
    const idx = mondayIndex(new Date(`${row.date}T00:00:00`).getDay());
    weekdayCounts[idx]++;
  }
  const popularDayIdx = weekdayCounts.reduce((best, v, i) => (v > weekdayCounts[best] ? i : best), 0);
  const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const transactionCount = relevant.length;
  const prevTransactionCount = prevRelevant.length;

  const today = toDateStr(new Date());
  const daysElapsed = Math.max(1, Math.min(days, spanDays(from, today < from ? from : today > to ? to : today)));
  const avgExpensePerDay = expense / daysElapsed;
  const avgIncomePerDay = income / daysElapsed;

  // Budget-derived "left per day" hint for the Cashflow card — only shown when a
  // budget is actually configured.
  let leftPerDayHint: string | null = null;
  if (budgetOverview?.budget && budgetOverview.daysLeft > 0) {
    const left = budgetOverview.budget.amount - budgetOverview.totalSpent;
    leftPerDayHint = `About ${formatEur(Math.max(0, left) / budgetOverview.daysLeft)}/day left for the remaining ${budgetOverview.daysLeft} day${budgetOverview.daysLeft === 1 ? "" : "s"}`;
  }

  // Calendar — one entry per day in the period, net total (income green, spend
  // shown as its own euro amount) so the grid mirrors the "day totals" screenshot.
  const calendarDays: { date: string; day: number; net: number; hasActivity: boolean; isToday: boolean }[] = [];
  for (let d = new Date(`${from}T00:00:00`); d <= new Date(`${to}T00:00:00`); d.setDate(d.getDate() + 1)) {
    const key = toDateStr(d);
    const net = dailyNet.get(key) ?? 0;
    calendarDays.push({ date: key, day: d.getDate(), net, hasActivity: dailyNet.has(key), isToday: key === today });
  }

  return {
    from, to, days,
    income, expense, cashflow,
    incomeChange: pctChangeLabel(income, prevIncome),
    expenseChange: pctChangeLabel(expense, prevExpense),
    cashflowChange: pctChangeLabel(cashflow, prevCashflow),
    cashflowBuckets, spendingBuckets, incomeBuckets,
    expenseByCategory, incomeByCategory,
    expenseByAccount: topByAccount("expense"),
    incomeByAccount: topByAccount("income"),
    spendingCategoryVisible, spendingCategoryAll, incomeCategoryAll, budgetPeriod,
    favoriteCategory,
    largestExpense,
    largestExpenseChange: pctChangeLabel(largestExpense, prevLargestExpense),
    transactionCount,
    transactionCountChange: transactionCount - prevTransactionCount,
    popularDayName: WEEKDAY_NAMES[popularDayIdx],
    weekdayCounts,
    avgExpensePerDay, avgIncomePerDay,
    leftPerDayHint,
    budgetOverview,
    calendarDays,
    allBanks,
    allCategories,
  };
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export async function AnalyticsTab({
  from,
  to,
  financialMonth,
  periodLabel,
  categoryIds,
  accounts,
  embedded = false,
}: {
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  periodLabel: string;
  categoryIds?: number[];
  accounts?: string[];
  /** True when rendered inside the dashboard's Reports portal instead of the
   * standalone /reports page — that portal gives each tab its own independently
   * scrolling pane, so the filter bar only needs `top: 0` there instead of an
   * offset clearing the page's own sticky header (see AnalyticsFilterBar). */
  embedded?: boolean;
}) {
  const data = await getAnalyticsData(from, to, financialMonth, categoryIds, accounts);
  const maxWeekdayCount = Math.max(...data.weekdayCounts, 1);

  return (
    <div className="px-4 pt-1 pb-[calc(8rem+var(--sab))] lg:pb-4 space-y-4">
      <AnalyticsFilterBar
        categories={data.allCategories}
        banks={data.allBanks}
        stickyTop={embedded ? "0px" : "calc(var(--sat) + 9rem)"}
      />

      {/* Cashflow */}
      <div className="bg-[var(--dialog-content-background)] p-1 rounded-2xl">
        <div className="rounded-b-sm rounded-t-2xl bg-[var(--dialog-background)]/60 dark:bg-[var(--dialog-background)]/30 py-2 px-4 pb-3">
          <p className="text-md text-foreground/60 mb-1">Cashflow</p>
          <p className={`text-2xl font-semibold tabular-nums tracking-tight ${data.cashflow < 0 ? "text-foreground" : "text-foreground"}`}>
            {data.cashflow < 0 ? "" : ""}{formatEur(Math.abs(data.cashflow))}
          </p>
          <ChangeRow change={data.cashflowChange} className="mt-1 mb-5" />
          <PairedBarChart a={data.spendingBuckets} b={data.incomeBuckets} />
          {data.leftPerDayHint && (
            <p className="flex items-center gap-1.5 text-sm text-foreground/50 mt-3">
              <Sparkles className="size-4 shrink-0" />
              {data.leftPerDayHint}
            </p>
          )}
        </div>

        {/* Spending / Income mini-summary rows */}
        <div className="rounded-2xl px-4 mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-md">
            <span className="size-2 rounded-full bg-foreground/30" /> Spending
          </span>
          <span className="text-md tabular-nums">{formatEur(data.expense)}</span>
        </div>
        <div className="rounded-2xl px-4 py-1 mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-md">
            <span className="size-2 rounded-full" style={{ backgroundColor: "var(--color-income)" }} /> Income
          </span>
          <span className="text-md abular-nums" style={{ color: "var(--color-income)" }}>+{formatEur(data.income)}</span>
        </div>
      </div>

      {/* Spending */}
      <div className="bg-[var(--dialog-content-background)] p-1 rounded-2xl">
        <div className="rounded-b-sm rounded-t-2xl bg-[var(--dialog-background)]/60 dark:bg-[var(--dialog-background)]/30 py-2 px-4 pb-3">
          <p className="text-md text-foreground/60 mb-1">Spending</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatEur(data.expense)}</p>
          <ChangeRow change={data.expenseChange ? { ...data.expenseChange, up: !data.expenseChange.up } : null} className="mt-1 mb-5" />
          <MiniBarChart buckets={data.spendingBuckets} color={() => "color-mix(in srgb, var(--foreground) 30%, transparent)"} />
        </div>

        <SpendingCategoryPreview
          visibleRows={data.spendingCategoryVisible}
          allRows={data.spendingCategoryAll}
          financialMonth={financialMonth}
          budgetPeriod={data.budgetPeriod}
          emptyLabel="No spending yet this period."
          total={data.expense}
        />
      </div>

      {/* Income — same grouped bg-white/5 + bg-white/2 shell as Spending */}
      <div className="bg-[var(--dialog-content-background)] p-1 rounded-2xl">
        <div className="rounded-b-sm rounded-t-2xl bg-[var(--dialog-background)]/60 dark:bg-[var(--dialog-background)]/30 py-2 px-4 pb-3">
          <p className="text-md text-foreground/60 mb-1">Income</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--color-income)" }}>+{formatEur(data.income)}</p>
          <ChangeRow change={data.incomeChange} className="mt-1 mb-5" />
          <MiniBarChart buckets={data.incomeBuckets} color={() => "color-mix(in srgb, var(--foreground) 30%, transparent)"} />
        </div>

        <IncomeCategoryPreview
          rows={data.incomeCategoryAll}
          financialMonth={financialMonth}
          budgetPeriod={data.budgetPeriod}
          emptyLabel="No income yet this period."
          total={data.income}
        />
      </div>

      {/* Budget ring */}
      {data.budgetOverview?.budget && (
        <div className="rounded-2xl bg-[var(--dialog-content-background)] p-5">
          <p className="font-semibold text-sm mb-4">Budget</p>
          <div className="flex items-center gap-5">
            <BudgetRing pct={data.budgetOverview.budget.amount > 0 ? (data.budgetOverview.totalSpent / data.budgetOverview.budget.amount) * 100 : 0} />
            <div>
              <p className="text-sm text-foreground/60">Left</p>
              <p className="text-2xl font-semibold tabular-nums">{formatEur(Math.max(0, data.budgetOverview.budget.amount - data.budgetOverview.totalSpent))}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/40">
            <div>
              <p className="text-xs text-foreground/50">{data.budgetOverview.budget.period === "weekly" ? "Weekly" : "Monthly"}</p>
              <p className="text-sm font-medium">{periodLabel}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Days left</p>
              <p className="text-sm font-medium">{data.budgetOverview.daysLeft} days left</p>
            </div>
          </div>
        </div>
      )}

      {/* Largest expense / Favorite category — square tiles, same shape as the
          category detail page's stat cards (src/components/category-insight-cards.tsx) */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Largest expense"
          value={formatCompactEur(data.largestExpense)}
          badge={<TileBadge icon={Percentage} color="var(--color-danger)" />}
        />
        <StatTile
          label="Favorite category"
          valueClassName="text-base font-bold truncate"
          value={data.favoriteCategory ? data.favoriteCategory.name : <span className="text-white/40 font-normal">—</span>}
          badge={data.favoriteCategory && (
            <div className="absolute bottom-3 left-3">
              <Icon iconKey={data.favoriteCategory.icon} color={data.favoriteCategory.color ?? undefined} size="xl" round />
            </div>
          )}
        />
      </div>

      {/* Transactions / Popular day — square tiles, same treatment as above */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Transactions"
          value={data.transactionCount}
          footerAtBottom
          footer={`${data.transactionCountChange >= 0 ? "+" : ""}${data.transactionCountChange} vs last period`}
        />
        <div className="rounded-2xl bg-[var(--dialog-content-background)] p-4 flex flex-col aspect-square">
          <p className="text-xs text-foreground/50 mb-1">Popular day</p>
          <p className="text-base font-bold text-foreground mb-2">{data.popularDayName}</p>
          <div className="mt-auto">
            <div className="flex items-end gap-1 h-8">
              {data.weekdayCounts.map((c, i) => (
                <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(10, (c / maxWeekdayCount) * 100)}%`, background: c === maxWeekdayCount && c > 0 ? "color-mix(in srgb, var(--foreground) 80%, transparent)" : "color-mix(in srgb, var(--foreground) 30%, transparent)" }} />
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {WEEKDAY_LABELS.map((l, i) => <span key={i} className="text-[9px] text-muted-foreground flex-1 text-center">{l}</span>)}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="rounded-2xl bg-[var(--dialog-content-background)] p-5">
        <p className="font-semibold text-sm mb-3">Calendar</p>
        <div className="grid grid-cols-7 gap-1.5 text-center mb-4">
          {WEEKDAY_LABELS.map((l, i) => <span key={i} className="text-[11px] text-foreground/40">{l}</span>)}
          {/* Leading blanks so the 1st lands under its real weekday column */}
          {Array.from({ length: mondayIndex(new Date(`${data.calendarDays[0]?.date ?? data.from}T00:00:00`).getDay()) }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {data.calendarDays.map((d) => (
            <div
              key={d.date}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center ${d.isToday ? "ring-1 ring-foreground/50" : ""}`}
              style={{ background: d.hasActivity ? "color-mix(in srgb, var(--foreground) 6%, transparent)" : "color-mix(in srgb, var(--foreground) 2%, transparent)" }}
            >
              <p className="text-xs font-light mb-1">{d.day}</p>
              {d.hasActivity ? (
                <p className={`text-[11px] font-semibold tabular-nums ${d.net >= 0 ? "" : "text-foreground/40"}`} style={d.net >= 0 ? { color: "var(--color-income)" } : undefined}>
                  {d.net >= 0 ? "" : ""}{formatCompactEur(d.net)}
                </p>
              ) : (
                <p className="text-[9px] text-foreground/25">-</p>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/40">
          <div>
            <p className="text-md text-foreground/50">Avg expense / day</p>
              <p className="flex items-center gap-2 text-lg font-semibold">
                <span className="h-2 w-2 rounded-full bg-foreground/50" />
              {formatEur(data.avgExpensePerDay)}
            </p>  
          </div>
          <div>
            <p className="text-md text-foreground/50">Avg income / day</p>
            <p className="flex items-center gap-2 text-lg font-semibold">
              <span className="h-2 w-2 rounded-full bg-[var(--color-income)]" />
              {formatEur(data.avgIncomePerDay)}
            </p>            
          </div>
        </div>
      </div>

      <PeriodSelector
        from={from}
        to={to}
        financialMonth={financialMonth}
        budgetPeriod={data.budgetOverview?.budget ? { from: data.budgetOverview.from, to: data.budgetOverview.to } : null}
        tab="rapporten"
        embedded={embedded}
      />
    </div>
  );
}

function BudgetRing({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const circumference = 2 * Math.PI * 40;
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--foreground)" strokeOpacity="0.1" strokeWidth="9" />
        <circle
          cx="50" cy="50" r="40" fill="none"
          stroke={clamped >= 100 ? "var(--danger)" : "var(--color-income)"}
          strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold tabular-nums">{Math.round(clamped)}%</span>
      </div>
    </div>
  );
}
