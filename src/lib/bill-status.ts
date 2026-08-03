import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { billPayments, categories, recurringItems, transactions } from "@/db/schema";
import type { RecurringItem } from "@/db/schema";
import { resolveRecurringIcon } from "@/lib/auto-brand";
import { transactionMatchesRecurringItem } from "@/lib/recurring-match";
import { financialMonthRangeByMonth, getFinancialMonthStartDay, type FinancialMonthConfig } from "@/lib/date-range";

export type BillStatus = {
  item: RecurringItem;
  // Icon resolved from the item's brand/category (recurring items no longer carry
  // their own icon). iconBackground is the logo-style backdrop when applicable.
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
  dueDate: string | null; // YYYY-MM-DD, only for monthly items with a dueDay
  // null = unknown (no matchPattern and no manual mark) — distinct from false ("known unpaid"),
  // since only a known-unpaid item with a passed due date should ever render as overdue.
  paid: boolean | null;
  paidSource: "match" | "manual" | null;
  overdue: boolean;
};

/**
 * Resolve paid/overdue status for every active bill/subscription/debt in a financial
 * month. Manual marks (bill_payments) always win over the auto-match result — auto
 * status is cheaply recomputable for any month from the transactions table, so it's
 * not persisted; only the manual override needs a row.
 */
/** Recurrence types the "upcoming" surfaces treat as money leaving the account. */
const EXPENSE_TYPES = ["bill", "subscription", "debt", "savings"];

/** Everything with a schedule worth showing on an upcoming list — expenses plus the
 *  income you're still waiting on. Income deliberately stays out of the budget's bills
 *  calendar and the cash-flow forecast, which model it separately. */
export const UPCOMING_TYPES = [...EXPENSE_TYPES, "income"];

export async function getBillStatuses(
  month: string,
  financialMonth: number | FinancialMonthConfig = 1,
  /** Which recurrence types to report on. Defaults to outgoing money only — callers
   *  that show a full "what's still to come this month" list pass UPCOMING_TYPES. */
  types: readonly string[] = EXPENSE_TYPES,
): Promise<BillStatus[]> {
  const { from, to } = financialMonthRangeByMonth(month, financialMonth);
  const startDay = getFinancialMonthStartDay(month, financialMonth);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [items, periodTx, payments, cats] = await Promise.all([
    db.select().from(recurringItems).where(eq(recurringItems.active, true)),
    // Both directions: an income recurrence is "paid" (received) by an *income*
    // transaction, so restricting this to expenses would leave every salary showing as
    // still outstanding. The direction is carried through and checked per item below.
    db.select({ description: transactions.description, amount: transactions.amount, direction: transactions.direction })
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to))),
    db.select().from(billPayments).where(eq(billPayments.month, month)),
    db.select({ id: categories.id, icon: categories.icon, color: categories.color }).from(categories),
  ]);

  const paymentByItem = new Map(payments.map((p) => [p.recurringItemId, p]));
  const categoriesById = new Map(cats.map((c) => [c.id, { icon: c.icon, color: c.color }]));

  function findMatch(item: RecurringItem) {
    // Only consider transactions moving the way this recurrence does, so a same-named
    // refund can't mark a bill as paid (or an outgoing transfer mark a salary received).
    const wantedDirection = item.type === "income" ? "income" : "expense";
    return periodTx.some(
      (t) => t.direction === wantedDirection && transactionMatchesRecurringItem(t.description, t.amount, item),
    );
  }

  return items
    .filter((r) => types.includes(r.type))
    .map((item) => {
      const manual = paymentByItem.get(item.id);
      const autoMatch = item.matchPattern ? findMatch(item) : null;

      let paid: boolean | null;
      let paidSource: "match" | "manual" | null;
      if (manual) {
        paid = true;
        paidSource = "manual";
      } else if (autoMatch === true) {
        paid = true;
        paidSource = "match";
      } else if (item.matchPattern) {
        // Has a pattern but it didn't match this month — known unpaid.
        paid = false;
        paidSource = null;
      } else {
        // No pattern and no manual mark — paid status is simply unknown.
        paid = null;
        paidSource = null;
      }

      // Due-date mapping: dueDay maps into whichever calendar month keeps it inside
      // this financial month's [from, to) window (only meaningful for monthly items).
      let dueDate: string | null = null;
      if (item.frequency === "monthly" && item.dueDay != null) {
        const [fromYear, fromMonthNum] = from.split("-").map(Number);
        const calendarMonth = item.dueDay >= startDay ? fromMonthNum : (fromMonthNum % 12) + 1;
        const calendarYear = item.dueDay >= startDay ? fromYear : (fromMonthNum === 12 ? fromYear + 1 : fromYear);
        const lastDayOfMonth = new Date(calendarYear, calendarMonth, 0).getDate();
        const clampedDay = Math.min(item.dueDay, lastDayOfMonth);
        dueDate = `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
        // Respect the recurrence's own period: a due date that falls before the item's
        // start date (or after its end date) hasn't begun/has ended, so it isn't
        // upcoming. This makes changing a bill's start date remove it from the
        // upcoming list until that date arrives.
        if (item.startDate && dueDate < item.startDate) dueDate = null;
        if (dueDate && item.endDate && dueDate > item.endDate) dueDate = null;
      }

      const overdue = paid === false && dueDate != null && dueDate <= todayStr && todayStr >= from && todayStr <= to;

      const resolved = resolveRecurringIcon(item, categoriesById);

      return {
        item,
        icon: resolved.iconKey ?? null,
        iconColor: resolved.color,
        iconBackground: resolved.background,
        dueDate,
        paid,
        paidSource,
        overdue,
      };
    });
}
