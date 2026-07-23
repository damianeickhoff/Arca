import { db } from "@/db";
import { billPayments, debtRecurring, recurringItems, transactions } from "@/db/schema";
import type { RecurringItem } from "@/db/schema";
import { eq } from "drizzle-orm";
import { transactionMatchesRecurringItem } from "@/lib/recurring-match";
import { financialMonthRangeByMonth, type FinancialMonthConfig } from "@/lib/date-range";

/**
 * Debt payoff progress, derived from the paid-months history of the recurring bills a
 * debt is linked to (replacing the older "sum transactions in linked categories" model).
 *
 * A bill counts as paid in a given financial month using the same rule as the bills
 * calendar (see lib/bill-status.ts): a manual mark in bill_payments always wins,
 * otherwise the bill auto-matches when a transaction in that month matches its
 * matchPattern (and amount constraints). Each paid month contributes the marked
 * amount when there is one, else the bill's own amount.
 */

/** Inclusive list of YYYY-MM strings from `start` up to and including `end`. */
function monthRange(start: string, end: string): string[] {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const out: string[] = [];
  let y = sy;
  let m = sm;
  // Guard against a nonsense startMonth producing an unbounded loop.
  for (let i = 0; i < 600 && (y < ey || (y === ey && m <= em)); i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type DebtRecurringLinks = {
  /** debtId → linked recurring item ids */
  linkMap: Map<number, number[]>;
  /** recurring item id → item */
  itemsById: Map<number, RecurringItem>;
  /**
   * Paid per debt, from the linked bills' paid months between `startMonth` and
   * `endMonth` (defaults to the current month — pass an earlier one to reconstruct a
   * historical balance). `null` for a debt with no links — callers fall back to the
   * linear minimumPayment × monthsElapsed model.
   */
  paidFor: (debtId: number, startMonth: string, endMonth?: string) => number | null;
};

export async function getDebtRecurringLinks(
  financialMonth: FinancialMonthConfig,
): Promise<DebtRecurringLinks> {
  const links = await db.select().from(debtRecurring);

  const linkMap = new Map<number, number[]>();
  for (const row of links) {
    const list = linkMap.get(row.debtId) ?? [];
    list.push(row.recurringItemId);
    linkMap.set(row.debtId, list);
  }

  if (links.length === 0) {
    return { linkMap, itemsById: new Map(), paidFor: () => null };
  }

  const linkedIds = new Set(links.map((l) => l.recurringItemId));
  const [items, payments, expenseTx] = await Promise.all([
    db.select().from(recurringItems),
    db.select().from(billPayments),
    db.select({ date: transactions.date, description: transactions.description, amount: transactions.amount })
      .from(transactions)
      .where(eq(transactions.direction, "expense")),
  ]);

  const itemsById = new Map(items.filter((i) => linkedIds.has(i.id)).map((i) => [i.id, i]));

  // (itemId, month) → manual mark
  const paymentKey = (itemId: number, month: string) => `${itemId}:${month}`;
  const paymentByItemMonth = new Map(payments.map((p) => [paymentKey(p.recurringItemId, p.month), p]));

  function autoMatched(item: RecurringItem, from: string, to: string): boolean {
    return expenseTx.some(
      (t) => t.date >= from && t.date <= to && transactionMatchesRecurringItem(t.description, t.amount, item),
    );
  }

  function paidFor(debtId: number, startMonth: string, endMonth: string = currentMonth()): number | null {
    const ids = linkMap.get(debtId);
    if (!ids || ids.length === 0) return null;

    let total = 0;
    for (const month of monthRange(startMonth, endMonth)) {
      const { from, to } = financialMonthRangeByMonth(month, financialMonth);
      for (const id of ids) {
        const item = itemsById.get(id);
        if (!item) continue;
        const mark = paymentByItemMonth.get(paymentKey(id, month));
        if (mark) {
          total += mark.amount ?? item.amount ?? 0;
        } else if (autoMatched(item, from, to)) {
          total += item.amount ?? 0;
        }
      }
    }
    return total;
  }

  return { linkMap, itemsById, paidFor };
}
