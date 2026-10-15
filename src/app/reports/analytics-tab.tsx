import { db } from "@/db";
import { transactions, categories, banks, merchants } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { formatEur, formatEurWhole, formatCompactEur, pctChangeLabel } from "@/lib/format";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { getBudgetOverview } from "@/lib/budget-overview";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { IconSparkles as Sparkles } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { SPLIT_GRID } from "@/components/page-container";
import { SectionHead } from "@/components/ui/page-heading";
import { Stat } from "@/components/ui/stat";
import { Bar, Ring } from "@/components/ui/ring";
import { CategoryIcon } from "@/components/ui/category-icon";
import { PairedBars } from "@/components/ui/charts";
import { ChangePill } from "@/components/change-pill";
import { CARD, FactTile, Kpi } from "./insights-ui";
import type { Bucket } from "@/components/mini-bar-chart";
import { AnchoredTip } from "@/components/anchored-tip";
import { SpendingDonutCard } from "./spending-donut-card";
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
      description: transactions.description,
      customName: transactions.customName,
      merchantName: merchants.name,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
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
        name: row.categoryName ?? "",
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
    const map = new Map<string, { name: string | null; color: string | null; total: number }>();
    for (const row of current.rows) {
      if (row.direction !== direction || row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
      const key = row.account ?? "unknown";
      const bank = row.account ? bankByAccount.get(row.account) : undefined;
      const entry = map.get(key) ?? { name: bank?.displayName ?? row.account ?? null, color: bank?.color ?? null, total: 0 };
      entry.total += row.correctedAmount ?? row.amount;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  // Largest single expense this period vs. the previous period's, for the stat tile.
  const expenseRows = relevant.filter((r) => r.direction === "expense");
  const largestExpense = expenseRows.reduce((max, r) => (r.amount > max ? r.amount : max), 0);
  const rowById = new Map(current.rows.map((r) => [r.id, r]));
  const nameOf = (id: number) => {
    const r = rowById.get(id);
    return r ? r.merchantName ?? r.customName ?? r.description : null;
  };
  const largestRow = expenseRows.find((r) => r.amount === largestExpense) ?? null;
  const largestExpenseName = largestRow ? nameOf(largestRow.transactionId) : null;

  // Top merchants this period: expense allocations grouped by the transaction's
  // merchant (transactions without one are left out), with how many visits made it up.
  const merchantMap = new Map<string, { name: string; total: number; visits: Set<number>; icon: string | null; color: string | null }>();
  for (const r of expenseRows) {
    const m = rowById.get(r.transactionId)?.merchantName;
    if (!m) continue;
    const entry = merchantMap.get(m) ?? { name: m, total: 0, visits: new Set<number>(), icon: r.categoryIcon, color: r.categoryColor };
    entry.total += r.amount;
    entry.visits.add(r.transactionId);
    merchantMap.set(m, entry);
  }
  const topMerchants = [...merchantMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 4)
    .map((m) => ({ name: m.name, total: m.total, visits: m.visits.size, icon: m.icon, color: m.color }));
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

  const transactionCount = relevant.length;
  const prevTransactionCount = prevRelevant.length;

  const today = toDateStr(new Date());
  const daysElapsed = Math.max(1, Math.min(days, spanDays(from, today < from ? from : today > to ? to : today)));
  const avgExpensePerDay = expense / daysElapsed;
  const avgIncomePerDay = income / daysElapsed;

  // Budget-derived "left per day" hint for the Cashflow card — only shown when a
  // budget is actually configured.
  let leftPerDayHint: { perDay: number; days: number } | null = null;
  if (budgetOverview?.budget && budgetOverview.daysLeft > 0) {
    const left = budgetOverview.budget.amount - budgetOverview.totalSpent;
    leftPerDayHint = { perDay: Math.max(0, left) / budgetOverview.daysLeft, days: budgetOverview.daysLeft };
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
    largestExpenseName,
    largestExpenseChange: pctChangeLabel(largestExpense, prevLargestExpense),
    topMerchants,
    transactionCount,
    transactionCountChange: transactionCount - prevTransactionCount,
    popularDayIdx,
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
  /** True inside the old dashboard Reports portal, where the filter bar sticks at 0. */
  embedded?: boolean;
}) {
  const data = await getAnalyticsData(from, to, financialMonth, categoryIds, accounts);
  const t = await getTranslations("insights.overview");
  const locale = await getLocale();
  const maxWeekdayCount = Math.max(...data.weekdayCounts, 1);
  const weekdayName = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 1 + data.popularDayIdx));
  const weekdayLetters = [1, 2, 3, 4, 5, 6, 7].map((d) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, d)));
  const periodShort = new Date(`${to}T00:00:00`).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { month: "short" });
  const savedPct = data.income > 0 ? Math.round((data.cashflow / data.income) * 100) : null;
  const expenseByAccountTotal = data.expenseByAccount.reduce((s, a) => s + a.total, 0);

  return (
    <div className="flex flex-col gap-5">
      <AnalyticsFilterBar
        categories={data.allCategories}
        banks={data.allBanks}
        stickyTop={embedded ? "0px" : "calc(var(--sat) + 50px)"}
      />

      {/* KPIs — income, expenses, what was saved, the largest single expense. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3.5">
        <Kpi label={t("income")} value={formatEur(data.income)} tone="positive" change={data.incomeChange} />
        <Kpi
          label={t("expenses")}
          value={formatEur(data.expense)}
          change={data.expenseChange ? { ...data.expenseChange, up: !data.expenseChange.up } : null}
        />
        <Kpi
          label={t("saved")}
          value={savedPct != null ? t("savedValue", { amount: formatEurWhole(data.cashflow), pct: savedPct }) : formatEur(data.cashflow)}
          tone="accent"
          change={data.cashflowChange}
        />
        <Kpi
          label={t("largest")}
          value={data.largestExpenseName ? `${data.largestExpenseName} · ${formatEurWhole(data.largestExpense)}` : formatEur(data.largestExpense)}
          change={data.largestExpenseChange ? { ...data.largestExpenseChange, up: !data.largestExpenseChange.up } : null}
        />
      </div>

      <div className={SPLIT_GRID}>
        <div className="flex min-w-0 flex-col gap-5">
          {/* Week by week — spending and income per stretch of the period (the old
              Cashflow card's paired bars), with the budget's per-day hint. */}
          <section className={cn(CARD, "flex flex-col gap-3.5 p-[18px] lg:px-5")}>
            <SectionHead
              title={t("weekByWeek")}
              size="sm"
              link={
                <span className="inline-flex items-center gap-3 text-ink-2">
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-ink" />{t("spending")}</span>
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-positive" />{t("incomeShort")}</span>
                </span>
              }
            />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-ink-2">{t("cashflow")}</span>
              <span className="flex items-center gap-2">
                <span className={cn("amount text-[22px] tabular-nums", data.cashflow < 0 ? "text-negative" : "text-ink")}>{formatEur(data.cashflow)}</span>
                <ChangePill change={data.cashflowChange} />
              </span>
            </div>
            <PairedBars
              pairs={data.spendingBuckets.map((b, i) => ({
                label: b.label,
                a: b.value,
                b: data.incomeBuckets[i]?.value ?? 0,
                title: `${b.label} · ${t("spending")} ${formatEur(b.value)} · ${t("incomeShort")} ${formatEur(data.incomeBuckets[i]?.value ?? 0)}`,
              }))}
              colors={["var(--arca-ink)", "var(--arca-positive)"]}
              height={150}
            />
            {data.leftPerDayHint && (
              <p className="flex items-center gap-1.5 text-xs text-ink-3">
                <Sparkles className="size-4 shrink-0" />
                {t("leftPerDay", { amount: formatEur(data.leftPerDayHint.perDay), days: data.leftPerDayHint.days })}
              </p>
            )}
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Top merchants */}
            <section data-tip-anchor="insightsMerchants" className={cn(CARD, "flex flex-col gap-2 px-[18px] py-4 lg:px-5")}>
              <SectionHead title={t("topMerchants")} size="sm" link={t("all")} href="/transactions" />
              {data.topMerchants.length === 0 ? (
                <p className="text-[13px] text-ink-3">{t("noMerchants")}</p>
              ) : (
                data.topMerchants.map((m) => (
                  <div key={m.name} className="flex min-h-[52px] items-center gap-3">
                    <CategoryIcon icon={m.icon} color={m.color} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold text-ink">{m.name}</span>
                      <span className="text-xs text-ink-3">{t("visits", { count: m.visits })}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatEur(m.total)}</span>
                  </div>
                ))
              )}
            </section>

            {/* By account */}
            <section className={cn(CARD, "flex flex-col gap-2 px-[18px] py-4 lg:px-5")}>
              <SectionHead title={t("byAccount")} size="sm" />
              {data.expenseByAccount.length === 0 ? (
                <p className="text-[13px] text-ink-3">{t("noSpending")}</p>
              ) : (
                data.expenseByAccount.slice(0, 5).map((a, i) => (
                  <div key={`${a.name}-${i}`} className="flex min-h-12 flex-col justify-center gap-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-ink">{a.name ?? t("unknownAccount")}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{formatEur(a.total)}</span>
                    </div>
                    <Bar pct={expenseByAccountTotal > 0 ? (a.total / expenseByAccountTotal) * 100 : 0} color={a.color ?? "var(--arca-ink)"} height={6} />
                  </div>
                ))
              )}
              <p className="text-xs leading-[1.5] text-ink-3">{t("accountsNote")}</p>
            </section>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <SpendingDonutCard
            visibleRows={data.spendingCategoryVisible}
            allRows={data.spendingCategoryAll}
            total={data.expense}
            periodShort={periodShort}
            financialMonth={financialMonth}
            budgetPeriod={data.budgetPeriod}
          />
          <IncomeCategoryPreview
            rows={data.incomeCategoryAll}
            financialMonth={financialMonth}
            budgetPeriod={data.budgetPeriod}
            emptyLabel={t("noIncome")}
            total={data.income}
          />
        </div>
      </div>

      {/* Kept from the old Overview: the budget, the period's facts and its calendar. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {data.budgetOverview?.budget && (
          <section className={cn(CARD, "flex flex-col gap-4 p-[18px] lg:px-5")}>
            <SectionHead title={t("budget")} size="sm" link={t("open")} href="/budget" />
            <div className="flex items-center gap-5">
              <Ring
                pct={data.budgetOverview.budget.amount > 0 ? (data.budgetOverview.totalSpent / data.budgetOverview.budget.amount) * 100 : 0}
                color={data.budgetOverview.totalSpent > data.budgetOverview.budget.amount ? "var(--arca-negative)" : "var(--arca-accent)"}
                size={88}
                stroke={9}
              >
                <span className="amount text-lg text-ink">
                  {Math.round(data.budgetOverview.budget.amount > 0 ? (data.budgetOverview.totalSpent / data.budgetOverview.budget.amount) * 100 : 0)}%
                </span>
              </Ring>
              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-ink-2">{t("left")}</span>
                <span className="amount text-2xl tabular-nums text-ink">
                  {formatEur(Math.max(0, data.budgetOverview.budget.amount - data.budgetOverview.totalSpent))}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label={data.budgetOverview.budget.period === "weekly" ? t("weekly") : t("monthly")} value={<span className="text-sm">{periodLabel}</span>} />
              <Stat label={t("daysLeft")} value={t("days", { count: data.budgetOverview.daysLeft })} />
            </div>
          </section>
        )}

        <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:gap-3.5", !data.budgetOverview?.budget && "lg:col-span-2")}>
          <FactTile label={t("favoriteCategory")}>
            {data.favoriteCategory ? (
              <span className="flex min-w-0 items-center gap-2">
                <CategoryIcon icon={data.favoriteCategory.icon} color={data.favoriteCategory.color} size="sm" />
                <span className="truncate text-[15px] font-bold text-ink">{data.favoriteCategory.name}</span>
              </span>
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </FactTile>
          <FactTile label={t("transactions")}>
            <span className="amount text-[22px] text-ink">{data.transactionCount}</span>
            <span className="text-xs text-ink-3">
              {t("vsLastPeriod", { change: `${data.transactionCountChange >= 0 ? "+" : ""}${data.transactionCountChange}` })}
            </span>
          </FactTile>
          <FactTile label={t("popularDay")} className="col-span-2 sm:col-span-1">
            <span className="text-[15px] font-bold capitalize text-ink">{weekdayName}</span>
            <span className="flex h-8 items-end gap-1" aria-hidden>
              {data.weekdayCounts.map((c, i) => (
                <span
                  key={i}
                  className={cn("flex-1 rounded-[3px]", c === maxWeekdayCount && c > 0 ? "bg-mustard" : "bg-surface-2")}
                  style={{ height: `${Math.max(10, (c / maxWeekdayCount) * 100)}%` }}
                />
              ))}
            </span>
            <span className="flex">
              {weekdayLetters.map((l, i) => (
                <span key={i} className="flex-1 text-center font-mono text-[9px] uppercase text-ink-3">{l}</span>
              ))}
            </span>
          </FactTile>
        </div>
      </div>

      {/* Calendar — net per day, with the period's daily averages. */}
      <section className={cn(CARD, "flex flex-col gap-3.5 p-[18px] lg:px-5")}>
        <SectionHead title={t("calendar")} size="sm" />
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {weekdayLetters.map((l, i) => (
            <span key={i} className="font-mono text-[10px] uppercase text-ink-3">{l}</span>
          ))}
          {Array.from({ length: mondayIndex(new Date(`${data.calendarDays[0]?.date ?? data.from}T00:00:00`).getDay()) }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {data.calendarDays.map((d) => (
            <div
              key={d.date}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-tile lg:aspect-auto lg:h-14",
                d.hasActivity ? "bg-surface-2" : "",
                d.isToday && "ring-2 ring-mustard",
              )}
            >
              <span className="font-mono text-[11px] text-ink-2">{d.day}</span>
              {d.hasActivity ? (
                <span className={cn("text-[10px] font-semibold tabular-nums sm:text-[11px]", d.net >= 0 ? "text-positive" : "text-ink-3")}>
                  {formatCompactEur(d.net)}
                </span>
              ) : (
                <span className="text-[9px] text-ink-3">–</span>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t("avgExpense")} value={formatEur(data.avgExpensePerDay)} />
          <Stat label={t("avgIncome")} value={formatEur(data.avgIncomePerDay)} tone="positive" />
        </div>
      </section>

      <AnchoredTip id="insightsMerchants" anchor="insightsMerchants" active={data.topMerchants.length > 0} />

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
