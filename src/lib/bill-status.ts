import { and, eq, gt, gte, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { billPayments, categories, recurringItems, transactions } from "@/db/schema";
import type { RecurringItem } from "@/db/schema";
import { resolveRecurringIcon } from "@/lib/auto-brand";
import { transactionMatchesRecurringItem } from "@/lib/recurring-match";
import { financialMonthRangeByMonth, type FinancialMonthConfig } from "@/lib/date-range";
import { occurrencesBetween } from "@/lib/recurring-occurrence";

export type BillStatus = {
  item: RecurringItem;
  // Icon resolved from the item's brand/category (recurring items no longer carry
  // their own icon). iconBackground is the logo-style backdrop when applicable.
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
  // YYYY-MM-DD. Null only for a hand-made monthly item with no day at all (or a daily one).
  dueDate: string | null;
  // null = unknown (no matchPattern and no manual mark) — distinct from false ("known unpaid"),
  // since only a known-unpaid item with a passed due date should ever render as overdue.
  paid: boolean | null;
  paidSource: "match" | "manual" | null;
  overdue: boolean;
};

/** Recurrence types the "upcoming" surfaces treat as money leaving the account. */
const EXPENSE_TYPES = ["bill", "subscription", "debt", "plan", "savings"];

/** Everything with a schedule worth showing on an upcoming list — expenses plus the
 *  income you're still waiting on. Income deliberately stays out of the budget's bills
 *  calendar and the cash-flow forecast, which model it separately. */
export const UPCOMING_TYPES = [...EXPENSE_TYPES, "income"];

/**
 * Resolve paid/overdue status for every active bill/subscription/debt in a financial
 * month. Manual marks (bill_payments) always win over the auto-match result — auto
 * status is cheaply recomputable for any month from the transactions table, so it's
 * not persisted; only the manual override needs a row.
 *
 * An item is listed once per date it is due in the month: a quarterly or yearly item
 * only in its own months, a weekly or four-weekly one on each of its dates (the first
 * N dates count as paid when N payments matched). An auto-detected item with nothing to
 * place it in a month is not a bill and is left out.
 */
export async function getBillStatuses(
  month: string,
  financialMonth: number | FinancialMonthConfig = 1,
  /** Which recurrence types to report on. Defaults to outgoing money only — callers
   *  that show a full "what's still to come this month" list pass UPCOMING_TYPES. */
  types: readonly string[] = EXPENSE_TYPES,
): Promise<BillStatus[]> {
  const { from, to } = financialMonthRangeByMonth(month, financialMonth);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [items, periodTx, payments, cats] = await Promise.all([
    // Items that start later are switched off until then (syncRecurringLifecycle), but a
    // later month must still list them — a payment plan whose first part is next month.
    // They only stay in when they're actually due in this month (filtered below).
    db
      .select()
      .from(recurringItems)
      .where(or(eq(recurringItems.active, true), and(eq(recurringItems.dismissed, false), gt(recurringItems.startDate, todayStr)))),
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

  function matchCount(item: RecurringItem) {
    // Only consider transactions moving the way this recurrence does, so a same-named
    // refund can't mark a bill as paid (or an outgoing transfer mark a salary received).
    const wantedDirection = item.type === "income" ? "income" : "expense";
    return periodTx.filter(
      (t) => t.direction === wantedDirection && transactionMatchesRecurringItem(t.description, t.amount, item),
    ).length;
  }

  /** The dates this item is due in the month; null when it has nothing to place it by. */
  function dueDatesOf(item: RecurringItem): (string | null)[] {
    if (item.frequency === "daily") return [null];
    if (item.dueDay == null && !item.startDate) return item.frequency === "monthly" && item.source !== "auto" ? [null] : [];
    // occurrencesBetween respects the item's own start and end date: changing a bill's
    // start date takes it off the list until that date arrives.
    return occurrencesBetween(item, from, to);
  }

  return items
    .filter((r) => types.includes(r.type))
    .flatMap((item) => {
      const dates = dueDatesOf(item);
      // A not-yet-started item belongs only to the months it's due in; a quarterly or
      // yearly one only to its own months.
      if (dates.length === 0) return [];
      if (!item.active && dates[0] == null) return [];

      const manual = paymentByItem.get(item.id);
      const matched = item.matchPattern ? matchCount(item) : 0;
      const resolved = resolveRecurringIcon(item, categoriesById);

      return dates.map((dueDate, i): BillStatus => {
        let paid: boolean | null;
        let paidSource: "match" | "manual" | null;
        if (manual) {
          paid = true;
          paidSource = "manual";
        } else if (matched > i) {
          paid = true;
          paidSource = "match";
        } else if (item.matchPattern) {
          // Has a pattern but no (further) match this month — known unpaid.
          paid = false;
          paidSource = null;
        } else {
          // No pattern and no manual mark — paid status is simply unknown.
          paid = null;
          paidSource = null;
        }

        // Overdue only once the due date has passed: a bill due today is simply due.
        const overdue = paid === false && dueDate != null && dueDate < todayStr && todayStr >= from && todayStr <= to;

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
    });
}
