import { and, eq, gt, gte, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { billPayments, billSkips, categories, recurringItems, transactions } from "@/db/schema";
import type { RecurringItem } from "@/db/schema";
import { resolveRecurringIcon } from "@/lib/auto-brand";
import { dueKey, matchBillPayments, MATCH_CONTEXT_DAYS, paymentFitsItem } from "@/lib/bill-match";
import { financialMonthRangeByMonth, shiftDate, type FinancialMonthConfig } from "@/lib/date-range";
import { occurrencesBetween } from "@/lib/recurring-occurrence";
import { recurringItemPatterns } from "@/lib/recurring-patterns";

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
  /** "Skip October": this month's occurrence is left out (only listed with includeSkipped). */
  skipped: boolean;
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
 * only in its own months, a weekly or four-weekly one on each of its dates. Each date is
 * paid by its nearest payment, even one just across the month boundary, and each
 * transaction pays one date of one item (see lib/bill-match.ts). An auto-detected item
 * with nothing to place it in a month is not a bill and is left out.
 */
export async function getBillStatuses(
  month: string,
  financialMonth: number | FinancialMonthConfig = 1,
  /** Which recurrence types to report on. Defaults to outgoing money only — callers
   *  that show a full "what's still to come this month" list pass UPCOMING_TYPES. */
  types: readonly string[] = EXPENSE_TYPES,
  /** Skipped occurrences are left out of every total, so they are dropped unless the
   *  caller lists them itself (Upcoming shows them with an Undo). */
  options: { includeSkipped?: boolean } = {},
): Promise<BillStatus[]> {
  const { from, to } = financialMonthRangeByMonth(month, financialMonth);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [items, periodTx, payments, cats, skips] = await Promise.all([
    // Items that start later are switched off until then (syncRecurringLifecycle), but a
    // later month must still list them — a payment plan whose first part is next month.
    // They only stay in when they're actually due in this month (filtered below).
    db
      .select()
      .from(recurringItems)
      .where(or(eq(recurringItems.active, true), and(eq(recurringItems.dismissed, false), gt(recurringItems.startDate, todayStr)))),
    // Both directions: an income recurrence is "paid" (received) by an *income*
    // transaction, so restricting this to expenses would leave every salary showing as
    // still outstanding. The matcher checks the direction per item. Read around the
    // month too: a bill due on the 22nd may be collected after the next payday.
    db.select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      direction: transactions.direction,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
      recurringItemId: transactions.recurringItemId,
    })
      .from(transactions)
      .where(and(
        gte(transactions.date, shiftDate(from, -2 * MATCH_CONTEXT_DAYS)),
        lte(transactions.date, shiftDate(to, 2 * MATCH_CONTEXT_DAYS)),
      )),
    db.select().from(billPayments).where(eq(billPayments.month, month)),
    db.select({ id: categories.id, icon: categories.icon, color: categories.color }).from(categories),
    db.select({ recurringItemId: billSkips.recurringItemId }).from(billSkips).where(eq(billSkips.month, month)),
  ]);
  const skipped = new Set(skips.map((s) => s.recurringItemId));

  const paymentByItem = new Map(payments.map((p) => [p.recurringItemId, p]));
  const categoriesById = new Map(cats.map((c) => [c.id, { icon: c.icon, color: c.color }]));

  // Every loaded item competes for the payments, whatever `types` asks to report, so a
  // due date reads the same on every screen. Only transactions moving the way an item
  // does count, so a same-named refund can't mark a bill as paid.
  const matches = matchBillPayments(items, periodTx, from, to);
  /** Items without a date (daily, or no day set) are paid by any payment in the month
   *  that no dated item took. */
  const undatedPaid = new Set(
    items
      .filter((item) => periodTx.some((t) => t.date >= from && t.date <= to && !matches.used.has(t.id) && paymentFitsItem(t, item)))
      .map((item) => item.id),
  );

  /** The dates this item is due in the month; null when it has nothing to place it by. */
  function dueDatesOf(item: RecurringItem): (string | null)[] {
    if (item.frequency === "daily") return [null];
    if (item.dueDay == null && !item.startDate) return item.frequency === "monthly" && item.source !== "auto" ? [null] : [];
    // occurrencesBetween respects the item's own start and end date: changing a bill's
    // start date takes it off the list until that date arrives.
    return occurrencesBetween(item, from, to);
  }

  return items
    .filter((r) => types.includes(r.type) && (options.includeSkipped || !skipped.has(r.id)))
    .flatMap((item) => {
      const dates = dueDatesOf(item);
      // A not-yet-started item belongs only to the months it's due in; a quarterly or
      // yearly one only to its own months.
      if (dates.length === 0) return [];
      if (!item.active && dates[0] == null) return [];

      const manual = paymentByItem.get(item.id);
      const hasPattern = recurringItemPatterns(item).length > 0;
      const resolved = resolveRecurringIcon(item, categoriesById);

      return dates.map((dueDate): BillStatus => {
        const matched = dueDate == null ? undatedPaid.has(item.id) : matches.byDueDate.has(dueKey(item.id, dueDate));
        let paid: boolean | null;
        let paidSource: "match" | "manual" | null;
        if (manual) {
          paid = true;
          paidSource = "manual";
        } else if (matched) {
          paid = true;
          paidSource = "match";
        } else if (hasPattern) {
          // Has a pattern but no payment for this date — known unpaid.
          paid = false;
          paidSource = null;
        } else {
          // No pattern, no linked payment and no manual mark — paid status is unknown.
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
          overdue: overdue && !skipped.has(item.id),
          skipped: skipped.has(item.id),
        };
      });
    });
}
