import { db } from "@/db";
import { transactions, categories, banks, savingsGoals, vermogenAccounts, recurringItems, goals } from "@/db/schema";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";
import { formatEur, BUDGET_TYPE_LABELS, normalizeBudgetType, pctChangeLabel } from "@/lib/format";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { ExpenseTrendCard } from "./expense-trend-card";
import { TopExpenseCategoriesCard } from "./top-expense-categories-card";
import { SplitEur } from "@/components/split-eur";
import { RecurringCostTrendCard } from "./recurring-cost-trend-card";
import { SavingsRateTrendCard } from "./savings-rate-trend-card";
import {
  financialMonthForDate,
  offsetFinancialMonth,
  currentFinancialMonth,
  financialMonthRangeByMonth,
  monthsInRange,
  precedingMonths,
  type FinancialMonthConfig,
} from "@/lib/date-range";
import { getDebtSummary } from "@/lib/debt-calculations";
import { getBankBalances } from "@/lib/account-balances";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { getNetWorthHistory, computeNetWorth } from "@/lib/net-worth-snapshots";
import { getNetWorthForecast } from "@/lib/net-worth-forecast";
import { NetWorthTrendChart } from "./net-worth-trend-chart";
import {
  IconArrowDownRight as ArrowDownRight,
  IconArrowUpRight as ArrowUpRight,
  IconTrendingDown as TrendingDown,
  IconTrendingUp as TrendingUp,
  IconWallet as Wallet,
  IconScaleFilled as Scale,
  IconPigFilled as PiggyBank,
  IconDiamondFilled as Gem,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";
import { MonthlyLineChart } from "@/components/dashboard-charts";
import { ComparisonPicker } from "@/app/trends/comparison-picker";
import { CategoryTrendList } from "@/app/trends/category-trend-list";
import { ChangeRow } from "@/components/change-pill";
import { StatTile, TileBadge } from "@/components/stat-tile";
import { PeriodSelector } from "./period-selector";
import { AnalyticsFilterBar } from "./analytics-filter-bar";
import Link from "next/link";

// ── Helpers ──────────────────────────────────────────────────────────────────

function rangeLabel(from: string, to: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return new Date(`${from}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  return `${fmt(from)} – ${fmt(to)}`;
}

// Classify an expense as a "need" (nodig) or "want" (willen) from its category's
// budget type. Anything not explicitly a need falls into wants.
function classifyBudget(budgetType: string | null | undefined): "nodig" | "willen" {
  return normalizeBudgetType(budgetType) === "nodig" ? "nodig" : "willen";
}

function buildTrendData(
  from: string,
  to: string,
  allocations: { date: string; direction: string; amount: number; isReimbursement: boolean; isInternalTransfer: boolean; categoryId: number | null; categoryGroup: string | null }[],
  financialMonth: { defaultStartDay: number },
  budgetTypeOf: (categoryId: number | null) => string | null | undefined,
) {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  const relevant = allocations.filter(
    (row) => row.direction === "expense" && !row.isReimbursement && !row.isInternalTransfer && row.categoryGroup !== "savings",
  );
  const isSingleFinancialMonth = financialMonthForDate(from, financialMonth) === financialMonthForDate(to, financialMonth);
  if (spanDays <= 31 || isSingleFinancialMonth) {
    const dayMap: Record<string, { nodig: number; willen: number }> = {};
    for (const row of relevant) {
      if (!dayMap[row.date]) dayMap[row.date] = { nodig: 0, willen: 0 };
      dayMap[row.date][classifyBudget(budgetTypeOf(row.categoryId))] += row.amount;
    }
    const points: { month: string; nodig: number; willen: number }[] = [];
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      points.push({ month: key, nodig: dayMap[key]?.nodig ?? 0, willen: dayMap[key]?.willen ?? 0 });
    }
    return points;
  }
  const monthMap: Record<string, { nodig: number; willen: number }> = {};
  for (const row of relevant) {
    const month = financialMonthForDate(row.date, financialMonth);
    if (!monthMap[month]) monthMap[month] = { nodig: 0, willen: 0 };
    monthMap[month][classifyBudget(budgetTypeOf(row.categoryId))] += row.amount;
  }
  const startMonth = financialMonthForDate(from, financialMonth);
  const endMonth = financialMonthForDate(to, financialMonth);
  const months: string[] = [];
  for (let m = startMonth; months.length < 36; m = offsetFinancialMonth(m, 1)) {
    months.push(m);
    if (m === endMonth) break;
  }
  return months.map((month) => ({ month, nodig: monthMap[month]?.nodig ?? 0, willen: monthMap[month]?.willen ?? 0 }));
}

async function getReportsData(from: string, to: string, financialMonth: { defaultStartDay: number }) {
  const [periodRows, netWorthData] = await Promise.all([
    db.select({
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
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
    })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
      .orderBy(desc(transactions.date)),
    computeNetWorth(),
  ]);
  // Spend is broken down by the actual (sub-)category, not rolled up to the parent.
  const allCats = await db.select().from(categories);
  const catById = new Map(allCats.map((c) => [c.id, c]));
  const splitRows = await getTransactionSplitRows(periodRows.map((row) => row.id));
  const splitMap = groupTransactionSplits(splitRows);
  const periodAllocations = buildSplitAllocations(periodRows, splitMap);
  const totals = periodAllocations
    .filter((row) => !row.isReimbursement && !row.isInternalTransfer && row.categoryGroup !== "savings")
    .reduce((acc, row) => { acc[row.direction] = (acc[row.direction] ?? 0) + row.amount; return acc; }, {} as Record<string, number>);
  const income = totals.income ?? 0;
  const expense = totals.expense ?? 0;
  const budgetTypeOf = (categoryId: number | null) => (categoryId != null ? catById.get(categoryId)?.budgetType : null);
  const monthlyData = buildTrendData(from, to, periodAllocations, financialMonth, budgetTypeOf);
  function topCategories(direction: "income" | "expense") {
    const map = new Map<string, { name: string; color: string | null; icon: string | null; budgetType: string | null; total: number }>();
    for (const row of periodAllocations) {
      if (row.direction !== direction || row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
      // Break down by the actual (sub-)category the spend is tagged with.
      const cat = row.categoryId != null ? catById.get(row.categoryId) : undefined;
      const key = row.categoryId != null ? `id:${row.categoryId}` : `name:${row.categoryName ?? "unknown"}`;
      const current = map.get(key) ?? { name: cat?.name ?? row.categoryName ?? "Unknown", color: cat?.color ?? row.categoryColor, icon: cat?.icon ?? row.categoryIcon, budgetType: cat?.budgetType ?? null, total: 0 };
      current.total += row.amount;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }
  const expenseCategories = topCategories("expense");
  const incomeCategories = topCategories("income");
  const { totalAssets, totalDebt, netWorth } = netWorthData;
  return { income, expense, monthlyData, expenseCategories, incomeCategories, totalAssets, totalDebt, netWorth };
}

const TREND_MONTHS = 12;

async function getMonthlySeries(financialMonth: { defaultStartDay: number }) {
  const endMonth = currentFinancialMonth(financialMonth);
  const startMonth = offsetFinancialMonth(endMonth, -(TREND_MONTHS - 1));
  const from = financialMonthRangeByMonth(startMonth, financialMonth).from;
  const to = financialMonthRangeByMonth(endMonth, financialMonth).to;
  const rows = await db.select({
    id: transactions.id,
    date: transactions.date,
    direction: transactions.direction,
    amount: transactions.amount,
    correctedAmount: transactions.correctedAmount,
    categoryId: transactions.categoryId,
    categoryGroup: categories.group,
    // "Fixed costs" is driven off the recurring item a transaction is matched to
    // (bill | subscription | debt), since categories no longer carry those groups.
    recurringType: recurringItems.type,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
  })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(recurringItems, eq(transactions.recurringItemId, recurringItems.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));
  const recurringTypeByTxn = new Map(rows.map((row) => [row.id, row.recurringType]));
  const splitRows = await getTransactionSplitRows(rows.map((row) => row.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(rows, splitMap);
  const months: string[] = [];
  for (let m = startMonth; months.length < TREND_MONTHS; m = offsetFinancialMonth(m, 1)) months.push(m);
  const buckets = new Map(months.map((m) => [m, { income: 0, expense: 0, bill: 0, subscription: 0, debt: 0 }]));
  for (const row of allocations) {
    if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
    const month = financialMonthForDate(row.date, financialMonth);
    const bucket = buckets.get(month);
    if (!bucket) continue;
    if (row.direction === "income" || row.direction === "expense") bucket[row.direction] += row.amount;
    const recurringType = recurringTypeByTxn.get(row.transactionId);
    if (recurringType === "bill" || recurringType === "subscription" || recurringType === "debt") {
      bucket[recurringType] += row.amount;
    }
  }
  return months.map((month) => {
    const b = buckets.get(month)!;
    return { month, bill: b.bill, subscription: b.subscription, debt: b.debt, savingsRatePct: b.income > 0 ? ((b.income - b.expense) / b.income) * 100 : null };
  });
}

// ── Trends helpers ────────────────────────────────────────────────────────────

const BUDGET_GROUPS = ["nodig", "willen"] as const;

function longMonth(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function getTrendsData(
  from: string,
  to: string,
  cmpA: string,
  cmpB: string,
  categoryIds?: number[],
  accounts?: string[],
) {
  const allCats = await db.select().from(categories).orderBy(categories.group, categories.name);
  const allBanksFull = await db.select().from(banks);
  // Sub-category totals roll up into their parent (see trends/page.tsx for the same logic).
  const catById = new Map(allCats.map((c) => [c.id, c]));
  const rollupId = (id: number) => catById.get(id)?.parentCategoryId ?? id;
  const months = monthsInRange(from, to); // the months this tab charts
  const prevMonths = precedingMonths(months); // comparison-only window right before it
  const months24 = [...prevMonths, ...months];
  const currentSet = new Set(months);
  const startDate = `${months24[0]}-01`;
  let monthlyRows = await db.select({
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
    account: transactions.account,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
  })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, startDate)))
    .orderBy(asc(transactions.date), asc(transactions.id));

  // Category/account filter — see analytics-tab.tsx's loadAllocations for the same convention.
  if (categoryIds && categoryIds.length > 0) monthlyRows = monthlyRows.filter((r) => r.categoryId != null && categoryIds.includes(r.categoryId));
  if (accounts && accounts.length > 0) monthlyRows = monthlyRows.filter((r) => r.account != null && accounts.includes(r.account));

  const splitRows = await getTransactionSplitRows(monthlyRows.map((row) => row.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(monthlyRows, splitMap);

  const monthlyMap: Record<string, { income: number; expense: number }> = {};
  for (const m of months24) monthlyMap[m] = { income: 0, expense: 0 };
  for (const row of allocations) {
    if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
    const month = row.date.slice(0, 7);
    if (!monthlyMap[month]) continue;
    if (row.direction === "income") monthlyMap[month].income += row.amount;
    else monthlyMap[month].expense += row.amount;
  }
  const incomeArr = months.map((m) => monthlyMap[m].income);
  const expenseArr = months.map((m) => monthlyMap[m].expense);
  const avgIncome = incomeArr.reduce((s, v) => s + v, 0) / months.length;
  const avgExpense = expenseArr.reduce((s, v) => s + v, 0) / months.length;
  const avgBalance = avgIncome - avgExpense;
  const chartData = months.map((m, i) => ({ month: m, income: incomeArr[i], expense: expenseArr[i] }));
  const totalIncome = incomeArr.reduce((s, v) => s + v, 0);
  const totalExpense = expenseArr.reduce((s, v) => s + v, 0);
  const prevTotalIncome = prevMonths.reduce((s, m) => s + monthlyMap[m].income, 0);
  const prevTotalExpense = prevMonths.reduce((s, m) => s + monthlyMap[m].expense, 0);

  // Whether transaction history reaches back far enough to cover the whole comparison
  // window — otherwise a "vs prior period" total is an undercount, not a real zero.
  const [earliestRow] = await db.select({ minDate: sql<string | null>`MIN(${transactions.date})` }).from(transactions);
  const prevPeriodDataComplete = !!earliestRow?.minDate && earliestRow.minDate <= `${prevMonths[0]}-01`;

  const catMonthly = new Map<number, Record<string, number>>();
  const catTotal = new Map<number, number>();
  // Un-rolled-up detail (children counted on their own), plus per-category transaction
  // count / distinct active months — used only by the "Expenses per category" list,
  // which shows subcategories individually instead of merged into their parent.
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

  // Flat, un-rolled-up rows (parents and children alike) for "Expenses per category" —
  // noise-filtered to categories seen across more than one period with more than one
  // transaction.
  const categoryDetailRows = allCats
    .filter((c) => {
      const d = catDetail.get(c.id);
      return !!d && d.total > 0 && d.txCount > 1 && d.monthsActive.size > 1;
    })
    .map((c) => {
      const d = catDetail.get(c.id)!;
      const group = normalizeBudgetType(c.budgetType) === "nodig" ? "nodig" : "willen";
      return { id: c.id, name: c.name, color: c.color ?? null, icon: c.icon ?? null, group, monthly: d.monthly, total: d.total };
    })
    .sort((a, b) => b.total - a.total);

  const groupedDetailed = BUDGET_GROUPS.map((group) => ({
    group,
    label: BUDGET_TYPE_LABELS[group] ?? group,
    categories: categoryDetailRows.filter((c) => c.group === group),
  })).filter((g) => g.categories.length > 0);

  const nowYm = months[months.length - 1];
  const resolvedCmpA = months24.includes(cmpA) ? cmpA : nowYm;
  const resolvedCmpB = months24.includes(cmpB) ? cmpB : prevMonth(nowYm);

  function getMonthStats(ym: string) {
    let income = 0, expense = 0;
    const catMap = new Map<number, { id: number; name: string; color: string | null; total: number }>();
    for (const row of allocations) {
      if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
      if (row.date.slice(0, 7) !== ym) continue;
      if (row.direction === "income") income += row.amount;
      else {
        expense += row.amount;
        if (row.categoryId != null) {
          const rid = rollupId(row.categoryId);
          const pc = catById.get(rid);
          const entry = catMap.get(rid) ?? { id: rid, name: pc?.name ?? row.categoryName ?? "Unknown", color: pc?.color ?? row.categoryColor ?? null, total: 0 };
          entry.total += row.amount;
          catMap.set(rid, entry);
        }
      }
    }
    const topCats = [...catMap.values()].sort((a, b) => b.total - a.total).slice(0, 6);
    return { income, expense, balance: income - expense, topCats };
  }

  const prevAvgBalance = (prevTotalIncome - prevTotalExpense) / prevMonths.length;

  return {
    months, chartData, grouped, groupedDetailed,
    avgIncome, avgExpense, avgBalance,
    totalIncome, totalExpense,
    incomeChange: prevPeriodDataComplete ? pctChangeLabel(totalIncome, prevTotalIncome) : null,
    expenseChange: prevPeriodDataComplete ? pctChangeLabel(totalExpense, prevTotalExpense) : null,
    balanceChange: prevPeriodDataComplete ? pctChangeLabel(avgBalance, prevAvgBalance) : null,
    cmpA: resolvedCmpA, cmpB: resolvedCmpB,
    statsA: getMonthStats(resolvedCmpA),
    statsB: getMonthStats(resolvedCmpB),
    allCats, allBanksFull,
  };
}

// ── Net worth helpers ─────────────────────────────────────────────────────

const VERMOGEN_TYPES = [
  { value: "spaarrekening",  label: "Savings account",  color: "#14b8a6", icon: PiggyBank },
  { value: "beleggingen",    label: "Investments",    color: "#a855f7", icon: TrendingUp },
  { value: "betaalrekening", label: "Checking account", color: "#3b82f6", icon: Wallet },
  { value: "bezitting",      label: "Possession",      color: "#f59e0b", icon: Gem },
];

async function getNetWorthData() {
  const [savingsGoalRows, savingsTypeGoalRows, debtSummary, accounts, bankBalances] = await Promise.all([
    db.select().from(savingsGoals).where(eq(savingsGoals.active, true)),
    db.select().from(goals).where(and(eq(goals.active, true), eq(goals.goalType, "savings"))),
    getDebtSummary(),
    db.select().from(vermogenAccounts).where(eq(vermogenAccounts.active, true)),
    getBankBalances(),
  ]);

  // Combine the two savings-goal sources (old dedicated table + unified goals
  // table's savings type) into one list — both feed net worth the same way.
  const goalList: { id: number; name: string; currentAmount: number; targetAmount: number; color: string | null; monthlyContribution: number | null }[] = [
    ...savingsGoalRows,
    ...savingsTypeGoalRows,
  ];

  // Only banks explicitly opted into net worth — matches computeNetWorth() in
  // net-worth-snapshots.ts and the dedicated /net-worth page.
  const netWorthBanks = bankBalances.filter((b) => b.includeInNetWorth);

  const totalSavings = goalList.reduce((s, g) => s + g.currentAmount, 0);
  const totalAccounts = accounts.reduce((s, a) => s + a.value, 0) + netWorthBanks.reduce((s, b) => s + b.balance, 0);
  // Money owed to the user (direction 'owed') is a receivable asset, added to net worth.
  const totalAssets = totalSavings + totalAccounts + (debtSummary?.totalOwed ?? 0);
  const totalDebt = debtSummary?.totalBalance ?? 0;
  const netWorth = totalAssets - totalDebt;

  return { goals: goalList, debtSummary, totalSavings, totalAccounts, totalAssets, totalDebt, netWorth, accounts, netWorthBanks };
}

// ── Reports tab ────────────────────────────────────────────────────────────

export async function RapportenTab({ from, to, financialMonth }: { from: string; to: string; financialMonth: { defaultStartDay: number } }) {
  const data = await getReportsData(from, to, financialMonth);
  const series = await getMonthlySeries(financialMonth);
  const periodLabel = rangeLabel(from, to);

  // Snapshot recording moved to the root layout (runs once/day for any logged-in
  // page view, not just when Reports happens to be opened) — see maybeRecordDailyNetWorthSnapshot().
  const history = await getNetWorthHistory(30);
  const hasTrend = history.length >= 2;
  const firstNetWorth = history[0]?.netWorth ?? data.netWorth;
  const changePct = hasTrend && firstNetWorth !== 0 ? ((data.netWorth - firstNetWorth) / Math.abs(firstNetWorth)) * 100 : 0;
  const isUp = changePct >= 0;
  const forecast = hasTrend ? await getNetWorthForecast(data.netWorth, history[history.length - 1].date) : [];

  return (
    <div className="px-4 pt-3 pb-4 space-y-4">
      {/* Net worth hero */}
      <div className="rounded-2xl p-5 bg-white dark:bg-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-foreground dark:text-white/65">Total net worth</p>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <p className={`text-4xl tabular-nums tracking-tight ${data.netWorth < 0 ? "text-foreground dark:text-rose-400" : "text-foreground/90 dark:text-white"}`}>
            <SplitEur formatted={`${data.netWorth < 0 ? "-" : ""}${formatEur(data.netWorth)}`} />
          </p>
          {hasTrend && (
            <span className={`flex items-center gap-0.5 text-base font-semibold rounded-full py-1 ${isUp ? "text-green-500 dark:bg-green-900/30 dark:text-emerald-400" : "text-red-100 dark:bg-red-900/30 dark:text-red-400"}`}>
              {isUp ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
              {Math.abs(changePct).toFixed(1)}%
            </span>
          )}
        </div>
        {hasTrend ? (
          <div className="mt-2 -mx-1">
            <NetWorthTrendChart data={history.map((h) => ({ date: h.date, netWorth: h.netWorth }))} forecast={forecast} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-3">The trend chart is being built — come back tomorrow for your first comparison.</p>
        )}
      </div>

      <ExpenseTrendCard data={data.monthlyData} periodLabel={periodLabel} />

      <TopExpenseCategoriesCard categories={data.expenseCategories} periodLabel={periodLabel} />
      <RecurringCostTrendCard data={series} />
      <SavingsRateTrendCard data={series.map((s) => ({ month: s.month, savingsRatePct: s.savingsRatePct }))} />
    </div>
  );
}

// ── Trends tab ────────────────────────────────────────────────────────────────

export async function TrendsTab({
  from,
  to,
  cmpA,
  cmpB,
  categoryIds,
  accounts,
  financialMonth,
  embedded = false,
}: {
  from: string;
  to: string;
  cmpA: string;
  cmpB: string;
  categoryIds?: number[];
  accounts?: string[];
  financialMonth: FinancialMonthConfig;
  /** See AnalyticsTab's `embedded` — same dashboard-Reports-portal-vs-standalone-page
   * distinction, for the same reason (AnalyticsFilterBar's sticky offset). */
  embedded?: boolean;
}) {
  const data = await getTrendsData(from, to, cmpA, cmpB, categoryIds, accounts);
  const chartedPeriod = { from, to };

  return (
    <div className="px-4 pb-[calc(8rem+var(--sab))] lg:pb-5 pt-4 space-y-4">
      <AnalyticsFilterBar
        categories={data.allCats}
        banks={data.allBanksFull}
        stickyTop={embedded ? "0px" : "calc(var(--sat) + 9rem)"}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground/60">
            {data.months.length} month{data.months.length === 1 ? "" : "s"}
          </h2>
        </div>
      </div>

      {/* KPI cards — same theme-static "photo card" tiles as the Largest expense
          stat tile on the Analytics tab. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Avg. income"
          value={formatEur(data.avgIncome)}
          valueClassName="text-xl font-bold tabular-nums"
          badge={<TileBadge icon={TrendingUp} color="var(--color-income)" />}
        />
        <StatTile
          label="Avg. expenses"
          value={formatEur(data.avgExpense)}
          valueClassName="text-xl font-bold tabular-nums"
          badge={<TileBadge icon={TrendingDown} color="var(--color-expense)" />}
        />
        <StatTile
          label="Avg. saldo"
          value={formatEur(data.avgBalance)}
          valueClassName="text-xl font-bold tabular-nums"
          badge={<TileBadge icon={Scale} color={data.avgBalance >= 0 ? "var(--color-income)" : "var(--color-expense)"} />}
        />
        {/* Transaction-card style (no badge, footer shows the vs-last-period pill) —
            same treatment as Analytics' "Transactions" tile. */}
        <StatTile
          label="Total expenses"
          value={formatEur(data.totalExpense)}
          valueClassName="text-xl font-bold tabular-nums"
          footer={data.expenseChange
            ? <ChangeRow change={{ ...data.expenseChange, up: !data.expenseChange.up }} />
            : "vs last period — no data"}
        />
      </div>

      {/* Income vs Expenses — Cashflow's nested two-tone shell, kept as a line chart. */}
      <div className="bg-white/5 p-1 rounded-2xl">
        <div className="rounded-b-sm rounded-t-2xl bg-white/2 py-2 px-4 pb-3">
          <p className="text-md text-foreground/60 mb-1">Income vs Expenses</p>
          <p
            className="text-2xl font-semibold tabular-nums tracking-tight"
            style={{ color: data.avgBalance >= 0 ? "var(--color-income)" : "bg-foreground" }}
          >
            {formatEur(data.totalIncome - data.totalExpense)}
          </p>
          <ChangeRow change={data.balanceChange} caption={`${data.months.length} month${data.months.length === 1 ? "" : "s"}`} className="mt-1 mb-5" />
          <MonthlyLineChart data={data.chartData} />
        </div>

        <div className="rounded-2xl px-4 mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-md">
            <span className="size-2 rounded-full bg-foreground/60" /> Expenses
          </span>
          <span className="text-md tabular-nums">{formatEur(data.totalExpense)}</span>
        </div>
        <div className="rounded-2xl px-4 py-1 mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-md">
            <span className="size-2 rounded-full" style={{ backgroundColor: "var(--color-income)" }} /> Income
          </span>
          <span className="text-md tabular-nums" style={{ color: "var(--color-income)" }}>+{formatEur(data.totalIncome)}</span>
        </div>
      </div>

      <CategoryTrendList groups={data.groupedDetailed} months={data.months} financialMonth={financialMonth} periodRange={chartedPeriod} />

      {/* Maandvergelijking */}
      <div className="rounded-2xl bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-foreground/5 flex flex-col items-center gap-2 text-center">
          <h2 className="font-semibold text-sm">Month comparison</h2>
          <ComparisonPicker cmpA={data.cmpA} cmpB={data.cmpB} />
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Income", a: data.statsA.income, b: data.statsB.income },
              { label: "Expenses", a: data.statsA.expense, b: data.statsB.expense },
              { label: "Balance", a: data.statsA.balance, b: data.statsB.balance },
            ].map(({ label, a, b }) => {
              const diff = a - b;
              const diffPct = b !== 0 ? Math.round((diff / Math.abs(b)) * 100) : null;
              return (
                <div key={label} className="rounded-xl bg-foreground/3 p-3">
                  <p className="text-xs text-foreground/60 mb-1">{label}</p>
                  <div className="flex items-end justify-between gap-1 flex-wrap">
                    <div>
                      <p className="text-base font-bold tabular-nums">{formatEur(a)}</p>
                      <p className="text-[10px] text-foreground/50 tabular-nums">{longMonth(data.cmpA)}: {formatEur(b)}</p>
                    </div>
                    {diffPct !== null && (
                      <span
                        className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full"
                        style={diff > 0
                          ? { background: "color-mix(in srgb, var(--color-income) 15%, transparent)", color: "var(--color-income)" }
                          : diff < 0
                          ? { background: "color-mix(in srgb, var(--color-expense) 15%, transparent)", color: "var(--color-expense)" }
                          : undefined}
                      >
                        {diff > 0 ? "+" : ""}{diffPct}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[{ label: longMonth(data.cmpB), stats: data.statsA }, { label: longMonth(data.cmpA), stats: data.statsB }].map(({ label, stats }) => (
              <div key={label}>
                <p className="text-xs font-medium text-foreground/60 mb-2">{label}</p>
                {stats.topCats.length > 0 ? (
                  <div className="space-y-1.5">
                    {stats.topCats.map((cat) => {
                      const maxTotal = Math.max(...stats.topCats.map((c) => c.total), 1);
                      return (
                        <div key={cat.id}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="truncate max-w-[120px]">{cat.name}</span>
                            <span className="tabular-nums text-foreground/50">{formatEur(cat.total)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-foreground/8 overflow-hidden">
                            <div className="h-full rounded-full transition-all bg-foreground/60" style={{ width: `${(cat.total / maxTotal) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-foreground/50">No data</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <PeriodSelector from={from} to={to} financialMonth={financialMonth} budgetPeriod={null} tab="trends" embedded={embedded} />
    </div>
  );
}

// ── Net worth tab ──────────────────────────────────────────────────────────────

export async function VermogenTab() {
  const [{ goals, debtSummary, totalSavings, totalAssets, totalDebt, netWorth, accounts, netWorthBanks }, history] = await Promise.all([
    getNetWorthData(),
    getNetWorthHistory(90),
  ]);

  const hasHistory = history.length >= 2;
  const firstNetWorth = history[0]?.netWorth ?? netWorth;
  const historyChange = hasHistory ? pctChangeLabel(netWorth, firstNetWorth) : null;
  const forecast = hasHistory ? await getNetWorthForecast(netWorth, history[history.length - 1].date) : [];

  const groupedAccounts = VERMOGEN_TYPES.map((t) => ({
    ...t,
    items: accounts.filter((a) => a.type === t.value),
  })).filter((g) => g.items.length > 0);

  // Assets composition — savings goals plus each vermogen-account group, for the
  // donut below the history chart ("other useful graphs").
  const totalNetWorthBanks = netWorthBanks.reduce((s, b) => s + b.balance, 0);
  const assetSlices = [
    ...(totalSavings > 0 ? [{ name: "Savings goals", value: totalSavings, color: "var(--color-success)" }] : []),
    ...groupedAccounts.map((g) => ({ name: g.label, value: g.items.reduce((s, a) => s + a.value, 0), color: g.color })),
    ...(totalNetWorthBanks > 0 ? [{ name: "Bank accounts", value: totalNetWorthBanks, color: "#3b82f6" }] : []),
  ].filter((s) => s.value > 0);

  return (
    <div className="px-5 pb-5 pt-3 space-y-5">
      {/* Net worth history — Cashflow's nested two-tone shell, kept as a line chart. */}
      <div className="bg-white/5 p-1 rounded-2xl">
        <div className="rounded-b-sm rounded-t-2xl bg-white/2 py-2 px-4 pb-3">
          <p className="text-md text-foreground/60 mb-1">Net worth</p>
          <p
            className="text-2xl font-semibold tabular-nums tracking-tight"
            style={{ color: netWorth >= 0 ? "var(--color-income)" : "var(--color-expense)" }}
          >
            {formatEur(netWorth)}
          </p>
          <ChangeRow change={historyChange} caption={`vs ${history.length} days ago`} className="mt-1 mb-5" />
          {hasHistory ? (
            <NetWorthTrendChart data={history.map((h) => ({ date: h.date, netWorth: h.netWorth }))} forecast={forecast} />
          ) : (
            <p className="text-xs text-foreground/50 py-10 text-center">The trend chart is being built — come back tomorrow for your first comparison.</p>
          )}
        </div>

        <div className="rounded-2xl px-4 mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-md">
            <span className="size-2 rounded-full bg-foreground/60" /> Debts
          </span>
          <span className="text-md tabular-nums">{formatEur(totalDebt)}</span>
        </div>
        <div className="rounded-2xl px-4 py-1 mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-md">
            <span className="size-2 rounded-full" style={{ backgroundColor: "var(--color-income)" }} /> Assets
          </span>
          <span className="text-md tabular-nums" style={{ color: "var(--color-income)" }}>+{formatEur(totalAssets)}</span>
        </div>
      </div>

      {/* Assets composition donut */}
      {assetSlices.length > 0 && (
        <div className="rounded-2xl bg-card p-5">
          <h2 className="font-semibold text-sm mb-4">Assets composition</h2>
          <AssetsDonut slices={assetSlices} total={totalAssets} />
        </div>
      )}

      {/* Assets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">Assets</h2>
            <Link href="/settings?tab=banks" className="flex items-center gap-1 font-semibold text-xs text-muted-foreground hover:opacity-75 transition-opacity">
              Manage
            </Link>
          </div>
          {goals.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Savings goals</p>
              {goals.map((goal) => {
                const pct = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
                return (
                  <div key={goal.id}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium truncate flex-1 mr-2">{goal.name}</span>
                      <span className="tabular-nums font-semibold shrink-0">{formatEur(goal.currentAmount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/7 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "#c8cbd0" }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                      <span>{pct.toFixed(0)}% of goal</span>
                      <span>{formatEur(goal.targetAmount)}</span>
                    </div>
                  </div>
                );
              })}

            </div>
          )}

          {goals.length === 0 && groupedAccounts.length === 0 && netWorthBanks.length === 0 && (
            <p className="text-sm text-muted-foreground">No assets found.</p>
          )}
          <div className="border-t pt-3 mt-4 flex items-center justify-between text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums text-lg">{formatEur(totalAssets)}</span>
          </div>
        </div>

        {/* Liabilities */}
        <div className="rounded-2xl bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">Debts</h2>
            <Link href="/debts" className="flex items-center gap-1 font-semibold text-xs text-muted-foreground hover:opacity-75 transition-opacity">
              Manage
            </Link>
          </div>
          {debtSummary ? (
            <div className="space-y-3">
              {debtSummary.debts.map(({ debt, currentBalance, amountPaid }) => {
                const pct = debt.startingBalance > 0 ? Math.min(100, (amountPaid / debt.startingBalance) * 100) : 100;
                return (
                  <div key={debt.id}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium truncate flex-1 mr-2">{debt.name}</span>
                      <span className="tabular-nums font-semibold shrink-0">{formatEur(currentBalance)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/7 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "#c8cbd0" }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                      <span>{pct.toFixed(0)}% paid</span>
                      <span>{formatEur(debt.startingBalance)}</span>
                    </div>
                  </div>
                );
              })}
              <div className="border-t pt-3 mt-3 flex items-center justify-between text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums text-lg">{formatEur(totalDebt)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No debts.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Assets-by-type donut, same construction as the Trends tab's category pie
// (stroked-circle segments) — used here to break the "Total assets" figure down
// by savings goals vs. each vermogen-account group.
function AssetsDonut({ slices, total }: { slices: { name: string; value: number; color: string }[]; total: number }) {
  const r = 70, cx = 90, cy = 90, stroke = 10;
  const circ = 2 * Math.PI * r;
  const withOffset = slices.reduce<{ name: string; value: number; color: string; pct: number; offset: number }[]>((acc, s) => {
    const pct = total > 0 ? (s.value / total) * 100 : 0;
    const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].pct : 0;
    return [...acc, { ...s, pct, offset }];
  }, []);

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg viewBox="0 0 180 180" className="size-40 shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth={stroke} />
        {withOffset.map((s) => {
          const dash = (s.pct / 100) * circ;
          return (
            <circle
              key={s.name}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ}`}
              strokeDashoffset={-s.offset * circ / 100}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="15" fontWeight="bold" fill="currentColor">
          {formatEur(total).replace(",00", "")}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.5">total assets</text>
      </svg>
      <div className="flex-1 min-w-0 space-y-2">
        {withOffset.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="flex-1 truncate text-muted-foreground">{s.name}</span>
            <span className="font-medium tabular-nums">{formatEur(s.value)}</span>
            <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
