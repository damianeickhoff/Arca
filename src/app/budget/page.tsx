import { getLocale } from "next-intl/server";
import { PageShell } from "@/components/page-container";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth, financialMonthRangeByMonth } from "@/lib/date-range";
import { getBudgetOverview } from "@/lib/budget-overview";
import { getBudgetData } from "@/lib/budget-data";
import { getBillStatuses } from "@/lib/bill-status";
import { daysInclusive, nextDay, todayStr } from "@/app/_home/home-data";
import { BudgetEditorProvider } from "./budget-editor";
import { BudgetHeader, BudgetView, type BudgetBill, type BudgetSuggestion, type BudgetViewData } from "./budget-view";

/** Round up / down to a multiple of five euros — suggestions move tidy amounts. */
const up5 = (n: number) => Math.ceil(n / 5) * 5;
const down5 = (n: number) => Math.floor(n / 5) * 5;

export default async function BudgetPage() {
  const financialMonth = await getFinancialMonthConfig();
  const month = currentFinancialMonth(financialMonth);
  const range = financialMonthRangeByMonth(month, financialMonth);

  const [overview, budgetData, billStatuses, locale] = await Promise.all([
    getBudgetOverview(financialMonth),
    getBudgetData(month, financialMonth),
    getBillStatuses(month, financialMonth),
    getLocale(),
  ]);

  const today = todayStr();

  // ── The gauge: the overall budget when one is set, else the sum of the category
  //    budgets — the same rule as Home's safe-to-spend card.
  const hasOverall = (overview.budget?.amount ?? 0) > 0;
  const limit = hasOverall ? overview.budget!.amount : overview.allocated;
  const spent = hasOverall ? overview.totalSpent : overview.budgetedSpent;
  const totalDays = Math.max(1, daysInclusive(overview.from, overview.to));
  const daysLeft = Math.max(1, daysInclusive(today < overview.from ? overview.from : today, overview.to));
  const elapsed = (totalDays - daysLeft + 1) / totalDays;
  const used = limit > 0 ? spent / limit : 0;
  const pace = limit > 0 ? (used > 1 ? "over" : used > elapsed + 0.05 ? "fast" : "onPace") : null;

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
  const hot = rows
    .map((c) => ({ c, pct: (c.spent / c.budget!) * 100 }))
    .filter((x) => x.pct >= 90)
    .sort((a, z) => z.pct - a.pct)[0];
  if (hot) {
    const projected = Math.max(hot.c.spent, hot.c.spent / Math.max(elapsed, 0.1));
    const need = up5(Math.max(5, projected - hot.c.budget!));
    const donor = rows
      .filter((c) => c.categoryId !== hot.c.categoryId)
      .map((c) => {
        // What the donor would still have spare at the end of the period at its own pace.
        const projectedDonor = Math.max(c.spent, c.spent / Math.max(elapsed, 0.1));
        return { c, spare: down5(Math.min(c.budget! - c.spent, c.budget! - projectedDonor)) };
      })
      .filter((d) => d.spare >= 5)
      .sort((a, z) => z.spare - a.spare)[0];
    suggestion = {
      categoryId: hot.c.categoryId,
      name: hot.c.categoryName,
      pct: Math.round(hot.pct),
      over: Math.max(0, hot.c.spent - hot.c.budget!),
      daysLeft,
      move: donor ? { fromId: donor.c.categoryId, fromName: donor.c.categoryName, amount: Math.min(need, donor.spare) } : null,
    };
  }

  // ── Bills this financial month, soonest first, date-less ones last.
  const bills: BudgetBill[] = billStatuses
    .map((s) => ({
      id: s.item.id,
      name: s.item.friendlyName ?? s.item.name,
      amount: s.item.amount,
      icon: s.icon,
      iconColor: s.iconColor,
      dueDate: s.dueDate,
      paid: s.paid === true,
      paidByMatch: s.paidSource === "match",
      overdue: s.overdue,
    }))
    .sort((a, z) => (a.dueDate ?? "9999").localeCompare(z.dueDate ?? "9999") || a.name.localeCompare(z.name));

  const resetDate = nextDay(overview.to);
  const strategy = overview.strategy;
  const data: BudgetViewData = {
    hasBudget: overview.budget != null,
    period: overview.budget?.period ?? "monthly",
    hasOverall,
    limit,
    spent,
    pace,
    daysLeft,
    allocated: overview.allocated,
    resetDay: Number(resetDate.slice(8, 10)),
    strategy,
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
      budgetType: c.budgetType,
      budget: c.budget!,
      spent: c.spent,
      child: c.parentCategoryId != null,
    })),
    suggestion,
    bills,
    billsMonth: month,
    billsRange: range,
    monthName: new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(`${month}-15T12:00:00`)),
    today,
  };

  return (
    // The provider wraps the header too: the phone header carries the Edit budget button.
    <BudgetEditorProvider data={overview}>
      <PageShell header={<BudgetHeader period={data.period} hasBudget={data.hasBudget} resetDay={data.resetDay} strategy={strategy} />}>
        <BudgetView data={data} />
      </PageShell>
    </BudgetEditorProvider>
  );
}
