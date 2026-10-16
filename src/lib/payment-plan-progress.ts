import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { billPayments, transactions } from "@/db/schema";
import type { RecurringItem } from "@/db/schema";
import { financialMonthForDate, type FinancialMonthConfig } from "@/lib/date-range";
import type { PlanProgress } from "@/lib/payment-plan";

/**
 * How far each payment plan is paid off. A part is paid in a financial month when a
 * transaction is linked to the plan that month (auto-match) or the month is marked paid
 * by hand (bill_payments) — the same two signals the bills calendar uses. A linked
 * transaction counts its real amount; a manual mark its amount, else one part.
 */
export async function getPlanProgress(
  items: readonly RecurringItem[],
  financialMonth: number | FinancialMonthConfig,
): Promise<Map<number, PlanProgress>> {
  const plans = items.filter((i) => i.type === "plan" && i.planTotal != null);
  const result = new Map<number, PlanProgress>();
  if (plans.length === 0) return result;
  const ids = plans.map((p) => p.id);

  const [linked, marks] = await Promise.all([
    db
      .select({
        recurringItemId: transactions.recurringItemId,
        date: transactions.date,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
      })
      .from(transactions)
      .where(and(isNotNull(transactions.recurringItemId), inArray(transactions.recurringItemId, ids), eq(transactions.direction, "expense"))),
    db.select().from(billPayments).where(inArray(billPayments.recurringItemId, ids)),
  ]);

  for (const plan of plans) {
    const months = new Set<string>();
    let paidAmount = 0;
    for (const tx of linked) {
      if (tx.recurringItemId !== plan.id) continue;
      months.add(financialMonthForDate(tx.date, financialMonth));
      paidAmount += tx.correctedAmount ?? tx.amount;
    }
    for (const mark of marks) {
      // A month that already has a linked payment is counted once, by what really left the account.
      if (mark.recurringItemId !== plan.id || months.has(mark.month)) continue;
      months.add(mark.month);
      paidAmount += mark.amount ?? plan.amount ?? 0;
    }
    const total = plan.planTotal ?? 0;
    paidAmount = Math.round(paidAmount * 100) / 100;
    result.set(plan.id, {
      paidParts: Math.min(months.size, plan.planParts ?? months.size),
      paidAmount,
      remaining: Math.max(0, Math.round((total - paidAmount) * 100) / 100),
    });
  }
  return result;
}
