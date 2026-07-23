import { db } from "@/db";
import { debts } from "@/db/schema";
import type { Debt } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getDebtRecurringLinks } from "@/lib/debt-recurring-paid";

export function debtMonthsElapsed(startMonth: string): number {
  const [sy, sm] = startMonth.split("-").map(Number);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - sy) * 12 + (now.getMonth() + 1 - sm));
}

export type DebtSummary = {
  totalBalance: number; // money YOU owe (direction 'owe') — the liability side of net worth
  totalOwed: number;    // money owed TO you (direction 'owed') — an asset, added to net worth (not subtracted)
  totalStarting: number;
  totalPaid: number;
  paidPct: number;
  debts: { debt: Debt; amountPaid: number; currentBalance: number }[];
};

export async function getDebtSummary(): Promise<DebtSummary | null> {
  const [debtRows, financialMonth] = await Promise.all([
    db.select().from(debts).orderBy(asc(debts.name)),
    getFinancialMonthConfig(),
  ]);

  if (debtRows.length === 0) return null;

  // Progress comes from the paid-months history of each debt's linked recurring bills;
  // debts with no links fall back to the linear minimumPayment × monthsElapsed model.
  const { paidFor } = await getDebtRecurringLinks(financialMonth);

  const computed = debtRows.map((debt: Debt) => {
    const billPaid = paidFor(debt.id, debt.startMonth);
    const amountPaid = billPaid !== null
      ? Math.min(billPaid, debt.startingBalance)
      : Math.min(debtMonthsElapsed(debt.startMonth) * debt.minimumPayment, debt.startingBalance);
    const currentBalance = Math.max(debt.startingBalance - amountPaid, 0);
    return { debt, amountPaid, currentBalance };
  });

  // Split by direction: money you owe is a liability (totalBalance), money owed to you
  // is an asset (totalOwed). They must never be lumped together — doing so subtracts
  // receivables from net worth instead of adding them.
  const oweComputed = computed.filter((c) => c.debt.direction !== "owed");
  const owedComputed = computed.filter((c) => c.debt.direction === "owed");

  const totalBalance = oweComputed.reduce((s, c) => s + c.currentBalance, 0);
  const totalOwed = owedComputed.reduce((s, c) => s + c.currentBalance, 0);
  // Payoff-progress metrics describe *your* debts only.
  const totalStarting = oweComputed.reduce((s, c) => s + c.debt.startingBalance, 0);
  const totalPaid = oweComputed.reduce((s, c) => s + c.amountPaid, 0);
  const paidPct = totalStarting > 0 ? Math.round((totalPaid / totalStarting) * 100) : 0;

  return { totalBalance, totalOwed, totalStarting, totalPaid, paidPct, debts: computed };
}
