import { db } from "@/db";
import { transactions } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { currentFinancialMonth, financialMonthRangeByMonth, type FinancialMonthConfig } from "@/lib/date-range";
import type { Goal } from "@/db/schema";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The date range an expense goal's linked-category spend resets over, based on its
// recurrence. "none" means all-time — no range filter.
function periodRangeForRecurrence(
  recurrence: string,
  financialMonth: FinancialMonthConfig,
): { from: string; to: string } | null {
  const now = new Date();
  if (recurrence === "monthly") {
    return financialMonthRangeByMonth(currentFinancialMonth(financialMonth), financialMonth);
  }
  if (recurrence === "yearly") {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  if (recurrence === "weekly") {
    const daysSinceMonday = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysSinceMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: toDateStr(monday), to: toDateStr(sunday) };
  }
  return null;
}

// Live "amount spent" for each expense goal — the sum of transactions in the goal's
// linked category (split-aware) over the period its recurrence resets on. Unlike
// savings goals, expense goals don't track contributions via transactions.goalId;
// their progress is always derived from the category's real spending.
export async function getExpenseGoalSpend(
  goalRows: Pick<Goal, "id" | "categoryId" | "recurrence">[],
  financialMonth: FinancialMonthConfig,
): Promise<Map<number, number>> {
  const expenseGoals = goalRows.filter((g) => g.categoryId != null);
  if (expenseGoals.length === 0) return new Map();

  // Group goals by their resolved date range so each distinct range is only queried once.
  const groups = new Map<string, { from: string | null; to: string | null; goalIds: number[] }>();
  for (const goal of expenseGoals) {
    const range = periodRangeForRecurrence(goal.recurrence, financialMonth);
    const key = range ? `${range.from}_${range.to}` : "all";
    const group = groups.get(key) ?? { from: range?.from ?? null, to: range?.to ?? null, goalIds: [] };
    group.goalIds.push(goal.id);
    groups.set(key, group);
  }

  const goalById = new Map(expenseGoals.map((g) => [g.id, g]));
  const spendByGoal = new Map<number, number>();

  for (const { from, to, goalIds } of groups.values()) {
    const categoryIds = [...new Set(goalIds.map((id) => goalById.get(id)!.categoryId!))];

    const rows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        categoryId: transactions.categoryId,
        isInternalTransfer: isInternalTransferExpr,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.direction, "expense"),
          from && to ? gte(transactions.date, from) : undefined,
          from && to ? lte(transactions.date, to) : undefined,
        ),
      );

    const splitRows = await getTransactionSplitRows(rows.map((r) => r.id));
    const splitMap = groupTransactionSplits(splitRows);
    const allocations = buildSplitAllocations(rows, splitMap);

    const spendByCategory = new Map<number, number>();
    for (const row of allocations) {
      if (row.isInternalTransfer || row.categoryId == null || !categoryIds.includes(row.categoryId)) continue;
      spendByCategory.set(row.categoryId, (spendByCategory.get(row.categoryId) ?? 0) + row.amount);
    }

    for (const goalId of goalIds) {
      const catId = goalById.get(goalId)!.categoryId!;
      spendByGoal.set(goalId, spendByCategory.get(catId) ?? 0);
    }
  }

  return spendByGoal;
}
