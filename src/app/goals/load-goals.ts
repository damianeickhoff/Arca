import { db } from "@/db";
import { banks, categories, goals, merchants, transactions } from "@/db/schema";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { Category, Goal } from "@/db/schema";
import { goalDeltaForTransaction } from "@/lib/goal-contributions";
import { getTransactionSplitTotal } from "@/lib/transaction-splits";
import { getCurrentMonthIncome } from "@/lib/income-summary";
import type { FinancialMonthConfig } from "@/lib/date-range";

export interface GoalContribution {
  transactionId: number;
  goalId: number;
  date: string;
  /** Signed: money put aside is positive, money taken back out negative. */
  amount: number;
  name: string;
  account: string | null;
}

export interface GoalsPageData {
  goals: Goal[];
  categories: Category[];
  /** The last 12 calendar months, oldest first: YYYY-MM and the net amount put aside. */
  months: { month: string; amount: number }[];
  /** Per goal, the same 12 months. */
  byGoal: Record<number, number[]>;
  recent: GoalContribution[];
  income: number;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Everything the Goals page shows: the active savings goals, and the contributions to
 * them — transactions linked to a goal (transactions.goalId), signed the same way
 * goal-contributions.ts applies them to a goal's currentAmount.
 */
export async function loadGoalsData(financialMonth: FinancialMonthConfig): Promise<GoalsPageData> {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const monthKeys = Array.from({ length: 12 }, (_, i) => monthKey(new Date(first.getFullYear(), first.getMonth() + i, 1)));

  const [allGoals, cats, income] = await Promise.all([
    db.select().from(goals).orderBy(asc(goals.name)),
    db.select().from(categories).orderBy(categories.group, categories.name),
    getCurrentMonthIncome(financialMonth),
  ]);
  const savings = allGoals.filter((g) => g.active && g.goalType === "savings");
  const ids = savings.map((g) => g.id);

  const rows =
    ids.length > 0
      ? await db
          .select({
            id: transactions.id,
            goalId: transactions.goalId,
            date: transactions.date,
            direction: transactions.direction,
            amount: transactions.amount,
            correctedAmount: transactions.correctedAmount,
            description: transactions.description,
            customName: transactions.customName,
            merchantName: merchants.name,
            bankName: banks.displayName,
            account: transactions.account,
          })
          .from(transactions)
          .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
          .leftJoin(banks, eq(banks.accountNumber, transactions.account))
          .where(and(inArray(transactions.goalId, ids), gte(transactions.date, `${monthKeys[0]}-01`)))
      : [];

  const contributions: GoalContribution[] = rows.map((r) => ({
    transactionId: r.id,
    goalId: r.goalId!,
    date: r.date,
    amount: goalDeltaForTransaction(r.direction, getTransactionSplitTotal(r.amount, r.correctedAmount)),
    name: r.customName ?? r.merchantName ?? r.description,
    account: r.bankName ?? r.account,
  }));

  const index = new Map(monthKeys.map((m, i) => [m, i]));
  const totals = monthKeys.map(() => 0);
  const byGoal: Record<number, number[]> = Object.fromEntries(ids.map((id) => [id, monthKeys.map(() => 0)]));
  for (const c of contributions) {
    const i = index.get(c.date.slice(0, 7));
    if (i == null) continue;
    totals[i] += c.amount;
    byGoal[c.goalId][i] += c.amount;
  }

  return {
    goals: savings,
    categories: cats,
    months: monthKeys.map((month, i) => ({ month, amount: Math.round(totals[i] * 100) / 100 })),
    byGoal,
    recent: [...contributions].sort((a, z) => z.date.localeCompare(a.date) || z.transactionId - a.transactionId).slice(0, 5),
    income,
  };
}
