import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { categories, debtRecurring, debts, recurringItems, transactions } from "@/db/schema";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { reimbursedAmountExpr } from "@/lib/reimbursed-amount";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { recurringPeriodStatus } from "@/lib/recurring-status";
import { toMonthly } from "@/lib/format";

/**
 * Where the budget's income figure came from: the household's regular income (the
 * recurring income items, salary and benefits) or — without any — what actually came in
 * during the financial month.
 */
export type BudgetIncomeSource = "recurring" | "received";

export interface BudgetIncome {
  /** Income per month. */
  income: number;
  source: BudgetIncomeSource;
}

type IncomeItem = {
  type: string;
  amount: number | null;
  frequency: string;
  active: boolean;
  paused: boolean;
  dismissed: boolean;
  isReimbursement: boolean;
  startDate: string | null;
  endDate: string | null;
};

/**
 * The regular monthly income: every recurring item of type "income" that is switched on
 * (active, not paused, not dismissed), inside its period on `today` (started, not ended)
 * and not a shared cost's payback, each averaged to a month.
 */
export function regularMonthlyIncome(items: IncomeItem[], today: string): number {
  return items
    .filter(
      (i) =>
        i.type === "income" &&
        i.active &&
        !i.paused &&
        !i.dismissed &&
        !i.isReimbursement &&
        recurringPeriodStatus(i, today) === "active",
    )
    .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
}

/** The default categories (categories.config_key) that hold salary and benefits. */
const SALARY_AND_BENEFITS = new Set(["Salary", "Benefits"]);

/**
 * The income items the budget is planned on: salary and benefits, i.e. the items in the
 * Salary or Benefits category (renamed or not) — not someone paying back their share of a
 * bill, a loan being repaid or pocket money from the grandparents. Someone who keeps
 * their income in categories of their own has none there, so then every item counts.
 */
export function salaryAndBenefits<T extends IncomeItem & { categoryKey: string | null }>(items: T[], today: string): T[] {
  const main = items.filter((i) => i.categoryKey != null && SALARY_AND_BENEFITS.has(i.categoryKey));
  return regularMonthlyIncome(main, today) > 0 ? main : items;
}

/** Income received over [from,to]: incoming transactions, minus reimbursements and
 *  transfers between own accounts, splits honoured. */
export async function receivedIncome(from: string, to: string): Promise<number> {
  const rows = await db.select({
    id: transactions.id,
    date: transactions.date,
    direction: transactions.direction,
    amount: transactions.amount,
    correctedAmount: transactions.correctedAmount,
    reimbursedAmount: reimbursedAmountExpr,
    categoryId: transactions.categoryId,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
  }).from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to), eq(transactions.direction, "income")));
  const splitRows = await getTransactionSplitRows(rows.map((r) => r.id));
  return buildSplitAllocations(rows, groupTransactionSplits(splitRows))
    .filter((row) => row.direction === "income" && !row.isReimbursement && !row.isInternalTransfer)
    .reduce((s, row) => s + row.amount, 0);
}

/**
 * The income the budget is planned on: the regular monthly salary and benefits (see
 * salaryAndBenefits, regularMonthlyIncome) as of `today`; without any, what came in
 * during the financial month [from,to] — so nothing changes for someone who hasn't set up
 * recurring income.
 */
export async function getBudgetIncome(range: { from: string; to: string }, today: string): Promise<BudgetIncome> {
  // An income item linked to a debt owed TO the household is someone paying back a loan:
  // money that stops once the debt is repaid, not salary or a benefit (the net-worth
  // forecast leaves it out of income for the same reason).
  const repayments = await db
    .select({ id: debtRecurring.recurringItemId })
    .from(debtRecurring)
    .innerJoin(debts, eq(debts.id, debtRecurring.debtId))
    .where(eq(debts.direction, "owed"));
  const repaymentIds = new Set(repayments.map((r) => r.id));
  const rows = await db.select({
    id: recurringItems.id,
    type: recurringItems.type,
    amount: recurringItems.amount,
    frequency: recurringItems.frequency,
    active: recurringItems.active,
    paused: recurringItems.paused,
    dismissed: recurringItems.dismissed,
    isReimbursement: recurringItems.isReimbursement,
    startDate: recurringItems.startDate,
    endDate: recurringItems.endDate,
    categoryKey: categories.configKey,
  }).from(recurringItems)
    .leftJoin(categories, eq(recurringItems.categoryId, categories.id))
    .where(eq(recurringItems.type, "income"));
  const items = rows.filter((r) => !repaymentIds.has(r.id));
  const regular = regularMonthlyIncome(salaryAndBenefits(items, today), today);
  if (regular > 0) return { income: regular, source: "recurring" };
  return { income: await receivedIncome(range.from, range.to), source: "received" };
}
