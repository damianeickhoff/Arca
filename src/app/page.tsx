import { db } from "@/db";
import { transactions, categories, goals, recurringItems, banks, vermogenAccounts } from "@/db/schema";
import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import { formatEur } from "@/lib/format";
import { SplitEur } from "@/components/split-eur";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";
import { WalletHero } from "@/components/wallet-hero";
import Link from "next/link";
import { ComparisonCard } from "@/components/comparison-card";
import { getMonthComparison, pctChange } from "@/lib/month-comparison";
import { getDateRange, financialMonthForDate, financialMonthRange, currentFinancialMonth, shiftDate, periodElapsedPct } from "@/lib/date-range";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { authBackgroundStyle, getAuthBackgroundPreset } from "@/lib/auth-background";
import { getBillStatuses } from "@/lib/bill-status";
import { getBudgetOverview } from "@/lib/budget-overview";
import { getBankBalances, getAccountBalanceHistory } from "@/lib/account-balances";
import { DashboardHeaderBar } from "@/components/dashboard-header-bar";
import { BudgetAlertCard } from "@/components/budget-alert-card";
import { NoBudgetCard } from "@/components/no-budget-card";
import { DashboardFlowGlow } from "@/components/dashboard-flow-glow";
import { DashboardReadySignal } from "@/components/dashboard-ready-signal";
import { DashboardEmptyState } from "@/app/dashboard-empty-state";
import { BudgetPortalProvider } from "@/lib/budget-portal-state";
import { DashboardAnimationProvider } from "@/lib/dashboard-animation";
import { AccountsCard } from "@/components/accounts-card";
import { getReportsPortalContent } from "@/app/reports/reports-portal-content";
import { getBudgetPortalContent } from "@/app/budget-portal-content";
import { getSettingsPanelContent } from "@/app/settings-panel-content";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardRecentTransactions } from "@/app/dashboard-recent-transactions";
import { getNeedsReviewTransactions } from "@/lib/needs-review";
import { CategorySpendingRow } from "@/components/category-spending-row";
import { TransactionsPortalProvider } from "@/lib/transactions-portal-state";
import { UpcomingBillsTile, NeedsReviewTile } from "@/components/dashboard-transaction-tiles";
import { UpcomingPortal } from "@/components/upcoming-portal";
import { NeedsReviewPortal } from "@/components/needs-review-portal";
import type { CalendarBill } from "@/app/budget/bills-calendar";
import { cookies } from "next/headers";
import { AccountsButton } from "@/app/accounts-button";
import { selectBankAction } from "@/app/actions/select-bank";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import {
  buildSplitAllocations,
  getDisplayedTransactionCategory,
  groupTransactionSplits,
} from "@/lib/transaction-splits";
import type { Viewport } from "next";

// The mobile dashboard hero is a full-bleed gradient that runs to the top of the screen.
// On iOS the status bar / notch area is OS chrome, not page content, so it can't render the
// gradient itself — it only takes a single solid colour from the `theme-color` meta. The root
// layout sets that to white to match every other (plain-background) page, which on the
// dashboard shows up as the gray strip above the gradient. Override it here, for this route
// only, to the gradient's start colour (the deep teal at 0%, under where the iOS clock sits)
// so the bar blends into the gradient instead of clashing. Next.js shallow-merges viewport,
// so the root's `viewportFit: "cover"` is preserved.
export const viewport: Viewport = {
  themeColor: "#0b3b47",
};

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

  const [periodRows, monthlyRows, goalsRaw, recurringRaw, recurringItemsRaw, last7DaysRaw, recentRows, allCategories] =
    await Promise.all([
      db.select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        reimbursedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id}), 0)`,
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
        reimbursedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id}), 0)`,
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
      })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .leftJoin(banks, eq(transactions.account, banks.accountNumber))
        .leftJoin(recurringItems, eq(transactions.recurringItemId, recurringItems.id))
        .where(bankFilter)
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(40),

      db.select().from(categories).orderBy(categories.name),
    ]);

  const splitRows = await getTransactionSplitRows(
    Array.from(new Set([...periodRows.map((row) => row.id), ...monthlyRows.map((row) => row.id), ...recentRows.map((row) => row.id)])),
  );
  const splitMap = groupTransactionSplits(splitRows);
  const periodAllocations = buildSplitAllocations(periodRows, splitMap);
  const monthlyAllocations = buildSplitAllocations(monthlyRows, splitMap);

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
  const categorySpendingMap = new Map<number, { categoryId: number; categoryName: string; color: string | null; icon: string | null; spent: number; excluded: boolean }>();
  for (const row of periodAllocations) {
    if (row.direction !== "expense" || row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings" || row.categoryId == null) continue;
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

function rangeLabel(from: string, to: string): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  // Same month?
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return new Date(from + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  return `${fmt(from)} – ${fmt(to)}`;
}

function monthName(date: string): string {
  const name = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { month: "long" });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function signedEur(amount: number) {
  return `${amount < 0 ? "-" : ""}${formatEur(amount)}`;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string; cmpA?: string; cmpB?: string; cat?: string; acct?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const financialMonth = await getFinancialMonthConfig();
  const settingsPanels = getSettingsPanelContent(user);
  // Dashboard always shows the current financial month by default — it must
  // not inherit the shared date_from/date_to cookie written by other pages'
  // date pickers (e.g. Reports), only its own URL query params.
  const { from, to } = getDateRange(sp, financialMonth);
  const label = rangeLabel(from, to);

  const selectedBank = cookieStore.get("selected_bank")?.value ?? "";

  const billMonth = currentFinancialMonth(financialMonth);
  const currentMonthRange = financialMonthRange(financialMonth, 0);
  const isViewingCurrentMonth = from === currentMonthRange.from && to === currentMonthRange.to;

  const [data, allBanks, reportsContent, goalsContent, billStatuses, cmp, needsReview, budgetOverview, bankBalances, vermogenRows, accountHistory] = await Promise.all([
    getDashboardData(from, to, selectedBank, financialMonth),
    db.select().from(banks).orderBy(asc(banks.displayName), asc(banks.accountNumber)),
    getReportsPortalContent({ cmpA: sp.cmpA, cmpB: sp.cmpB, cat: sp.cat, acct: sp.acct, month: sp.month }),
    getBudgetPortalContent(),
    getBillStatuses(billMonth, financialMonth),
    getMonthComparison(financialMonth),
    getNeedsReviewTransactions(),
    // The overspend alert is only meaningful for "right now" — suppress it when the
    // user has picked a historical or custom date range on the dashboard.
    isViewingCurrentMonth ? getBudgetOverview(financialMonth) : Promise.resolve(null),
    getBankBalances(),
    db.select().from(vermogenAccounts).where(eq(vermogenAccounts.active, true)),
    getAccountBalanceHistory(180),
  ]);

  // Per-user, not app-wide — each family member picks their own dashboard color fade
  // (see users.authBackground / src/lib/auth-background.ts).
  const authBackground = getAuthBackgroundPreset(user.authBackground);

  const needsReviewTotal = needsReview.reduce((sum, r) => sum + (r.correctedAmount ?? r.amount), 0);

  // Upcoming = has a due date this financial month AND not yet paid (same filter as
  // /transactions/upcoming), same tile as the transactions page's own summary card.
  const upcomingBills = billStatuses
    .filter((s) => s.dueDate != null && s.paid !== true)
    .sort((a, z) => (a.dueDate! < z.dueDate! ? -1 : 1));
  const upcomingIcons = upcomingBills.slice(0, 3).map((s) => ({ icon: s.icon, iconColor: s.iconColor, iconBackground: s.iconBackground }));
  const upcomingTotal = upcomingBills.reduce((sum, s) => sum + (s.item.amount ?? 0), 0);

  // Same shape the standalone /transactions/upcoming route builds, for the dashboard's
  // own in-page Upcoming portal (see upcoming-portal.tsx).
  const calendarBills: CalendarBill[] = upcomingBills.map(({ item, icon, iconColor, iconBackground, dueDate, paid, paidSource, overdue }) => ({
    id: item.id,
    name: item.friendlyName ?? item.name,
    amount: item.amount,
    icon,
    iconColor,
    iconBackground,
    dueDate,
    paid,
    paidSource,
    overdue,
  }));

  // Overall budget alert — the configured overall budget if one exists, else the sum
  // of category budgets. Only surfaced once spend reaches 80% of that target.
  // Overall budget alert — the configured overall budget if one exists, else the sum
  // of category budgets.
  let budgetAlert: {
    severity: "success" | "warning" | "danger";
    pct: number;
    title: string;
    description: string;
  } | null = null;

  if (budgetOverview) {
    const hasOverall = (budgetOverview.budget?.amount ?? 0) > 0;
    const overallTarget = hasOverall ? budgetOverview.budget!.amount : budgetOverview.allocated;
    const overallSpent = hasOverall ? budgetOverview.totalSpent : budgetOverview.budgetedSpent;
    const pct = overallTarget > 0 ? overallSpent / overallTarget : 0;

    const totalDays = Math.max(
      1,
      Math.round(
        (new Date(`${budgetOverview.to}T12:00:00`).getTime() -
          new Date(`${budgetOverview.from}T12:00:00`).getTime()) /
          86_400_000,
      ) + 1,
    );

    const elapsedPct =
      ((totalDays - budgetOverview.daysLeft) / totalDays) * 100;

    const phase =
      elapsedPct < 33
        ? "early"
        : elapsedPct < 66
          ? "around the midpoint"
          : "toward the end";

    if (pct >= 1) {
      budgetAlert = {
        severity: "danger",
        pct,
        title: `${formatEur(overallSpent - overallTarget)} over budget`,
        description: `You're over the budget ${phase}. Consider whether your limit needs adjusting for next month.`,
      };
    } else if (pct >= 0.85) {
      budgetAlert = {
        severity: "warning",
        pct,
        title: `${formatEur(overallTarget - overallSpent)} left in budget`,
        description: `Not a lot left ${phase}. Slowing down now could help.`,
      };
    } else if (pct >= 0.7) {
      budgetAlert = {
        severity: "warning",
        pct,
        title: `${formatEur(overallTarget - overallSpent)} left in budget`,
        description: `Spending a bit faster than planned. Keep an eye on it.`,
      };
    } else if (pct >= 0.5) {
      budgetAlert = {
        severity: "success",
        pct,
        title: `${formatEur(overallTarget - overallSpent)} left in budget`,
        description: `Right on track for this period.`,
      };
    } else if (pct >= 0.3) {
      budgetAlert = {
        severity: "success",
        pct,
        title: `${formatEur(overallTarget - overallSpent)} left in budget`,
        description: `Spending comfortably below pace. Looking good.`,
      };
    } else {
      budgetAlert = {
        severity: "success",
        pct,
        title: `${formatEur(overallTarget - overallSpent)} left in budget`,
        description: `Well under pace. You've built a strong cushion.`,
      };
    }

  }

  // Merge the period's per-category spend with whatever budget (if any) that category
  // has set — most categories have none, in which case the card (and the detail portal
  // it opens) simply omits the budget-related bits.
  function withBudget(c: (typeof data.categorySpendingAll)[number]) {
    const budgetRow = budgetOverview?.categories.find((b) => b.categoryId === c.categoryId);
    const budget = budgetRow?.budget ?? null;
    return {
      ...c,
      budget,
      pct: budget != null && budget > 0 ? c.spent / budget : null,
    };
  }
  const categorySpendingRows = data.categorySpending.map(withBudget);
  const categorySpendingAllRows = data.categorySpendingAll.map(withBudget);

  // How far into the current financial month "today" is — feeds the small "you are
  // here" marker on the dashboard's category-spend rings (the detail portal instead
  // uses whatever period the user has selected there).
  const monthElapsedPct = periodElapsedPct(currentMonthRange.from, currentMonthRange.to);

  const accountsTotal = bankBalances.reduce((s, b) => s + b.balance, 0) + vermogenRows.reduce((s, a) => s + a.value, 0);

  const activeGoals = data.goals.filter((g) => g.targetAmount > 0);
  const sortedGoals = [...activeGoals]
    .map((g) => ({ ...g, pct: Math.min(100, (g.currentAmount / g.targetAmount) * 100) }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <DashboardAnimationProvider>
    <BudgetPortalProvider>
    <TransactionsPortalProvider>
    <div className="relative isolate mt-[calc(-1.7rem-var(--sat))] lg:mt-0 pt-[var(--sat)] lg:pt-0 min-h-dvh " style={authBackgroundStyle(authBackground, { boxHeight: "100dvh", fadeStop: 50 })}>
      <DashboardReadySignal />
      <DashboardFlowGlow />

      {/* ── DASHBOARD — mobile base, widens into a grid on desktop ── */}
      <div className="min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 lg:pb-0 lg:max-w-6xl lg:mx-auto lg:px-6 ">

        {/* Transparent top bar — circular buttons, status-bar height padding.
            Sticky like the other pages; white glass icons stay legible once stuck
            because the scroll-aware top edge-fade reveals a dark strip behind them. */}
        <div className="sticky top-[var(--sat)] z-40 flex items-center justify-between px-4 pt-[11px] pb-3">
          <DashboardHeaderBar
            reportsContent={reportsContent}
            budgetContent={goalsContent}
            user={user}
            settingsPanels={settingsPanels}
            financialMonth={financialMonth}
          />
        </div>

        {/* Wallet card — gradient hero; tap the amount to toggle cash flow ↔ total
            balance (see WalletHero). */}
        <WalletHero
          cashflowBalance={data.balance}
          periodLabel={label}
          walletHistory={data.walletHistory}
          totalBalance={accountsTotal}
          accountHistory={accountHistory}
        />

        {/* Overall budget alert — ring + message, only once spend reaches 80% of the
            overall (or summed category) budget. Opens the Budget portal (same one as
            the header's wallet icon) rather than navigating to the old /budget page. */}
        {budgetOverview && !budgetOverview.budget && <NoBudgetCard />}
        {budgetOverview?.budget && budgetAlert && (
          <BudgetAlertCard
            pct={budgetAlert.pct * 100}
            severity={budgetAlert.severity}
            title={budgetAlert.title}
            description={budgetAlert.description}
          />
        )}

        {/* Spending by category — scrollable row of every category with at least one
            transaction this period (biggest spend first), regardless of whether it has
            a budget set; tapping a card opens the category detail portal
            (src/components/category-detail-portal.tsx) */}
        {categorySpendingAllRows.length > 0 && (
          <CategorySpendingRow
            rows={categorySpendingRows}
            allRows={categorySpendingAllRows}
            periodElapsedPct={monthElapsedPct}
            financialMonth={financialMonth}
            budgetPeriod={budgetOverview ? { from: budgetOverview.from, to: budgetOverview.to } : { from, to }}
          />
        )}

        {/* Upcoming transactions — same summary tile as the transactions page */}
        {upcomingBills.length > 0 && (
          <>
            <div className="flex items-center justify-between mx-6 mt-5 mb-2">
                <h2 className="font-semibold text-base">Upcoming Bills</h2>
            </div>
            <UpcomingBillsTile count={upcomingBills.length} total={upcomingTotal} icons={upcomingIcons} />
          </>
        )}


        {/* Recent transactions */}
          <div className="flex items-center justify-between mx-6 mt-5 mb-2">
            <h2 className="font-semibold text-base">Recent transactions</h2>
            {data.recent.length > 0 && (
              <Link href="/transactions" className="text-sm text-muted-foreground active:opacity-70">
                Show all
              </Link>
            )}
          </div>
        {/* Needs review — transactions with no category yet. Hidden when the queue is empty. */}
        {needsReview.length > 0 && (
          <NeedsReviewTile count={needsReview.length} total={needsReviewTotal} />
        )}
                  
        <div className="pb-4 mt-3 px-5 mx-3 rounded-xl bg-card backdrop-blur-3xl">
          {data.recent.length > 0 ? (
            <DashboardRecentTransactions recent={data.recent} categories={data.categories} savingsGoals={data.goals} />
          ) : <DashboardEmptyState categories={data.categories} />}
        </div>

        {/* Accounts — total saldo across bank + asset accounts, with a running-balance sparkline */}
        <AccountsCard bankBalances={bankBalances} vermogenRows={vermogenRows} accountsTotal={accountsTotal} accountHistory={accountHistory} />

      </div>
    </div>
    <UpcomingPortal bills={calendarBills} from={currentMonthRange.from} to={currentMonthRange.to} month={billMonth} />
    <NeedsReviewPortal rows={needsReview} categories={data.categories} savingsGoals={data.goals} />
    </TransactionsPortalProvider>
    </BudgetPortalProvider>
    </DashboardAnimationProvider>
  );
}

