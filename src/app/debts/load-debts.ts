import { db } from "@/db";
import { billPayments, categories, debtPayments, debts, recurringItems, transactions } from "@/db/schema";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { RecurringItem } from "@/db/schema";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { resolveRecurringIcon } from "@/lib/auto-brand";
import { getDebtRecurringLinks } from "@/lib/debt-recurring-paid";
import { getMonthlyFreeToSpend } from "@/lib/monthly-free-to-spend";
import { getBillStatuses } from "@/lib/bill-status";
import { billControl } from "@/lib/bill-groups";
import { transactionMatchesRecurringItem } from "@/lib/recurring-match";
import { currentFinancialMonth, financialMonthRangeByMonth, todayStr } from "@/lib/date-range";
import { computeDebt } from "./debt-shared";
import type { ComputedDebt, DebtMonthPayment, DebtsFreeToSpend, DebtsMonthPayments, DebtsPageData } from "./debt-shared";

/**
 * Every recurring item, for the debt form's "Linked recurring bills". Recurring bills
 * take their icon from their assigned category (brand logos belong to transactions, not
 * recurring items). Resolved here so the debt page — hero glyph and the linked bills —
 * always reflects the bill's current category icon instead of a stale stored value.
 * Also read by the shell's add menu (app/actions/quick-add.ts).
 */
export async function loadDebtBills(): Promise<RecurringItem[]> {
  const [billsRaw, cats] = await Promise.all([
    db.select().from(recurringItems).orderBy(asc(recurringItems.name)),
    db.select({ id: categories.id, icon: categories.icon, color: categories.color }).from(categories),
  ]);
  const categoriesById = new Map(cats.map((c) => [c.id, { icon: c.icon, color: c.color }]));
  return billsRaw.map((b) => {
    const resolved = resolveRecurringIcon(b, categoriesById);
    return { ...b, icon: resolved.iconKey ?? b.icon, iconColor: resolved.color ?? b.iconColor };
  });
}

// Loads + computes everything the Debts page needs: every debt with its payoff
// figures, split by direction, and the totals the summary tiles show.
export async function loadDebtsData(): Promise<DebtsPageData> {
  const [rows, bills, financialMonth] = await Promise.all([
    db.select().from(debts).orderBy(asc(debts.name)),
    loadDebtBills(),
    getFinancialMonthConfig(),
  ]);

  // Payoff progress comes from the paid-months history of each debt's linked
  // recurring bills (see lib/debt-recurring-paid.ts).
  const { linkMap, paidFor, extrasFor } = await getDebtRecurringLinks(financialMonth);
  const billMap = new Map(bills.map((b) => [b.id, b]));

  const computedAll = rows.map((debt) => {
    const linkedBillIds = linkMap.get(debt.id) ?? [];
    const linkedBills = linkedBillIds.map((id) => billMap.get(id)).filter((b): b is RecurringItem => !!b);
    return { debt, linkedBills, linkedBillIds, ...computeDebt(debt, paidFor(debt), extrasFor(debt.id)) };
  }).sort((a, b) => b.currentBalance - a.currentBalance);

  // Split by direction: the payoff model (progress, simulator, timeline) is about "owe"
  // debts; "owed" (money coming in) has its own tile and card.
  const computed = computedAll.filter((c) => (c.debt.direction ?? "owe") === "owe");
  const computedOwed = computedAll.filter((c) => c.debt.direction === "owed");

  const totalDebt = computed.reduce((s, c) => s + c.currentBalance, 0);
  const totalOwed = computedOwed.reduce((s, c) => s + c.currentBalance, 0);
  const totalMonthly = computed.reduce((s, c) => s + c.debt.minimumPayment, 0);

  return { bills, computed, computedOwed, totalDebt, totalOwed, totalMonthly };
}

/**
 * This month's free to spend, for the simulator: the plan the Forecast shows (see
 * getMonthlyFreeToSpend — recurring income minus bills, subscriptions and debt payments,
 * savings contributions and the budget), minus the minimums of open debts that no
 * recurring bill pays. Those are paid every month too, but only linked debts are in the
 * recurring items the plan reads.
 */
export async function loadDebtsFreeToSpend(computed: readonly ComputedDebt[]): Promise<DebtsFreeToSpend> {
  const plan = await getMonthlyFreeToSpend(await getFinancialMonthConfig());
  return { income: plan.income, free: plan.free - unlinkedDebtMinimums(computed) };
}

/** Monthly minimums of open debts (you owe) that no recurring bill pays. */
export function unlinkedDebtMinimums(computed: readonly ComputedDebt[]): number {
  return computed
    .filter((c) => (c.debt.direction ?? "owe") === "owe" && c.currentBalance > 0 && c.linkedBillIds.length === 0)
    .reduce((s, c) => s + Math.max(0, c.debt.minimumPayment), 0);
}

/** The same, loading the debts first — for the Forecast plan. */
export async function loadUnlinkedDebtMinimums(): Promise<number> {
  const { computed } = await loadDebtsData();
  return unlinkedDebtMinimums(computed);
}

/**
 * "This month's payments": each open debt's payment in the current financial month.
 * A debt paid by a linked recurring bill takes that bill's status (matched to a
 * transaction, marked by hand, or still to come), the same rule as the bills on Plan ›
 * Budget; a debt without one is "Paid?" until it is marked (debt_payments, kind
 * "minimum"). Also the extra payments logged so far this calendar year.
 */
export async function loadDebtsMonthPayments(computed: readonly ComputedDebt[]): Promise<DebtsMonthPayments> {
  const config = await getFinancialMonthConfig();
  const month = currentFinancialMonth(config);
  const { from, to } = financialMonthRangeByMonth(month, config);
  const today = todayStr();
  const open = computed.filter((c) => (c.debt.direction ?? "owe") === "owe" && c.currentBalance > 0);
  const billIds = [...new Set(open.flatMap((c) => c.linkedBillIds))];

  const [statuses, marks, minimumMarks, extraRows, monthTx] = await Promise.all([
    billIds.length ? getBillStatuses(month, config) : [],
    billIds.length
      ? db.select().from(billPayments).where(and(eq(billPayments.month, month), inArray(billPayments.recurringItemId, billIds)))
      : [],
    db
      .select()
      .from(debtPayments)
      .where(and(eq(debtPayments.kind, "minimum"), gte(debtPayments.date, from), lte(debtPayments.date, to))),
    db
      .select({ amount: debtPayments.amount })
      .from(debtPayments)
      .where(and(eq(debtPayments.kind, "extra"), gte(debtPayments.date, `${today.slice(0, 4)}-01-01`), lte(debtPayments.date, today))),
    billIds.length
      ? db
          .select({ date: transactions.date, description: transactions.description, amount: transactions.amount })
          .from(transactions)
          .where(and(eq(transactions.direction, "expense"), gte(transactions.date, from), lte(transactions.date, to)))
          .orderBy(asc(transactions.date))
      : [],
  ]);

  const payments = open.map((c): DebtMonthPayment => {
    const base = { debtId: c.debt.id, amount: c.debt.minimumPayment, month };
    if (c.linkedBillIds.length === 0) {
      const mark = minimumMarks.find((m) => m.debtId === c.debt.id);
      const day = c.debt.startDate ? Number(c.debt.startDate.slice(8, 10)) || null : null;
      return { ...base, kind: "unlinked", paid: !!mark, paidOn: mark?.date ?? null, source: mark ? "manual" : null, dueDate: null, dueDay: day, control: mark ? "paid" : "ask", billId: null, item: null };
    }
    // The first linked bill that is due this month.
    const status = statuses.find((s) => c.linkedBillIds.includes(s.item.id));
    if (!status) {
      return { ...base, kind: "notDue", paid: false, paidOn: null, source: null, dueDate: null, dueDay: null, control: null, billId: c.linkedBillIds[0], item: null };
    }
    const paid = status.paid === true;
    let paidOn: string | null = null;
    if (status.paidSource === "manual") {
      paidOn = marks.find((m) => m.recurringItemId === status.item.id)?.paidAt?.slice(0, 10) ?? null;
    } else if (status.paidSource === "match") {
      paidOn = monthTx.find((t) => transactionMatchesRecurringItem(t.description, t.amount, status.item))?.date ?? null;
    }
    const control = billControl(
      { paid, paidSource: status.paidSource, hasPattern: !!status.item.matchPattern, dueDate: status.dueDate },
      today,
    );
    return {
      ...base,
      amount: status.item.amount ?? c.debt.minimumPayment,
      kind: "bill",
      paid,
      paidOn,
      source: status.paidSource,
      dueDate: status.dueDate,
      dueDay: null,
      control,
      billId: status.item.id,
      // Only a bill without a pattern needs the item itself: "Teach Arca the pattern".
      item: status.item.matchPattern ? null : status.item,
    };
  });

  return { month, payments, extraThisYear: Math.round(extraRows.reduce((s, r) => s + r.amount, 0) * 100) / 100 };
}
