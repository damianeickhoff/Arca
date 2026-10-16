import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { banks, categories, goals, merchants, recurringItems, transactions } from "@/db/schema";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";
import { reimbursedAmountExpr } from "@/lib/reimbursed-amount";
import { getDateRange, financialMonthForDate, financialMonthRange, currentFinancialMonth, daysInclusive, shiftDate, todayStr } from "@/lib/date-range";
import { getFinancialMonthConfig, getBudgetRecurringMode, getSharedCostMode, getHomeGetStartedDismissed, getOverdraftMode } from "@/lib/app-settings";
import { getBillStatuses, UPCOMING_TYPES } from "@/lib/bill-status";
import { getBudgetOverview } from "@/lib/budget-overview";
import { budgetSpendByDay, safeToSpend, type SpendEntry } from "@/lib/safe-to-spend";
import { getBankBalances } from "@/lib/account-balances";
import { getNeedsReviewTransactions } from "@/lib/needs-review";
import { billsDueTotal } from "@/lib/bill-amounts";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, getDisplayedTransactionCategory, groupTransactionSplits } from "@/lib/transaction-splits";
import { getCurrentUser, toClientUser } from "@/lib/auth";
import { getSettingsPanelContent } from "@/app/settings-panel-content";
import { DashboardReadySignal } from "@/components/dashboard-ready-signal";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { HomeHero } from "@/app/_home/home-hero";
import {
  AccountsCard,
  BudgetCard,
  ComingUpCard,
  IncomeSpendingCard,
  MoneyFlowCard,
  ReviewLink,
  ThisMonthCard,
  type BudgetRow,
  type ComingUpBill,
  type FlowDay,
  type MonthBar,
} from "@/app/_home/home-sections";
import { HomeRecentActivity } from "@/app/_home/home-recent-activity";
import { GetStartedCard } from "@/app/_home/get-started";
import { SetSalaryButton } from "@/app/_home/set-salary-button";
import { HomeTips } from "@/app/_home/home-tips";
import { cn } from "@/lib/utils";

/** How many budget months the income-vs-spending chart shows. */
const CHART_MONTHS = 6;

/**
 * Money in and out for the Home figures, with the dashboard's spending rules: split
 * aware, internal transfers and reimbursements left out, and money moved into savings
 * categories counted as saved rather than spent.
 */
async function getHomeData(from: string, to: string, financialMonth: Awaited<ReturnType<typeof getFinancialMonthConfig>>, netReimbursements: boolean) {
  const chartFrom = financialMonthRange(financialMonth, -(CHART_MONTHS - 1)).from;
  const chartTo = financialMonthRange(financialMonth, 0).to;
  // One query covers both the chart's months and the selected period.
  const rangeFrom = from < chartFrom ? from : chartFrom;
  const rangeTo = to > chartTo ? to : chartTo;

  const [rows, recentRows, allCategories, savingsGoals, recurringCount] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        reimbursedAmount: reimbursedAmountExpr,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryGroup: categories.group,
        isReimbursement: transactions.isReimbursement,
        isInternalTransfer: isInternalTransferExpr,
        recurringItemId: transactions.recurringItemId,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, rangeFrom), lte(transactions.date, rangeTo))),

    db
      .select({
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
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(7),

    db.select().from(categories).orderBy(categories.name),
    db.select().from(goals).where(and(eq(goals.goalType, "savings"), eq(goals.active, true))),
    db.$count(recurringItems, eq(recurringItems.active, true)),
  ]);

  const splitMap = groupTransactionSplits(
    await getTransactionSplitRows(Array.from(new Set([...rows.map((r) => r.id), ...recentRows.map((r) => r.id)]))),
  );
  const allocations = buildSplitAllocations(rows, splitMap, { netReimbursements });

  let income = 0;
  let spent = 0;
  let fixed = 0;
  let saved = 0;
  const recurringTx = new Set(rows.filter((r) => r.recurringItemId != null).map((r) => r.id));
  const byMonth = new Map<string, { income: number; expense: number }>();
  // Every expense, for the hero's pace line (lib/safe-to-spend decides what counts).
  const expenses: SpendEntry[] = [];
  // Money in and out per day of the period, for the Money flow chart.
  const flow = new Map<string, { in: number; out: number }>();

  for (const a of allocations) {
    if (a.isReimbursement || a.isInternalTransfer) continue;
    if (a.direction === "expense") {
      expenses.push({ date: a.date, amount: a.amount, categoryId: a.categoryId, recurring: recurringTx.has(a.transactionId) });
    }
    const inPeriod = a.date >= from && a.date <= to;
    if (a.categoryGroup === "savings") {
      if (inPeriod && a.direction === "expense") saved += a.amount;
      continue;
    }
    if (inPeriod) {
      const day = flow.get(a.date) ?? { in: 0, out: 0 };
      if (a.direction === "income") {
        income += a.amount;
        day.in += a.amount;
      } else {
        spent += a.amount;
        day.out += a.amount;
        if (recurringTx.has(a.transactionId)) fixed += a.amount;
      }
      flow.set(a.date, day);
    }
    if (a.date >= chartFrom && a.date <= chartTo) {
      const month = financialMonthForDate(a.date, financialMonth);
      const m = byMonth.get(month) ?? { income: 0, expense: 0 };
      m[a.direction === "income" ? "income" : "expense"] += a.amount;
      byMonth.set(month, m);
    }
  }

  const months: MonthBar[] = Array.from({ length: CHART_MONTHS }, (_, i) => {
    const range = financialMonthRange(financialMonth, -(CHART_MONTHS - 1) + i);
    const month = range.from.slice(0, 7);
    return { month, endsOn: range.to, income: byMonth.get(month)?.income ?? 0, expense: byMonth.get(month)?.expense ?? 0 };
  });
  // Drop leading months with no data, so a new household isn't shown five empty months.
  const firstWithData = months.findIndex((m) => m.income !== 0 || m.expense !== 0);
  const chartMonths = firstWithData === -1 ? [] : months.slice(firstWithData);
  const previous = months[months.length - 2];

  const recent = recentRows.map((row) => ({ ...row, ...getDisplayedTransactionCategory(row, splitMap.get(row.id) ?? []) }));

  const flowDays: FlowDay[] = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    flowDays.push({ date: d, in: flow.get(d)?.in ?? 0, out: flow.get(d)?.out ?? 0 });
  }

  return {
    income,
    previousIncome: previous?.income ?? 0,
    spent,
    fixed,
    saved,
    chartMonths,
    expenses,
    flowDays,
    recent,
    allCategories,
    savingsGoals,
    hasRecurring: recurringCount > 0,
  };
}

export const dynamic = "force-dynamic";

/**
 * Home, on the Clear design. Desktop: the page heading, then Safe to spend, this
 * month's figures and income vs spending in one row, then the budget and what is
 * coming up beside recent activity and the accounts. Phones stack the same tree.
 * Before anything is imported it shows the get-started checklist instead.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const financialMonth = await getFinancialMonthConfig();
  // Home shows the current financial month unless the URL asks for another range — it
  // never inherits the shared date cookie other pages' pickers write.
  const { from, to } = getDateRange(sp, financialMonth);
  const billMonth = currentFinancialMonth(financialMonth);
  const currentMonth = financialMonthRange(financialMonth, 0);

  const [sharedCostMode, budgetRecurringMode, getStartedDismissed, overdraftMode] = await Promise.all([getSharedCostMode(), getBudgetRecurringMode(), getHomeGetStartedDismissed(), getOverdraftMode()]);
  const [data, billStatuses, needsReview, budgetOverview, bankBalances] = await Promise.all([
    getHomeData(from, to, financialMonth, sharedCostMode === "net"),
    getBillStatuses(billMonth, financialMonth, UPCOMING_TYPES),
    getNeedsReviewTransactions(),
    getBudgetOverview(financialMonth),
    getBankBalances(),
  ]);

  const locale = await getLocale();
  const t = await getTranslations("home");
  const today = todayStr();
  const shortDate = (date: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));

  // Bills with a due date this financial month that aren't paid yet, soonest first.
  // Income stays on the list but out of the total — see billsDueTotal.
  const upcoming = billStatuses
    .filter((s) => s.dueDate != null && s.paid !== true)
    .sort((a, z) => (a.dueDate! < z.dueDate! ? -1 : 1));
  const comingUp: ComingUpBill[] = upcoming.map((s) => ({
    id: s.item.id,
    name: s.item.friendlyName ?? s.item.name,
    amount: s.item.amount ?? 0,
    dueDate: s.dueDate!,
    overdue: s.overdue,
    isIncome: s.item.type === "income",
  }));
  const billsDue = billsDueTotal(comingUp);
  const billsDueCount = comingUp.filter((b) => !b.isIncome).length;

  const hero = safeToSpend(
    budgetOverview,
    upcoming.map((s) => ({ categoryId: s.item.categoryId, amount: s.item.amount ?? 0, dueDate: s.dueDate!, isIncome: s.item.type === "income" })),
    budgetRecurringMode,
    today,
  );
  const spendByDay = hero ? budgetSpendByDay(data.expenses, budgetOverview, budgetRecurringMode, today) : [];

  const budgetRows: BudgetRow[] = budgetOverview.categories
    .filter((c) => c.budget != null && c.budget > 0)
    .sort((a, z) => z.spent / z.budget! - a.spent / a.budget!)
    .slice(0, 4)
    .map((c) => ({ categoryId: c.categoryId, name: c.categoryName, icon: c.icon, color: c.color, spent: c.spent, budget: c.budget! }));
  const budgetTitle =
    budgetOverview.budget?.period === "weekly"
      ? t("budget.titleWeekly")
      : // Named after the month the period ends in: 23 Sep – 22 Oct is the October budget.
        t("budget.title", { month: new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(`${budgetOverview.to}T12:00:00`)) });

  const accounts = bankBalances.map((b) => ({
    key: `bank-${b.id}`,
    name: b.displayName ?? b.accountNumber ?? "—",
    suffix: b.accountNumber ? b.accountNumber.slice(-4) : null,
    balance: Number(b.balance) || 0,
    overdraftLimit: b.overdraftLimit ?? 0,
  }));
  const accountsTotal = accounts.reduce((s, a) => s + a.balance, 0);

  const hasTransactions = data.recent.length > 0;
  // Payday is the next expected salary (an income recurring item still to come); with no
  // income set up yet the heading asks for it instead of guessing from the month's end.
  const nextSalary = billStatuses
    .filter((s) => s.item.type === "income" && s.paid !== true && s.dueDate != null && s.dueDate >= today)
    .sort((a, z) => a.dueDate!.localeCompare(z.dueDate!))[0];
  const hasSalary = billStatuses.some((s) => s.item.type === "income");
  const daysToPayday = nextSalary
    ? Math.max(0, daysInclusive(today, nextSalary.dueDate!) - 1)
    : Math.max(1, daysInclusive(today < currentMonth.from ? currentMonth.from : today, currentMonth.to));
  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = user.firstName ?? user.name.split(" ")[0];
  const longToday = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      <DashboardReadySignal />
      <HomeTips />

      {/* Phone header — the avatar opens Settings; search sits on the right. */}
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <SettingsDialog
            user={toClientUser(user)}
            panels={getSettingsPanelContent(user)}
            financialMonth={financialMonth}
            budgetRecurringMode={budgetRecurringMode}
            sharedCostMode={sharedCostMode}
            iconOnly
          />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-[13px] text-clear-ink-2">{t(`greetingShort.${greetingKey}`)}</span>
            <span className="truncate text-lg font-extrabold tracking-[-0.02em]">{firstName}</span>
          </span>
        </div>
      </div>

      {/* Heading — desktop title row; on phones only the review strip shows. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="hidden flex-col gap-1.5 lg:flex">
          <h1 className="m-0 text-[40px] font-extrabold tracking-[-0.03em]">{t(`greeting.${greetingKey}`, { name: firstName })}</h1>
          <span className="text-base text-clear-ink-2">
            {hasSalary ? (
              t("subtitle", { date: longToday, count: daysToPayday })
            ) : (
              <>
                {longToday} ·{" "}
                <SetSalaryButton label={t("setSalary")} salaryName={t("salaryName")} />
              </>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 empty:hidden">
          <ReviewLink count={needsReview.length} />
        </div>
      </div>

      {/* One grid for every card, so columns line up from row to row: three columns from
          xl (two from lg). Safe to spend, this month and income vs spending on top; then
          the budget beside money flow; then what's coming up and the accounts beside
          recent activity. */}
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <HomeHero figures={hero} resetsOn={hero ? shortDate(hero.resetsOn) : ""} spendByDay={spendByDay} />
        {hasTransactions ? (
          <>
            <ThisMonthCard
              figures={{
                income: data.income,
                incomeChange: data.previousIncome > 0 ? (data.income - data.previousIncome) / data.previousIncome : null,
                spent: data.spent,
                fixed: data.fixed,
                saved: data.saved,
                billsDue,
                billsDueCount,
                billsBy: shortDate(currentMonth.to),
              }}
            />
            <div className="min-w-0 lg:col-span-2 xl:col-span-1 [&>*]:h-full">
              <IncomeSpendingCard months={data.chartMonths} />
            </div>

            {/* The budget and money flow share a row, so they're the same height. */}
            {hero && <BudgetCard title={budgetTitle} target={hero.target} spent={hero.spent} rows={budgetRows} />}
            <div className={cn("flex min-w-0 xl:col-span-2 [&>*]:flex-1", !hero && "lg:col-span-2 xl:col-span-3")}>
              <MoneyFlowCard days={data.flowDays} today={today} />
            </div>
            {/* Coming up and the accounts share the height of recent activity equally; their
                tiles grow to fill each card. */}
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-1 flex-col [&>*]:flex-1">
                <ComingUpCard bills={comingUp.slice(0, 4)} totalDue={billsDue} today={today} />
              </div>
              <div className="flex flex-1 flex-col empty:hidden [&>*]:flex-1">
                <AccountsCard accounts={accounts} total={accountsTotal} overdraftMode={overdraftMode} />
              </div>
            </div>
            <div className="min-w-0 xl:col-span-2">
              <HomeRecentActivity recent={data.recent} categories={data.allCategories} savingsGoals={data.savingsGoals} />
            </div>
          </>
        ) : getStartedDismissed ? null : (
          <div className="min-w-0 xl:col-span-2 [&>*]:h-full">
            <GetStartedCard
              steps={{
                imported: false,
                budget: hero != null,
                bills: data.hasRecurring,
                goal: data.savingsGoals.length > 0,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
