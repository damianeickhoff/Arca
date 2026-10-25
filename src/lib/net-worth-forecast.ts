import { loadDebtsData, unlinkedDebtMinimums } from "@/app/debts/load-debts";
import type { ComputedDebt } from "@/app/debts/debt-shared";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { monthlyRate } from "@/lib/debt-interest";
import { getMonthlyFreeToSpend } from "@/lib/monthly-free-to-spend";

export type ForecastPoint = { date: string; netWorth: number };

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00`);
  const next = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/** A debt as the projection carries it month by month. */
export interface ProjectedDebt {
  balance: number;
  payment: number;
  /** Annual interest rate in percent (debts you owe). */
  interestRate?: number | null;
}

/**
 * Net worth month by month, the one rule the Net worth tab and the Forecast plan share:
 * what comes in minus what goes out (`cashChange`, the plan's income minus its spending),
 * plus the principal repaid on debts you owe — a debt payment leaves the account but the
 * debt shrinks by the same amount, so only its interest is a loss. Money put into savings
 * stays yours, so the caller leaves it out of the spending. A repayment collected on a
 * debt owed to you turns what you are owed into cash, so it changes nothing: it is taken
 * back out when `cashChange` counts it as income (`owedInIncome`).
 */
export function projectNetWorth(input: {
  start: number;
  months: number;
  /** Income minus spending in month i (0 = the first month ahead). */
  cashChange: (i: number) => number;
  owe: readonly ProjectedDebt[];
  /** Debts owed to you whose repayment is part of the income in `cashChange`. */
  owedInIncome: readonly ProjectedDebt[];
}): number[] {
  const owe = input.owe.map((d) => ({ ...d, rate: monthlyRate(d.interestRate) }));
  const owed = input.owedInIncome.map((d) => ({ ...d }));
  const out: number[] = [];
  let netWorth = input.start;
  for (let i = 0; i < input.months; i++) {
    let change = input.cashChange(i);
    for (const d of owe) {
      if (d.balance <= 0 || d.payment <= 0) continue;
      const interest = d.balance * d.rate;
      const principal = Math.min(d.balance, Math.max(0, d.payment - interest));
      d.balance -= principal;
      change += principal;
    }
    for (const d of owed) {
      const collected = Math.min(d.balance, Math.max(0, d.payment));
      d.balance -= collected;
      change -= collected;
    }
    netWorth += change;
    out.push(netWorth);
  }
  return out;
}

/** The debts the projection carries, from the Debts page's own figures. */
export function projectedDebts(computed: readonly ComputedDebt[], owed: readonly ComputedDebt[]) {
  return {
    owe: computed.filter((c) => c.currentBalance > 0).map((c) => ({ balance: c.currentBalance, payment: c.debt.minimumPayment, interestRate: c.debt.interestRate })),
    // Only a debt owed to you that a recurring income item pays back is in the income.
    owedInIncome: owed.filter((c) => c.currentBalance > 0 && c.linkedBillIds.length > 0).map((c) => ({ balance: c.currentBalance, payment: c.debt.minimumPayment })),
  };
}

/**
 * The Net worth tab's projection: this month's plan (getMonthlyFreeToSpend — recurring
 * income, the bills the budget doesn't cover, the budget, the debt minimums no bill pays)
 * carried forward with projectNetWorth, so it agrees with the Forecast plan.
 */
export async function getNetWorthForecast(
  currentNetWorth: number,
  lastActualDate: string,
  monthsAhead = 6,
): Promise<ForecastPoint[]> {
  const [plan, debts] = await Promise.all([getMonthlyFreeToSpend(await getFinancialMonthConfig()), loadDebtsData()]);
  if (plan.income <= 0) return [];
  // Spending is the bills outside the budget, the budget and the minimums no bill pays
  // (an overall budget already covers those); savings are not spending.
  const unlinked = plan.budgetSource === "overall" ? 0 : unlinkedDebtMinimums(debts.computed);
  const cash = plan.income - plan.recurring - plan.budget - unlinked;
  const values = projectNetWorth({ start: currentNetWorth, months: monthsAhead, cashChange: () => cash, ...projectedDebts(debts.computed, debts.computedOwed) });
  return values.map((netWorth, i) => ({ date: addMonths(lastActualDate, i + 1), netWorth: Math.round(netWorth) }));
}
