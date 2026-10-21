import { getLocale } from "next-intl/server";
import { getBudgetRecurringMode, getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth, daysInclusive, offsetFinancialMonth, shiftDate, todayStr } from "@/lib/date-range";
import { getBudgetOverview } from "@/lib/budget-overview";
import { getBudgetData } from "@/lib/budget-data";
import { getBillStatuses, UPCOMING_TYPES } from "@/lib/bill-status";
import { safeToSpend } from "@/lib/safe-to-spend";
import { getNeedsReviewTransactions } from "@/lib/needs-review";
import { summarizeNeedsReview } from "@/lib/needs-review-summary";
import { byDueDate } from "@/lib/bill-groups";
import { BudgetEditorProvider } from "./budget-editor";
import { BudgetView, type BudgetBill, type BudgetSuggestion, type BudgetViewData } from "./budget-view";

/** How far back the period switcher goes, in financial months. */
const HISTORY_MONTHS = 24;

/** Round up / down to a multiple of five euros — suggestions move tidy amounts. */
const up5 = (n: number) => Math.ceil(n / 5) * 5;
const down5 = (n: number) => Math.floor(n / 5) * 5;

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const financialMonth = await getFinancialMonthConfig();
  const current = currentFinancialMonth(financialMonth);
  const oldest = offsetFinancialMonth(current, -HISTORY_MONTHS);
  // ?month= picks an earlier budget month (never a future one); anything else is now.
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) && sp.month < current && sp.month >= oldest ? sp.month : current;
  const isCurrent = month === current;

  const [overview, budgetData, billStatuses, recurringMode, locale, needsReview] = await Promise.all([
    getBudgetOverview(financialMonth, { month }),
    getBudgetData(month, financialMonth),
    getBillStatuses(month, financialMonth, UPCOMING_TYPES),
    getBudgetRecurringMode(),
    getLocale(),
    getNeedsReviewTransactions(),
  ]);

  const today = todayStr();
  // A weekly budget always shows this week; only monthly budgets step through months.
  const weekly = overview.budget?.period === "weekly";
  // An earlier month has ended: its figures are read as of the day after it.
  const ended = !isCurrent && !weekly;
  const asOf = ended ? shiftDate(overview.to, 1) : today;

  // ── The hero: Home's safe-to-spend figures (the overall budget when one is set, else
  //    the sum of the category budgets), so both pages show the same per-day amount.
  const unpaid = billStatuses.filter((s) => s.dueDate != null && s.paid !== true);
  const figures = safeToSpend(
    overview,
    unpaid.map((s) => ({ categoryId: s.item.categoryId, amount: s.item.amount ?? 0, dueDate: s.dueDate!, isIncome: s.item.type === "income" })),
    recurringMode,
    asOf,
  );
  const totalDays = Math.max(1, daysInclusive(overview.from, overview.to));
  const daysLeft = ended ? 0 : Math.max(1, daysInclusive(today < overview.from ? overview.from : today, overview.to));
  const day = totalDays - daysLeft + (ended ? 0 : 1);
  const elapsed = ended ? 1 : (totalDays - daysLeft) / totalDays;

  // ── Category budgets: parents first, each followed by its own budgeted children.
  const budgeted = overview.categories.filter((c) => c.budget != null && c.budget > 0);
  const parents = budgeted.filter((c) => c.parentCategoryId == null);
  const orphans = budgeted.filter((c) => c.parentCategoryId != null && !parents.some((p) => p.categoryId === c.parentCategoryId));
  const rows = [
    ...parents.flatMap((p) => [p, ...budgeted.filter((c) => c.parentCategoryId === p.categoryId)]),
    ...orphans,
  ];

  // ── The over-budget suggestion: the category furthest along (90% and up), and — when
  //    another budgeted category still has room — an amount to move across that would
  //    cover its projected overshoot at the current pace.
  let suggestion: BudgetSuggestion | null = null;
  const pace = Math.max(elapsed, 0.1);
  // Only for the month in progress: an ended month can't be rebalanced any more.
  const hot = ended
    ? undefined
    : rows
    .map((c) => ({ c, pct: (c.spent / c.budget!) * 100 }))
    .filter((x) => x.pct >= 90)
    .sort((a, z) => z.pct - a.pct)[0];
  if (hot) {
    const projected = Math.max(hot.c.spent, hot.c.spent / pace);
    const need = up5(Math.max(5, projected - hot.c.budget!));
    const donor = rows
      .filter((c) => c.categoryId !== hot.c.categoryId)
      .map((c) => {
        // What the donor would still have spare at the end of the period at its own pace.
        const projectedDonor = Math.max(c.spent, c.spent / pace);
        return { c, spare: down5(Math.min(c.budget! - c.spent, c.budget! - projectedDonor)) };
      })
      .filter((d) => d.spare >= 5)
      .sort((a, z) => z.spare - a.spare)[0];
    suggestion = {
      categoryId: hot.c.categoryId,
      name: hot.c.categoryName,
      budget: hot.c.budget!,
      spent: hot.c.spent,
      pct: Math.round(hot.pct),
      over: Math.max(0, hot.c.spent - hot.c.budget!),
      daysLeft,
      move: donor
        ? { fromId: donor.c.categoryId, fromName: donor.c.categoryName, fromBudget: donor.c.budget!, fromSpent: donor.c.spent, amount: Math.min(need, donor.spare) }
        : null,
    };
  }

  // ── Bills and income this financial month (each only in the months it is due in:
  //    getBillStatuses places quarterly and yearly items in their own months), soonest
  //    first, one without a due day last.
  const bills: BudgetBill[] = billStatuses
    .map((s) => ({
      id: s.item.id,
      name: s.item.friendlyName ?? s.item.name,
      amount: s.item.amount,
      icon: s.icon,
      iconColor: s.iconColor,
      iconBackground: s.iconBackground,
      dueDate: s.dueDate,
      frequency: s.item.frequency,
      paid: s.paid === true,
      paidSource: s.paidSource,
      hasPattern: !!s.item.matchPattern,
      // Only a bill without a pattern needs the item itself: "Teach Arca the pattern".
      item: s.item.matchPattern ? null : s.item,
      overdue: s.overdue,
      isIncome: s.item.type === "income",
    }))
    .sort(byDueDate);

  // ── The next income: this month's when one is still to come, else the first one of
  //    the next financial month (salary often lands on the day the new month starts).
  let nextIncome: BudgetViewData["nextIncome"] = null;
  if (!ended) {
    const upcomingIncome = (list: typeof billStatuses) =>
      list
        .filter((s) => s.item.type === "income" && s.paid !== true && s.dueDate != null && s.dueDate >= today)
        .sort((a, z) => a.dueDate!.localeCompare(z.dueDate!))[0];
    const found = upcomingIncome(billStatuses) ?? upcomingIncome(await getBillStatuses(offsetFinancialMonth(month, 1), financialMonth, ["income"]));
    if (found) nextIncome = { name: found.item.friendlyName ?? found.item.name, amount: found.item.amount, date: found.dueDate! };
  }

  const monthOf = (date: string) => new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(`${date}T12:00:00`));
  const data: BudgetViewData = {
    hasBudget: overview.budget != null,
    period: overview.budget?.period ?? "monthly",
    hasOverall: (overview.budget?.amount ?? 0) > 0,
    figures,
    from: overview.from,
    to: overview.to,
    day,
    totalDays,
    daysLeft,
    elapsed,
    allocated: overview.allocated,
    // Spend in categories without a budget of their own (or a budgeted parent).
    unbudgeted: Math.max(0, overview.totalSpent - overview.budgetedSpent),
    strategy: overview.strategy,
    income: overview.income,
    actuals: {
      nodig: budgetData.byBudgetType.nodig ?? 0,
      willen: budgetData.byBudgetType.willen ?? 0,
      sparen: budgetData.byBudgetType.sparen ?? 0,
    },
    rows: rows.map((c) => ({
      categoryId: c.categoryId,
      name: c.categoryName,
      icon: c.icon,
      color: c.color,
      budget: c.budget!,
      spent: c.spent,
      child: c.parentCategoryId != null,
    })),
    suggestion,
    bills,
    billsMonth: month,
    // Named after the month the period ends in: 25 Sep – 24 Oct is the October budget.
    budgetMonthName: monthOf(overview.to),
    billsMonthName: monthOf(`${month}-15`),
    today,
    ended,
    nextIncome,
    needsReview: summarizeNeedsReview(needsReview),
    financialMonth,
    // The budget-month switcher: back up to HISTORY_MONTHS, forward up to now.
    periodNav: weekly
      ? null
      : {
          prev: month > oldest ? offsetFinancialMonth(month, -1) : null,
          next: isCurrent ? null : offsetFinancialMonth(month, 1) === current ? "" : offsetFinancialMonth(month, 1),
        },
  };

  return (
    // The provider wraps the whole page: the header carries the Edit budget button.
    <BudgetEditorProvider data={overview}>
      <BudgetView data={data} />
    </BudgetEditorProvider>
  );
}
