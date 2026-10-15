import { db } from "@/db";
import { transactions, categories, goals, recurringItems, banks, merchants, vermogenAccounts, budgetTargets } from "@/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { formatEur } from "@/lib/format";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";
import { reimbursedAmountExpr } from "@/lib/reimbursed-amount";
import { getDateRange, financialMonthForDate, financialMonthRange, currentFinancialMonth, shiftDate } from "@/lib/date-range";
import { getFinancialMonthConfig, getBudgetRecurringMode, getSharedCostMode } from "@/lib/app-settings";
import { getBillStatuses, UPCOMING_TYPES } from "@/lib/bill-status";
import { getBudgetOverview } from "@/lib/budget-overview";
import { getBankBalances, getAccountBalanceHistory } from "@/lib/account-balances";
import { getFinancialHealthScore } from "@/lib/financial-health-data";
import { getCashFlowForecast } from "@/lib/cash-flow-forecast";
import { DashboardReadySignal } from "@/components/dashboard-ready-signal";
import { DashboardEmptyState } from "@/app/dashboard-empty-state";
import { AccountsCard } from "@/components/accounts-card";
import { getSettingsPanelContent } from "@/app/settings-panel-content";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardRecentTransactions } from "@/app/dashboard-recent-transactions";
import { getNeedsReviewTransactions } from "@/lib/needs-review";
import { billsDueTotal } from "@/lib/bill-amounts";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { Wordmark } from "@/components/shell/app-shell";
import { SearchButton } from "@/components/shell/search-context";
import { PageHeading, SectionHead } from "@/components/ui/page-heading";
import { PageShell, SPLIT_GRID } from "@/components/page-container";
import { HeroCard, type HeroFigures, type HeroPace } from "@/app/_home/hero-card";
import { HomeTips } from "@/app/_home/home-tips";
import { daysInclusive, getWeekNudge, nextDay, todayStr } from "@/app/_home/home-data";
import {
  CashFlowCard,
  CategoryTiles,
  ComingUp,
  NeedsReviewLink,
  NudgeCard,
  QuickActions,
  SpendingList,
  type ComingUpBill,
} from "@/app/_home/home-sections";

import {
  buildSplitAllocations,
  getDisplayedTransactionCategory,
  groupTransactionSplits,
} from "@/lib/transaction-splits";

async function getDashboardData(from: string, to: string, selectedBank = "", financialMonth = { defaultStartDay: 1 }) {
  const year = from.slice(0, 4);

  // Monthly chart always shows the last 12 financial months (not affected by date filter)
  const monthlyChartEnd = financialMonthRange(financialMonth, 0).to;
  const monthlyChartStart = financialMonthRange(financialMonth, -11).from;


  // Optional bank account filter
  const bankFilter = selectedBank ? eq(transactions.account, selectedBank) : undefined;

  const chartNow = new Date();
  const chartToStr = chartNow.toISOString().slice(0, 10);
  const chartFromStr = new Date(chartNow.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [periodRows, monthlyRows, goalsRaw, recurringRaw, recurringItemsRaw, last7DaysRaw, recentRows, allCategories, budgetTargetRows, recurringMode, sharedCostMode] =
    await Promise.all([
      db.select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        reimbursedAmount: reimbursedAmountExpr,
        description: transactions.description,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        categoryGroup: categories.group,
        brandIcon: transactions.brandIcon,
        brandIconColor: transactions.brandIconColor,
        brandIconBgColor: transactions.brandIconBgColor,
        isReimbursement: transactions.isReimbursement,
        isInternalTransfer: isInternalTransferExpr,
        recurringItemId: transactions.recurringItemId,
      })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(gte(transactions.date, from), lte(transactions.date, to), bankFilter))
        .orderBy(desc(transactions.date), desc(transactions.id)),
      db.select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        description: transactions.description,
        correctedAmount: transactions.correctedAmount,
        reimbursedAmount: reimbursedAmountExpr,
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
        .where(and(gte(transactions.date, monthlyChartStart), lte(transactions.date, monthlyChartEnd), bankFilter))
        .orderBy(desc(transactions.date)),

      db.select().from(goals).where(and(eq(goals.goalType, "savings"), eq(goals.active, true))),

      db.select({
        type: recurringItems.type,
        total: sql<number>`sum(${recurringItems.amount})`,
      })
        .from(recurringItems)
        .where(eq(recurringItems.active, true))
        .groupBy(recurringItems.type),

      db.select({
        id: recurringItems.id,
        name: recurringItems.name,
        amount: recurringItems.amount,
        type: recurringItems.type,
        dueDay: recurringItems.dueDay,
        icon: recurringItems.icon,
        iconColor: recurringItems.iconColor,
        matchPattern: recurringItems.matchPattern,
        matchAmount: recurringItems.matchAmount,
      })
        .from(recurringItems)
        .where(eq(recurringItems.active, true))
        .orderBy(desc(recurringItems.dueDay)),

      db.select({
        date: transactions.date,
        total: sql<number>`sum(${transactions.amount})`,
      })
        .from(transactions)
        .where(and(
          gte(transactions.date, chartFromStr),
          lte(transactions.date, chartToStr),
          eq(transactions.direction, "expense"),
          bankFilter,
        ))
        .groupBy(transactions.date),

      db.select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        description: transactions.description,
        rawDescription: transactions.rawDescription,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        categoryGroup: categories.group,
        brandIcon: transactions.brandIcon,
        brandIconColor: transactions.brandIconColor,
        brandIconBgColor: transactions.brandIconBgColor,
        bankName: banks.displayName,
        notes: transactions.notes,
        customName: transactions.customName,
        receiptUrl: transactions.receiptUrl,
        isReimbursement: transactions.isReimbursement,
        isInternalTransfer: isInternalTransferExpr,
        transferType: effectiveTransferTypeExpr,
        goalId: transactions.goalId,
        recurringItemId: transactions.recurringItemId,
        recurringName: recurringItems.name,
        recurringFriendlyName: recurringItems.friendlyName,
        merchantIcon: merchants.icon,
        merchantColor: merchants.color,
      })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .leftJoin(banks, eq(transactions.account, banks.accountNumber))
        .leftJoin(recurringItems, eq(transactions.recurringItemId, recurringItems.id))
        .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
        .where(bankFilter)
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(40),

      db.select().from(categories).orderBy(categories.name),

      db.select({ categoryId: budgetTargets.categoryId })
        .from(budgetTargets)
        .where(and(eq(budgetTargets.year, 0), eq(budgetTargets.month, 0))),

      getBudgetRecurringMode(),

      getSharedCostMode(),
    ]);

  // Only expense allocations are netted, so the income half of `totals` stays gross.
  const netReimbursements = sharedCostMode === "net";

  const splitRows = await getTransactionSplitRows(
    Array.from(new Set([...periodRows.map((row) => row.id), ...monthlyRows.map((row) => row.id), ...recentRows.map((row) => row.id)])),
  );
  const splitMap = groupTransactionSplits(splitRows);
  const periodAllocations = buildSplitAllocations(periodRows, splitMap, { netReimbursements });
  const monthlyAllocations = buildSplitAllocations(monthlyRows, splitMap, { netReimbursements });

  const totals = periodAllocations
    .filter((row) => !row.isReimbursement && !row.isInternalTransfer && row.categoryGroup !== "savings")
    .reduce((acc, row) => {
      acc[row.direction] = (acc[row.direction] ?? 0) + row.amount;
      return acc;
    }, {} as Record<string, number>);

  const income = totals.income ?? 0;
  const expense = totals.expense ?? 0;
  const balance = income - expense;

  // Wallet-hero line graph — cumulative net balance day by day across the current
  // period, ending exactly at `balance` (same in/out filtering as `totals` above).
  const walletDayNet: Record<string, number> = {};
  for (const row of periodAllocations) {
    if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
    walletDayNet[row.date] = (walletDayNet[row.date] ?? 0) + (row.direction === "income" ? row.amount : -row.amount);
  }
  const walletHistory: { date: string; balance: number }[] = [];
  {
    let running = 0;
    for (let cursor = from; cursor <= to; cursor = shiftDate(cursor, 1)) {
      running += walletDayNet[cursor] ?? 0;
      walletHistory.push({ date: cursor, balance: running });
    }
  }

  const monthMap: Record<string, { income: number; expense: number }> = {};
  for (const row of monthlyAllocations) {
    if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
    const month = financialMonthForDate(row.date, financialMonth);
    if (!monthMap[month]) monthMap[month] = { income: 0, expense: 0 };
    monthMap[month][row.direction as "income" | "expense"] += row.amount;
  }

  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = financialMonthRange(financialMonth, -11 + i).from.slice(0, 7);
    return {
      month,
      income: monthMap[month]?.income ?? 0,
      expense: monthMap[month]?.expense ?? 0,
    };
  });

  const firstNonZero = monthlyData.findIndex((item) => item.income !== 0 || item.expense !== 0);
  const lastNonZero = monthlyData.length - 1 - [...monthlyData].reverse().findIndex((item) => item.income !== 0 || item.expense !== 0);

  if (firstNonZero !== -1 && lastNonZero >= firstNonZero) {
    monthlyData.splice(lastNonZero + 1);
    monthlyData.splice(0, firstNonZero);
  }

  const recent = recentRows.map((row) => ({
    ...row,
    ...getDisplayedTransactionCategory(row, splitMap.get(row.id) ?? []),
  }));

  const incomeTransactions = periodRows
    .filter((row) => row.direction === "income" && !row.isReimbursement && !row.isInternalTransfer && row.categoryGroup !== "savings")
    .slice(0, 4);

  const topExpenseMap = new Map<string, { categoryId: number | null; categoryName: string | null; color: string | null; icon: string | null; total: number }>();
  for (const row of periodAllocations) {
    if (row.direction !== "expense" || row.isInternalTransfer || row.categoryGroup !== "variable") continue;
    const key = row.categoryId != null ? `id:${row.categoryId}` : `name:${row.categoryName ?? "uncategorized"}`;
    const current = topExpenseMap.get(key) ?? {
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      color: row.categoryColor,
      icon: row.categoryIcon,
      total: 0,
    };
    current.total += row.amount;
    topExpenseMap.set(key, current);
  }

  const topCategoryMap = new Map<string, { categoryName: string | null; color: string | null; total: number }>();
  for (const row of periodAllocations) {
    if (row.direction !== "expense" || row.isInternalTransfer) continue;
    const key = row.categoryId != null ? `id:${row.categoryId}` : `name:${row.categoryName ?? "uncategorized"}`;
    const current = topCategoryMap.get(key) ?? {
      categoryName: row.categoryName,
      color: row.categoryColor,
      total: 0,
    };
    current.total += row.amount;
    topCategoryMap.set(key, current);
  }

  const topExpenses = [...topExpenseMap.values()].sort((left, right) => right.total - left.total).slice(0, 5);
  const topCategories = [...topCategoryMap.values()].sort((left, right) => right.total - left.total).slice(0, 5);

  // Every category with at least one expense transaction this period — feeds the
  // dashboard's "Spending by category" row, which (unlike categoryBudgetRows further
  // down in the page component) isn't limited to categories that have a budget set.
  // Categories the user has hidden (e.g. rent, which would otherwise always dominate
  // the row) are tracked with `excluded` so the row/count can skip them while the
  // "View all" list still shows — and can re-include — every one of them.
  const excludedCategoryIds = new Set(allCategories.filter((c) => c.excludeFromSpendingRow).map((c) => c.id));
  // Whether a transaction matched to a recurring bill counts toward its category's spend
  // follows the budget_recurring_mode setting — kept in lock-step with the budget page
  // (getBudgetOverview / resolveSpend) so the dashboard's "X of Y used" never disagrees.
  const recurringTxIds = new Set(periodRows.filter((r) => r.recurringItemId != null).map((r) => r.id));
  const budgetedCatIds = new Set(budgetTargetRows.map((r) => r.categoryId));
  const categorySpendingMap = new Map<number, { categoryId: number; categoryName: string; color: string | null; icon: string | null; spent: number; excluded: boolean }>();
  for (const row of periodAllocations) {
    if (row.direction !== "expense" || row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings" || row.categoryId == null) continue;
    if (recurringTxIds.has(row.transactionId)) {
      const includeRecurring =
        recurringMode === "always" ||
        (recurringMode === "budgeted" && budgetedCatIds.has(row.categoryId));
      if (!includeRecurring) continue;
    }
    const current = categorySpendingMap.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? "Uncategorized",
      color: row.categoryColor,
      icon: row.categoryIcon,
      spent: 0,
      excluded: excludedCategoryIds.has(row.categoryId),
    };
    current.spent += row.amount;
    categorySpendingMap.set(row.categoryId, current);
  }
  const categorySpendingAll = [...categorySpendingMap.values()].sort((a, b) => b.spent - a.spent);
  const categorySpending = categorySpendingAll.filter((c) => !c.excluded);
  const periodTx = periodRows
    .filter((row) => row.direction === "expense" && !row.isInternalTransfer)
    .map((row) => ({ description: row.description, amount: row.amount }));

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(chartNow.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    const date = d.toISOString().slice(0, 10);
    return { date, amount: last7DaysRaw.find((r) => r.date === date)?.total ?? 0 };
  });

  const prev7DaysTotal = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(chartNow.getTime() - (13 - i) * 24 * 60 * 60 * 1000);
    const date = d.toISOString().slice(0, 10);
    return last7DaysRaw.find((r) => r.date === date)?.total ?? 0;
  }).reduce((s, v) => s + v, 0);

  return {
    income, expense, balance, year,
    walletHistory,
    monthlyData,
    recent,
    categories: allCategories,
    incomeTransactions,
    goals: goalsRaw,
    recurringTotals: Object.fromEntries(recurringRaw.map((r) => [r.type, r.total ?? 0])),
    recurringItems: recurringItemsRaw,
    periodTx,
    topExpenses,
    topCategories,
    categorySpending,
    categorySpendingAll,
    last7Days,
    prev7DaysTotal,
    variableCategorySpending: [...topExpenseMap.values()],
  };
}

export const dynamic = "force-dynamic";

/**
 * Home — the redesigned dashboard.
 *
 * Phones, top to bottom: the mustard hero, quick actions, a nudge, Coming up, Spending,
 * the needs-review link and the accounts card. From lg it splits into a main column
 * (hero, category tiles, cash flow, accounts) and a 380px right column (quick actions,
 * nudge, every bill coming up, needs review, latest transactions).
 *
 * The phone order is produced with `order-*` on the children of two `display: contents`
 * wrappers, which become the two real columns from lg — one tree, no mobile twin.
 *
 * Every figure comes from the existing dashboard calculations: getDashboardData,
 * getBudgetOverview, getCashFlowForecast, getFinancialHealthScore and getBillStatuses.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string; cmpA?: string; cmpB?: string; cat?: string; acct?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const financialMonth = await getFinancialMonthConfig();
  const settingsPanels = getSettingsPanelContent(user);
  // Home shows the current financial month unless the URL asks for another range — it
  // never inherits the shared date cookie other pages' pickers write.
  const { from, to } = getDateRange(sp, financialMonth);

  const billMonth = currentFinancialMonth(financialMonth);
  const currentMonthRange = financialMonthRange(financialMonth, 0);

  const [data, billStatuses, needsReview, budgetOverview, bankBalances, vermogenRows, accountHistory, budgetRecurringMode, forecast, health, sharedCostMode, weekNudge] = await Promise.all([
    getDashboardData(from, to, "", financialMonth),
    getBillStatuses(billMonth, financialMonth, UPCOMING_TYPES),
    getNeedsReviewTransactions(),
    getBudgetOverview(financialMonth),
    getBankBalances(),
    db.select().from(vermogenAccounts).where(eq(vermogenAccounts.active, true)),
    getAccountBalanceHistory(180),
    getBudgetRecurringMode(),
    getCashFlowForecast(financialMonth),
    getFinancialHealthScore(financialMonth),
    getSharedCostMode(),
    getWeekNudge(),
  ]);

  const locale = await getLocale();
  const t = await getTranslations("home");
  const tHealth = await getTranslations("financialHealth");
  const today = todayStr();
  const shortDate = (date: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));

  // ── Coming up: unpaid bills with a due date this financial month (the same filter as
  //    /transactions/upcoming), soonest first. Income stays on the list but out of the
  //    total — see billsDueTotal.
  const upcoming = billStatuses
    .filter((s) => s.dueDate != null && s.paid !== true)
    .sort((a, z) => (a.dueDate! < z.dueDate! ? -1 : 1));
  const upcomingTotal = billsDueTotal(upcoming.map((s) => ({ amount: s.item.amount, isIncome: s.item.type === "income" })));
  const upcomingBillCount = upcoming.filter((s) => s.item.type !== "income").length;
  const comingUp: ComingUpBill[] = upcoming.map((s) => ({
    id: s.item.id,
    name: s.item.friendlyName ?? s.item.name,
    amount: s.item.amount,
    icon: s.icon,
    iconColor: s.iconColor,
    dueDate: s.dueDate!,
    overdue: s.overdue,
    isIncome: s.item.type === "income",
  }));

  // ── Hero, Month mode: what's left of the budget — the overall budget when one is
  //    set, else the sum of category budgets (the same rule the old budget alert used).
  //    With no budget at all it falls back to this month's cash flow.
  const hasOverall = (budgetOverview.budget?.amount ?? 0) > 0;
  const budgetTarget = hasOverall ? budgetOverview.budget!.amount : budgetOverview.allocated;
  const budgetSpent = hasOverall ? budgetOverview.totalSpent : budgetOverview.budgetedSpent;
  const hasBudget = budgetTarget > 0;

  const monthPeriod = hasBudget ? { from: budgetOverview.from, to: budgetOverview.to } : currentMonthRange;
  const monthTotalDays = Math.max(1, daysInclusive(monthPeriod.from, monthPeriod.to));
  const monthDaysLeft = Math.max(1, daysInclusive(today < monthPeriod.from ? monthPeriod.from : today, monthPeriod.to));
  const elapsed = (monthTotalDays - monthDaysLeft + 1) / monthTotalDays;

  const monthSafe = hasBudget ? budgetTarget - budgetSpent : data.balance;
  let monthPace: HeroPace | null = null;
  if (hasBudget) {
    const used = budgetSpent / budgetTarget;
    monthPace = used > 1 ? "over" : used > elapsed + 0.05 ? "fast" : "onPace";
  }
  const month: HeroFigures = {
    amount: monthSafe,
    perDay: hasBudget ? Math.max(0, monthSafe) / monthDaysLeft : null,
    until: shortDate(nextDay(monthPeriod.to)),
    pace: monthPace,
    hint: hasBudget ? (monthSafe < 0 ? t("hero.overBudget") : null) : t("hero.noBudget"),
    totalDays: monthTotalDays,
    daysLeft: monthDaysLeft,
  };

  // ── Hero, Balance mode: what's in the bank accounts minus the bills still due this
  //    financial month, spread over the days left in it.
  const fmTotalDays = Math.max(1, daysInclusive(currentMonthRange.from, currentMonthRange.to));
  const fmDaysLeft = Math.max(1, daysInclusive(today < currentMonthRange.from ? currentMonthRange.from : today, currentMonthRange.to));
  const bankTotal = bankBalances.reduce((s, b) => s + (Number(b.balance) || 0), 0);
  const balanceBase = forecast.hasStartingBalance ? forecast.current : bankTotal;
  const balanceSafe = balanceBase - upcomingTotal;
  const balance: HeroFigures = {
    amount: balanceSafe,
    perDay: Math.max(0, balanceSafe) / fmDaysLeft,
    until: shortDate(nextDay(currentMonthRange.to)),
    pace: forecast.status === "empty" ? null : forecast.status === "healthy" ? "onTrack" : "low",
    hint: null,
    totalDays: fmTotalDays,
    daysLeft: fmDaysLeft,
  };

  const stats = {
    budgetUsed: hasBudget ? `${formatEur(budgetSpent).replace(/,\d\d$/, "")} · ${Math.round((budgetSpent / budgetTarget) * 100)}%` : "—",
    forecastLow: forecast.lowest ? `${formatEur(forecast.lowest.amount).replace(/,\d\d$/, "")} · ${shortDate(forecast.lowest.date)}` : "—",
    health: health.score != null && health.stateKey ? `${health.score} · ${tHealth(`state.${health.stateKey}`)}` : "—",
  };

  // ── Spending: every category with spend this period, merged with its budget.
  const spendingRows = data.categorySpending.map((c) => ({
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    color: c.color,
    icon: c.icon,
    spent: c.spent,
    budget: budgetOverview.categories.find((b) => b.categoryId === c.categoryId)?.budget ?? null,
  }));

  // ── Cash flow: the cumulative net by day, up to today.
  const cashFlowHistory = data.walletHistory.filter((p) => p.date <= today).map((p) => p.balance);

  const accountsTotal = bankBalances.reduce((s, b) => s + b.balance, 0) + vermogenRows.reduce((s, a) => s + a.value, 0);
  const hasTransactions = data.recent.length > 0;

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = user.firstName ?? user.name.split(" ")[0];
  const longToday = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <PageShell
      bodyClassName="pt-4 lg:pt-1"
      header={
        <>
      {/* Phone header — wordmark, search and the settings avatar. */}
      <header className="flex w-full items-center justify-between lg:hidden">
        <Wordmark />
        <div className="flex items-center gap-2">
          <SearchButton />
          <SettingsDialog
            user={user}
            panels={settingsPanels}
            financialMonth={financialMonth}
            budgetRecurringMode={budgetRecurringMode}
            sharedCostMode={sharedCostMode}
            iconOnly
          />
        </div>
      </header>

      {/* Desktop header — greeting, the day and how much of the month is left. */}
      <PageHeading
        className="hidden w-full lg:flex"
        title={t(`greeting.${greetingKey}`, { name: firstName })}
        subtitle={t("subtitle", { date: longToday, count: fmDaysLeft })}
        actions={
          <>
            <SearchButton />
            <Link
              href="/transactions/add"
              className="inline-flex h-[42px] items-center gap-2 rounded-full bg-mustard px-[18px] text-sm font-bold text-mustard-ink"
            >
              <IconPlus size={16} stroke={2} />
              {t("addTransaction")}
            </Link>
          </>
        }
      />
        </>
      }
    >
      <DashboardReadySignal />
      <HomeTips />

      <div className={SPLIT_GRID}>
        {/* Main column */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="order-1 lg:order-none">
            <HeroCard month={month} balance={balance} stats={stats} />
          </div>
          <SpendingList rows={spendingRows} className="order-5 lg:order-none lg:hidden" />
          <CategoryTiles rows={spendingRows} total={spendingRows.length} className="hidden lg:flex" />
          <CashFlowCard net={data.balance} history={cashFlowHistory} className="hidden lg:flex" />
          <div className="order-8 lg:order-none">
            <AccountsCard bankBalances={bankBalances} vermogenRows={vermogenRows} accountsTotal={accountsTotal} accountHistory={accountHistory} />
          </div>
        </div>

        {/* Right column (desktop) */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="order-2 lg:order-none">
            <QuickActions />
          </div>
          {!hasTransactions && (
            <div className="order-3 lg:order-none rounded-card border border-line bg-surface shadow-card">
              <DashboardEmptyState />
            </div>
          )}
          <div className="order-3 lg:order-none empty:hidden">
            <NudgeCard nudge={weekNudge} billsDue={{ count: upcomingBillCount, total: upcomingTotal }} />
          </div>
          <div className="order-4 lg:order-none">
            <ComingUp bills={comingUp} month={billMonth} totalDue={upcomingTotal} today={today} />
          </div>
          <div className="order-6 lg:order-none empty:hidden">
            <NeedsReviewLink count={needsReview.length} />
          </div>
          {hasTransactions && (
            <section className="hidden flex-col gap-2.5 lg:flex">
              <SectionHead title={t("latest.title")} link={t("latest.all")} href="/transactions" />
              <div className="rounded-card border border-line bg-surface px-[18px] py-1 shadow-card">
                <DashboardRecentTransactions recent={data.recent.slice(0, 6)} categories={data.categories} savingsGoals={data.goals} />
              </div>
            </section>
          )}
        </div>
      </div>
    </PageShell>
  );
}
