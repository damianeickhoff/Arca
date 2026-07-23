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
export async function getBillStatuses(
  month: string,
  financialMonth: number | FinancialMonthConfig = 1,
): Promise<BillStatus[]> {
  const { from, to } = financialMonthRangeByMonth(month, financialMonth);
  const startDay = getFinancialMonthStartDay(month, financialMonth);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [items, periodTx, payments, cats] = await Promise.all([
    db.select().from(recurringItems).where(eq(recurringItems.active, true)),
    db.select({ description: transactions.description, amount: transactions.amount })
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to), eq(transactions.direction, "expense"))),
    db.select().from(billPayments).where(eq(billPayments.month, month)),
    db.select({ id: categories.id, icon: categories.icon, color: categories.color }).from(categories),
  ]);

  const paymentByItem = new Map(payments.map((p) => [p.recurringItemId, p]));
  const categoriesById = new Map(cats.map((c) => [c.id, { icon: c.icon, color: c.color }]));

  function findMatch(item: RecurringItem) {
    return periodTx.some((t) => transactionMatchesRecurringItem(t.description, t.amount, item));
  }

  return items
    .filter((r) => r.type === "bill" || r.type === "subscription" || r.type === "debt")
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
