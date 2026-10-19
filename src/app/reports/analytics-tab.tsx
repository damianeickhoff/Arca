import { cache } from "react";
import { db } from "@/db";
import { transactions, categories, banks, merchants } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { IconBuildingStore, IconCoins, IconShoppingBag, IconTarget } from "@tabler/icons-react";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { getBudgetOverview } from "@/lib/budget-overview";
import { getBudgetRecurringMode } from "@/lib/app-settings";
import { getBillStatuses, UPCOMING_TYPES } from "@/lib/bill-status";
import { safeToSpend } from "@/lib/safe-to-spend";
import { currentFinancialMonth, daysInclusive, shiftDate, todayStr, type FinancialMonthConfig } from "@/lib/date-range";
import { Amount } from "@/components/clear/amount";
import { ClearChip } from "@/components/clear/chip";
import { Icon } from "@/components/icon";
import { AnchoredTip } from "@/components/anchored-tip";
import { isAiReady } from "@/lib/gemini";
import { getCachedSummary } from "@/lib/ai-features";
import { averagePerDay, buildSummaryFacts } from "@/lib/period-facts";
import { SummaryCard } from "./summary-card";
import type { CategorySpendCard } from "@/components/category-spending-row";
import { CategoryBreakdownCard } from "./category-breakdown-card";
import { PeriodSelector } from "./period-selector";
import { AnalyticsFilterBar } from "./analytics-filter-bar";
import {
  AccountsCard,
  CalendarCard,
  ChangeChip,
  EmptyOverview,
  FlowCard,
  KpiCard,
  MerchantsCard,
  change,
  type AccountRow,
  type CalendarDay,
  type FlowBucket,
  type FlowGrain,
  type MerchantRow,
  type SafeToSpendHint,
} from "./overview-cards";

// ── Small helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday = 0 … Sunday = 6. */
function mondayIndex(date: string): number {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
}

/** One request, one budget overview — the heading pills and the tab share it. */
const loadBudgetOverview = cache((financialMonth: FinancialMonthConfig) => getBudgetOverview(financialMonth).catch(() => null));

/**
 * How the period splits into chart groups: a day each for a week or less, stretches of
 * seven days from the first day up to six weeks, then calendar months, then years.
 */
function chartRanges(from: string, to: string): { grain: FlowGrain; ranges: { from: string; to: string }[] } {
  const days = daysInclusive(from, to);
  if (days <= 7) return { grain: "day", ranges: Array.from({ length: days }, (_, i) => ({ from: shiftDate(from, i), to: shiftDate(from, i) })) };
  if (days <= 42) {
    const ranges = [];
    for (let start = from; start <= to; start = shiftDate(start, 7)) {
      const end = shiftDate(start, 6);
      ranges.push({ from: start, to: end < to ? end : to });
    }
    return { grain: "week", ranges };
  }
  const months: { from: string; to: string }[] = [];
  let cursor = new Date(`${from.slice(0, 7)}-01T00:00:00`);
  while (toDateStr(cursor) <= to) {
    const first = toDateStr(cursor);
    const last = toDateStr(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
    months.push({ from: first < from ? from : first, to: last < to ? last : to });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  if (months.length <= 12) return { grain: "month", ranges: months };
  const years: { from: string; to: string }[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    years.push({ from: `${y}-01-01` < from ? from : `${y}-01-01`, to: `${y}-12-31` > to ? to : `${y}-12-31` });
  }
  return { grain: "year", ranges: years };
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
      merchantIcon: merchants.icon,
      merchantColor: merchants.color,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(desc(transactions.date));

  // The Categories / Accounts filters apply to both periods, so the changes against the
  // previous period stay meaningful for whatever subset is selected.
  if (categoryIds && categoryIds.length > 0) rows = rows.filter((r) => r.categoryId != null && categoryIds.includes(r.categoryId));
  if (accounts && accounts.length > 0) rows = rows.filter((r) => r.account != null && accounts.includes(r.account));

  const splitRows = await getTransactionSplitRows(rows.map((r) => r.id));
  const allocations = buildSplitAllocations(rows, groupTransactionSplits(splitRows));
  return { rows, allocations };
}

async function getOverviewData(from: string, to: string, financialMonth: FinancialMonthConfig, categoryIds?: number[], accounts?: string[]) {
  const days = daysInclusive(from, to);
  const prevTo = shiftDate(from, -1);
  const prevFrom = shiftDate(prevTo, -(days - 1));
  const today = todayStr();
  const ongoing = from <= today && today <= to;

  const [current, previous, allBanks, allCategories, budgetOverview, recurringMode, billStatuses] = await Promise.all([
    loadAllocations(from, to, categoryIds, accounts),
    loadAllocations(prevFrom, prevTo, categoryIds, accounts),
    db.select().from(banks),
    db.select().from(categories),
    loadBudgetOverview(financialMonth),
    getBudgetRecurringMode(),
    // Bills still due only matter while the period is running.
    ongoing ? getBillStatuses(currentFinancialMonth(financialMonth), financialMonth, UPCOMING_TYPES) : Promise.resolve([]),
  ]);
  const excludedCategoryIds = new Set(allCategories.filter((c) => c.excludeFromSpendingRow).map((c) => c.id));

  // Spending and income leave out reimbursements, transfers between own accounts and
  // money moved into savings categories.
  const counts = (r: { isReimbursement: boolean; isInternalTransfer: boolean; categoryGroup: string | null }) =>
    !r.isReimbursement && !r.isInternalTransfer && r.categoryGroup !== "savings";
  const relevant = current.allocations.filter(counts);
  const prevRelevant = previous.allocations.filter(counts);
  const sum = (list: typeof relevant, direction: "income" | "expense") => list.filter((r) => r.direction === direction).reduce((s, r) => s + r.amount, 0);

  const income = sum(relevant, "income");
  const expense = sum(relevant, "expense");
  const prevIncome = sum(prevRelevant, "income");
  const prevExpense = sum(prevRelevant, "expense");
  const saved = income - expense;

  const dailyExpense = new Map<string, number>();
  const dailyIncome = new Map<string, number>();
  for (const r of relevant) {
    const map = r.direction === "expense" ? dailyExpense : dailyIncome;
    map.set(r.date, (map.get(r.date) ?? 0) + r.amount);
  }

  // Bills still due, by due date — expenses only, and only when they can belong to the
  // selection (no account is known for a bill, so an account filter leaves them out).
  const unpaid = billStatuses.filter((s) => s.dueDate != null && s.paid !== true && s.dueDate >= today);
  const dailyBills = new Map<string, number>();
  if (!accounts?.length) {
    for (const s of unpaid) {
      const due = s.dueDate!;
      if (s.item.type === "income" || s.item.type === "savings" || due < from || due > to) continue;
      if (categoryIds?.length && (s.item.categoryId == null || !categoryIds.includes(s.item.categoryId))) continue;
      dailyBills.set(due, (dailyBills.get(due) ?? 0) + (s.item.amount ?? 0));
    }
  }

  const { grain, ranges } = chartRanges(from, to);
  const sumRange = (map: Map<string, number>, r: { from: string; to: string }) => {
    let total = 0;
    for (const [date, v] of map) if (date >= r.from && date <= r.to) total += v;
    return total;
  };
  const flow = ranges.map((r) => ({
    ...r,
    income: sumRange(dailyIncome, r),
    spent: sumRange(dailyExpense, r),
    bills: sumRange(dailyBills, r),
    current: r.from <= today && today <= r.to,
    future: r.from > today,
  }));

  // Safe to spend for the rest of the budget period, while the period on screen runs.
  let hint: SafeToSpendHint | null = null;
  if (ongoing && budgetOverview) {
    const figures = safeToSpend(
      budgetOverview,
      unpaid.map((s) => ({ categoryId: s.item.categoryId, amount: s.item.amount ?? 0, dueDate: s.dueDate!, isIncome: s.item.type === "income" })),
      recurringMode,
      today,
    );
    if (figures) {
      hint = {
        perDay: figures.perDay,
        amount: figures.amount,
        daysLeft: Math.max(1, daysInclusive(today < budgetOverview.from ? budgetOverview.from : today, budgetOverview.to)),
      };
    }
  }

  // By category — the actual tagged category, no parent/child roll-up.
  function byCategory(direction: "income" | "expense") {
    const map = new Map<number, { categoryId: number; name: string; color: string | null; icon: string | null; total: number }>();
    for (const r of relevant) {
      if (r.direction !== direction || r.categoryId == null) continue;
      const entry = map.get(r.categoryId) ?? { categoryId: r.categoryId, name: r.categoryName ?? "", color: r.categoryColor, icon: r.categoryIcon, total: 0 };
      entry.total += r.amount;
      map.set(r.categoryId, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }
  // The category cards reuse the dashboard's list and detail portals, so each row gets
  // the same shape, with the category budget merged in from the budget overview.
  const budgetByCategoryId = new Map((budgetOverview?.categories ?? []).map((c) => [c.categoryId, c.budget]));
  const spendingAll: CategorySpendCard[] = byCategory("expense").map((c) => {
    const budget = budgetByCategoryId.get(c.categoryId) ?? null;
    return {
      categoryId: c.categoryId,
      categoryName: c.name,
      color: c.color,
      icon: c.icon,
      spent: c.total,
      budget,
      pct: budget != null && budget > 0 ? c.total / budget : null,
      excluded: excludedCategoryIds.has(c.categoryId),
    };
  });
  const incomeAll: CategorySpendCard[] = byCategory("income").map((c) => ({
    categoryId: c.categoryId,
    categoryName: c.name,
    color: c.color,
    icon: c.icon,
    spent: c.total,
    budget: null,
    pct: null,
    excluded: false,
  }));

  // The same, added up per group (Housing = Rent + Energy + …) — the card's Groups view.
  const categoryById = new Map(allCategories.map((c) => [c.id, c]));
  function byGroup(rows: CategorySpendCard[], withBudget: boolean): CategorySpendCard[] {
    const map = new Map<number, CategorySpendCard>();
    for (const r of rows) {
      const cat = categoryById.get(r.categoryId);
      const group = cat?.parentCategoryId != null ? categoryById.get(cat.parentCategoryId) : cat;
      if (!group) continue;
      const entry = map.get(group.id) ?? { categoryId: group.id, categoryName: group.name, color: group.color, icon: group.icon, spent: 0, budget: null, pct: null, excluded: false };
      entry.spent += r.spent;
      map.set(group.id, entry);
    }
    return [...map.values()]
      .map((g) => {
        const budget = withBudget ? budgetByCategoryId.get(g.categoryId) ?? null : null;
        return { ...g, budget, pct: budget != null && budget > 0 ? g.spent / budget : null };
      })
      .sort((a, b) => b.spent - a.spent);
  }

  // Largest single expense, with where and when.
  const rowById = new Map(current.rows.map((r) => [r.id, r]));
  const expenseRows = relevant.filter((r) => r.direction === "expense");
  const largest = expenseRows.reduce<(typeof expenseRows)[number] | null>((max, r) => (!max || r.amount > max.amount ? r : max), null);
  const largestRow = largest ? rowById.get(largest.transactionId) : undefined;
  const prevLargest = prevRelevant.filter((r) => r.direction === "expense").reduce((max, r) => Math.max(max, r.amount), 0);

  // Top merchants: expense allocations by the transaction's merchant, with the visits.
  const merchantMap = new Map<string, { name: string; total: number; visits: Set<number>; icon: string | null; color: string | null }>();
  for (const r of expenseRows) {
    const row = rowById.get(r.transactionId);
    if (!row?.merchantName) continue;
    const entry = merchantMap.get(row.merchantName) ?? {
      name: row.merchantName,
      total: 0,
      visits: new Set<number>(),
      icon: row.merchantIcon ?? r.categoryIcon,
      color: row.merchantColor ?? r.categoryColor,
    };
    entry.total += r.amount;
    entry.visits.add(r.transactionId);
    merchantMap.set(row.merchantName, entry);
  }
  const topMerchants: MerchantRow[] = [...merchantMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((m) => ({ name: m.name, total: m.total, visits: m.visits.size, icon: m.icon, color: m.color }));

  // By account — whole transactions, since an account isn't split-aware.
  const bankByAccount = new Map(allBanks.filter((b) => b.accountNumber).map((b) => [b.accountNumber!, b]));
  const accountMap = new Map<string, AccountRow>();
  for (const row of current.rows) {
    if (row.direction !== "expense" || row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
    const key = row.account ?? "unknown";
    const bank = row.account ? bankByAccount.get(row.account) : undefined;
    const entry = accountMap.get(key) ?? {
      key,
      name: bank?.displayName ?? row.account ?? null,
      suffix: row.account ? row.account.slice(-4) : null,
      icon: bank?.icon ?? null,
      color: bank?.color ?? null,
      total: 0,
      count: 0,
    };
    entry.total += row.correctedAmount ?? row.amount;
    entry.count += 1;
    accountMap.set(key, entry);
  }
  const accountsSpend = [...accountMap.values()].sort((a, b) => b.total - a.total);

  // The calendar: spending per day; days after today are still to come.
  const calendar: CalendarDay[] = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    calendar.push({ date: d, day: Number(d.slice(8)), spent: dailyExpense.get(d) ?? 0, today: d === today, future: d > today });
  }
  const daysElapsed = Math.max(1, daysInclusive(from, today < from ? from : today > to ? to : today));

  // Transactions without a category (Needs review), per direction — what "Other" holds.
  const uncategorisedIds = { expense: new Set<number>(), income: new Set<number>() };
  for (const r of relevant) if (r.categoryId == null) uncategorisedIds[r.direction === "income" ? "income" : "expense"].add(r.transactionId);

  // Most active weekday, by number of transactions.
  const weekdayCounts = new Array<number>(7).fill(0);
  for (const r of relevant) weekdayCounts[mondayIndex(r.date)]++;
  const popularDayIdx = relevant.length > 0 ? weekdayCounts.reduce((best, v, i) => (v > weekdayCounts[best] ? i : best), 0) : null;

  return {
    ongoing,
    income,
    expense,
    saved,
    prevExpense,
    prevDays: days,
    daysElapsed,
    incomeChange: change(income, prevIncome),
    expenseChange: change(expense, prevExpense),
    largest: largest
      ? {
          amount: largest.amount,
          name: largestRow ? largestRow.merchantName ?? largestRow.customName ?? largestRow.description : null,
          date: largest.date,
          categoryName: largest.categoryName ?? null,
          categoryIcon: largest.categoryIcon ?? null,
          categoryColor: largest.categoryColor ?? null,
          change: change(largest.amount, prevLargest),
        }
      : null,
    grain,
    flow,
    hint,
    spendingAll,
    spendingVisible: spendingAll.filter((c) => !c.excluded),
    incomeAll,
    groupSpendingAll: byGroup(spendingAll, true),
    groupSpendingVisible: byGroup(spendingAll.filter((c) => !c.excluded), true),
    groupIncomeAll: byGroup(incomeAll, false),
    budgetPeriod: budgetOverview ? { from: budgetOverview.from, to: budgetOverview.to } : { from, to },
    topMerchants,
    accountsSpend,
    calendar,
    avgExpensePerDay: averagePerDay(expense, daysElapsed),
    uncategorised: { expense: uncategorisedIds.expense.size, income: uncategorisedIds.income.size },
    popularDayIdx,
  };
}

// ── Heading filters ──────────────────────────────────────────────────────────

/** The heading pills of Overview and Trends: the period, then the Categories and Accounts filters. */
export async function InsightsFilters({
  from,
  to,
  financialMonth,
  tab,
}: {
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  tab: "rapporten" | "trends";
}) {
  const [allCategories, allBanks, budgetOverview] = await Promise.all([
    db.select().from(categories),
    db.select().from(banks),
    loadBudgetOverview(financialMonth),
  ]);
  return (
    <>
      <PeriodSelector
        from={from}
        to={to}
        financialMonth={financialMonth}
        budgetPeriod={budgetOverview?.budget ? { from: budgetOverview.from, to: budgetOverview.to } : null}
        tab={tab}
      />
      <AnalyticsFilterBar categories={allCategories} banks={allBanks} />
    </>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────

/**
 * Insights · Overview: the period's key figures, money in and out week by week, where it
 * went by category, merchant and account, and a calendar of spending per day. One grid:
 * the figures span the full width; then from xl the week chart (two columns) beside the
 * summary, the breakdown (two) beside the merchants, the accounts beside the calendar (two).
 */
export async function AnalyticsTab({
  from,
  to,
  financialMonth,
  categoryIds,
  accounts,
}: {
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  categoryIds?: number[];
  accounts?: string[];
}) {
  const [anyTransaction] = await db.select({ id: transactions.id }).from(transactions).limit(1);
  if (!anyTransaction) return <EmptyOverview />;

  const data = await getOverviewData(from, to, financialMonth, categoryIds, accounts);
  const t = await getTranslations("insights.overview");
  const tInsights = await getTranslations("insights");
  const locale = await getLocale();
  const dayMonth = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const date = (d: string) => new Date(`${d}T00:00:00`);
  const rangeLabel = dayMonth.formatRange(date(from), date(to));
  const savedPct = data.income > 0 ? Math.round((data.saved / data.income) * 100) : null;
  const popularDay =
    data.popularDayIdx != null ? new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 1 + data.popularDayIdx)) : null;

  // Chart labels: "Week 1" … with the dates under them, the running stretch called out.
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const monthName = new Intl.DateTimeFormat(locale, { month: "short" });
  const buckets: FlowBucket[] = data.flow.map((b, i) => {
    const label =
      data.grain === "day"
        ? b.current
          ? t("flow.today")
          : weekday.format(date(b.from))
        : data.grain === "week"
          ? b.current
            ? t("flow.thisWeek")
            : t("flow.weekN", { n: i + 1 })
          : data.grain === "month"
            ? monthName.format(date(b.from))
            : b.from.slice(0, 4);
    const sub = data.grain === "day" ? dayMonth.format(date(b.from)) : data.grain === "week" ? dayMonth.formatRange(date(b.from), date(b.to)) : null;
    return { key: b.from, label, sub, income: b.income, spent: b.spent, bills: b.bills, current: b.current, future: b.future };
  });

  const vsLast = <span>{tInsights("vsLastPeriod")}</span>;

  // The summary: computed facts, which Gemini (Settings › AI) writes up when it is on.
  // "v2": summaries are structured now; paragraph ones from before are never shown.
  const aiReady = await isAiReady();
  const signedPct = (c: { pct: number; up: boolean } | null) => (c ? (c.up ? c.pct : -c.pct) : null);
  const summaryKey = ["v2", locale, from, to, (categoryIds ?? []).join(","), (accounts ?? []).join(",")].join("|");
  const summaryFacts = buildSummaryFacts({
    from,
    to,
    ongoing: data.ongoing,
    income: data.income,
    expense: data.expense,
    incomeChangePct: signedPct(data.incomeChange),
    expenseChangePct: signedPct(data.expenseChange),
    daysElapsed: data.daysElapsed,
    prevExpense: data.prevExpense,
    prevDays: data.prevDays,
    left: data.hint,
    groups: data.groupSpendingVisible.map((g) => ({ name: g.categoryName, spent: g.spent })),
    categories: data.spendingAll.map((c) => ({ name: c.categoryName, spent: c.spent, budget: c.budget })),
    merchants: data.topMerchants.map((m) => ({ name: m.name, total: m.total, visits: m.visits })),
    largest: data.largest ? { name: data.largest.name, amount: data.largest.amount, category: data.largest.categoryName } : null,
    uncategorised: data.uncategorised.expense,
  });
  const cachedSummary = aiReady ? await getCachedSummary(summaryKey) : null;
  const summarySubtitle =
    data.ongoing && data.hint ? t("rangeDaysLeft", { range: rangeLabel, count: data.hint.daysLeft }) : rangeLabel;

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {/* Key figures — a row of four from xl, two by two below. */}
      <div className="grid grid-cols-2 gap-2.5 lg:col-span-2 lg:gap-5 xl:col-span-3 xl:grid-cols-4">
        <KpiCard
          highlight
          label={t("income")}
          icon={<IconCoins />}
          value={<Amount value={data.income} className="tabular-nums" centsClassName="opacity-55" />}
          foot={data.incomeChange && (
            <>
              <ChangeChip change={data.incomeChange} goodWhenUp onEmber />
              {vsLast}
            </>
          )}
        />
        <KpiCard
          label={t("expenses")}
          icon={<IconShoppingBag />}
          value={<Amount value={data.expense} className="tabular-nums" />}
          foot={data.expenseChange && (
            <>
              <ChangeChip change={data.expenseChange} goodWhenUp={false} />
              {vsLast}
            </>
          )}
        />
        <KpiCard
          label={t("saved")}
          icon={<IconTarget />}
          value={<Amount value={data.saved} className="tabular-nums" />}
          foot={savedPct != null && (
            <>
              <ClearChip tone="sky" className="h-6 px-2 text-xs tabular-nums">{savedPct}%</ClearChip>
              {t("ofIncome")}
            </>
          )}
        />
        <KpiCard
          label={t("largest")}
          iconTile={!!data.largest?.categoryIcon}
          icon={data.largest?.categoryIcon ? <Icon iconKey={data.largest.categoryIcon} color={data.largest.categoryColor} size="md" soft /> : <IconBuildingStore />}
          value={<Amount value={data.largest?.amount ?? 0} className="tabular-nums" />}
          foot={data.largest && (
            <>
              {data.largest.categoryName && <ClearChip tone="stone" className="h-6 max-w-full truncate px-2 text-xs">{data.largest.categoryName}</ClearChip>}
              <span className="min-w-0 truncate">
                {data.largest.name ? t("largestWhere", { name: data.largest.name, date: dayMonth.format(date(data.largest.date)) }) : dayMonth.format(date(data.largest.date))}
              </span>
            </>
          )}
        />
      </div>

      {/* Week by week beside the summary from xl; at lg the summary goes under it. */}
      <FlowCard buckets={buckets} grain={data.grain} hint={data.hint} className="lg:col-span-2" />
      <SummaryCard
        facts={summaryFacts}
        aiReady={aiReady}
        cacheKey={summaryKey}
        initial={cachedSummary}
        subtitle={summarySubtitle}
        className="lg:col-span-2 xl:col-span-1"
      />

      <CategoryBreakdownCard
        spendingVisible={data.spendingVisible}
        spendingAll={data.spendingAll}
        spendingTotal={data.expense}
        incomeAll={data.incomeAll}
        incomeTotal={data.income}
        groups={{ spendingVisible: data.groupSpendingVisible, spendingAll: data.groupSpendingAll, incomeAll: data.groupIncomeAll }}
        uncategorised={data.uncategorised}
        ongoing={data.ongoing}
        financialMonth={financialMonth}
        budgetPeriod={data.budgetPeriod}
        className="lg:col-span-2"
      />
      <MerchantsCard merchants={data.topMerchants} spendingTotal={data.expense} allHref={`/transactions?from=${from}&to=${to}&direction=expense`} />

      <AccountsCard accounts={data.accountsSpend} />
      <CalendarCard days={data.calendar} rangeLabel={rangeLabel} avgPerDay={data.avgExpensePerDay} popularDay={popularDay} className="lg:col-span-2" />

      <AnchoredTip id="insightsMerchants" anchor="insightsMerchants" active={data.topMerchants.length > 0} />
      <AnchoredTip id="insightsCategorySwitch" anchor="insightsCategorySwitch" active={data.incomeAll.length > 0} />
      <AnchoredTip id="insightsGroupSwitch" anchor="insightsGroupSwitch" active={data.groupSpendingAll.length > 0} />
      <AnchoredTip id="insightsSummary" anchor="insightsSummary" />
    </div>
  );
}
