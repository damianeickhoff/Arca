import { db } from "@/db";
import { categories, debts, recurringItems } from "@/db/schema";
import { asc } from "drizzle-orm";
import type { RecurringItem } from "@/db/schema";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { resolveRecurringIcon } from "@/lib/auto-brand";
import { getDebtRecurringLinks } from "@/lib/debt-recurring-paid";
import { getMonthlyFreeToSpend } from "@/lib/monthly-free-to-spend";
import { computeDebt } from "./debt-shared";
import type { ComputedDebt, DebtsFreeToSpend, DebtsPageData } from "./debt-shared";

// Loads + computes everything the Debts page needs: every debt with its payoff
// figures, split by direction, and the totals the summary tiles show.
export async function loadDebtsData(): Promise<DebtsPageData> {
  const [rows, billsRaw, cats, financialMonth] = await Promise.all([
    db.select().from(debts).orderBy(asc(debts.name)),
    db.select().from(recurringItems).orderBy(asc(recurringItems.name)),
    db.select({ id: categories.id, icon: categories.icon, color: categories.color }).from(categories),
    getFinancialMonthConfig(),
  ]);

  // Recurring bills take their icon from their assigned category (brand logos belong to
  // transactions, not recurring items). Resolve it here so the debt page — hero glyph
  // and the "Linked recurring bills" list — always reflects the bill's current
  // category icon instead of a stale value stored on the row.
  const categoriesById = new Map(cats.map((c) => [c.id, { icon: c.icon, color: c.color }]));
  const bills: RecurringItem[] = billsRaw.map((b) => {
    const resolved = resolveRecurringIcon(b, categoriesById);
    return { ...b, icon: resolved.iconKey ?? b.icon, iconColor: resolved.color ?? b.iconColor };
  });

  // Payoff progress comes from the paid-months history of each debt's linked
  // recurring bills (see lib/debt-recurring-paid.ts).
  const { linkMap, paidFor } = await getDebtRecurringLinks(financialMonth);
  const billMap = new Map(bills.map((b) => [b.id, b]));

  const computedAll = rows.map((debt) => {
    const linkedBillIds = linkMap.get(debt.id) ?? [];
    const linkedBills = linkedBillIds.map((id) => billMap.get(id)).filter((b): b is RecurringItem => !!b);
    return { debt, linkedBills, linkedBillIds, ...computeDebt(debt, paidFor(debt)) };
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
