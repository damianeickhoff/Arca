import { db } from "@/db";
import { billPayments, debtPayments, debtRecurring, recurringItems, transactions } from "@/db/schema";
import type { RecurringItem } from "@/db/schema";
import { transactionMatchesRecurringItem } from "@/lib/recurring-match";
import { eq } from "drizzle-orm";
import { debtBalanceDate, scheduledPaymentMonths, type DebtExtraPayment, type DebtProgress } from "@/app/debts/debt-shared";
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
   * Paid per debt, from the linked bills' paid months between the debt's start month and
   * `endMonth` (defaults to the current month — pass an earlier one to reconstruct a
   * historical balance). `null` for a debt with no links — callers fall back to the
   * linear minimumPayment × monthsElapsed model.
   *
   * Takes the debt rather than an id because the direction decides which way the
   * matching transactions move: a debt you owe is paid off by expenses, one you are
   * owed by the income landing back in your account.
   */
  paidFor: (
    debt: {
      id: number;
      startMonth: string;
      startDate?: string | null;
      /** Payments before this are already reflected in the debt's starting balance. */
      balanceDate?: string | null;
      direction?: string | null;
    },
    endMonth?: string,
  ) => DebtProgress | null;
  /** The extra and lump-sum payments logged on a debt (debt_payments, kind "extra"),
   *  oldest first. Pass them to computeDebt / debtBalance with the progress. */
  extrasFor: (debtId: number) => DebtExtraPayment[];
};

/** Re-exported so callers don't need both modules for the one type. */
export type { DebtProgress };

export async function getDebtRecurringLinks(
  financialMonth: FinancialMonthConfig,
): Promise<DebtRecurringLinks> {
  const [links, extraRows] = await Promise.all([
    db.select().from(debtRecurring),
    db
      .select({ debtId: debtPayments.debtId, date: debtPayments.date, amount: debtPayments.amount })
      .from(debtPayments)
      .where(eq(debtPayments.kind, "extra"))
      .orderBy(debtPayments.date),
  ]);
  const extrasByDebt = new Map<number, DebtExtraPayment[]>();
  for (const row of extraRows) {
    const list = extrasByDebt.get(row.debtId) ?? [];
    list.push({ date: row.date, amount: row.amount });
    extrasByDebt.set(row.debtId, list);
  }
  const extrasFor = (debtId: number) => extrasByDebt.get(debtId) ?? [];

  const linkMap = new Map<number, number[]>();
  for (const row of links) {
    const list = linkMap.get(row.debtId) ?? [];
    list.push(row.recurringItemId);
    linkMap.set(row.debtId, list);
  }

  if (links.length === 0) {
    return { linkMap, itemsById: new Map(), paidFor: () => null, extrasFor };
  }

  const linkedIds = new Set(links.map((l) => l.recurringItemId));
  // Both directions, filtered per debt below. Restricting this to expenses (as it once
  // did) silently broke every "owed" debt: money lent out is repaid by *income*
  // transactions, so nothing ever matched, paidFor returned 0 for a debt that does have
  // links — never null — and the linear fallback could not kick in either. The debt then
  // showed 0% received and a payoff date a full elapsed-term too late.
  const [items, payments, allTx] = await Promise.all([
    db.select().from(recurringItems),
    db.select().from(billPayments),
    db.select({
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      direction: transactions.direction,
    }).from(transactions),
  ]);

  const itemsById = new Map(items.filter((i) => linkedIds.has(i.id)).map((i) => [i.id, i]));

  // (itemId, month) → manual mark
  const paymentKey = (itemId: number, month: string) => `${itemId}:${month}`;
  const paymentByItemMonth = new Map(payments.map((p) => [paymentKey(p.recurringItemId, p.month), p]));

  function autoMatched(item: RecurringItem, from: string, to: string, direction: string): boolean {
    return allTx.some(
      (t) =>
        t.direction === direction &&
        t.date >= from &&
        t.date <= to &&
        transactionMatchesRecurringItem(t.description, t.amount, item),
    );
  }

  function paidFor(
    debt: {
      id: number;
      startMonth: string;
      startDate?: string | null;
      /** Payments before this are already reflected in the debt's starting balance. */
      balanceDate?: string | null;
      direction?: string | null;
    },
    endMonth: string = currentMonth(),
  ): DebtProgress | null {
    const ids = linkMap.get(debt.id);
    if (!ids || ids.length === 0) return null;

    // Same rule as the bills calendar (lib/bill-status.ts): an income recurrence is
    // settled by an income transaction. A debt in the "owed" direction is repaid *to*
    // you, so its linked bills settle on income however they are typed.
    const owed = debt.direction === "owed";

    let total = 0;
    // One entry per month, including the ones where nothing was paid — an interest-
    // bearing debt still accrues on a missed month, so the gaps have to be in the list
    // rather than collapsed out of it (see debtBalance in app/debts/debt-shared.ts).
    const byMonth: { month: string; amount: number }[] = [];
    // Only the payments that come *after* the balance date — anything earlier is already
    // baked into startingBalance. Shares scheduledPaymentMonths with the unlinked model,
    // so linking a bill can no longer shift the payoff date by a month on its own.
    for (const month of scheduledPaymentMonths(debtBalanceDate(debt), `${endMonth}-01`)) {
      const { from, to } = financialMonthRangeByMonth(month, financialMonth);
      let paidThisMonth = 0;
      for (const id of ids) {
        const item = itemsById.get(id);
        if (!item) continue;
        const wantedDirection = owed || item.type === "income" ? "income" : "expense";
        const mark = paymentByItemMonth.get(paymentKey(id, month));
        if (mark) {
          paidThisMonth += mark.amount ?? item.amount ?? 0;
        } else if (autoMatched(item, from, to, wantedDirection)) {
          paidThisMonth += item.amount ?? 0;
        }
      }
      byMonth.push({ month, amount: paidThisMonth });
      total += paidThisMonth;
    }
    return { total, byMonth };
  }

  return { linkMap, itemsById, paidFor, extrasFor };
}
