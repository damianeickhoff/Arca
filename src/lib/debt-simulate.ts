import { monthlyRate } from "@/lib/debt-interest";

/**
 * Pay-off simulation across several debts at once, for the Debts page's payoff timeline
 * and its "What if I pay extra?" simulator.
 *
 * Every debt keeps paying its own minimum, exactly as computeDebt/payoffMonths model one
 * debt on its own (interest accrues first, the payment covers it, the last payment is
 * prorated, cents rounded every month) — so with no extra, each debt is paid off in the
 * same month its own row says. The extra goes on top, to one debt at a time, in the
 * order the caller passes (the Debts page's sort) — by default the highest interest rate
 * first (the "avalanche" order, which saves the most interest), ties to the smallest
 * balance. When that debt is cleared the extra moves on to the next.
 * Freed-up minimums are not rolled over, so extra = 0 is exactly the minimums timeline.
 */

export interface SimDebt {
  id: number;
  balance: number;
  /** The monthly minimum payment. */
  payment: number;
  /** Annual nominal percentage; null or 0 for none. */
  annualRate: number | null;
}

export interface PayoffSimulation {
  /** Payments until every debt is cleared, or null when that never happens within the cap. */
  months: number | null;
  /** Total outstanding balance at month 0 (now) and after each month's payments. */
  totals: number[];
  /** Interest paid over the simulated months. */
  interest: number;
  /** The order the extra is applied in (debt ids). */
  order: number[];
  /** Each debt's own balance at month 0 and after each month (same length as `totals`),
   *  the month it reaches zero — null when it never does within the cap — and the
   *  interest it accrued over the simulated months (together they add up to `interest`). */
  byDebt: { id: number; balances: number[]; months: number | null; interest: number }[];
}

/** Cents, like debt-interest.ts — a long schedule must not drift on floating-point dust. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function payoffOrder(debts: readonly SimDebt[]): number[] {
  return [...debts]
    .filter((d) => d.balance > 0)
    .sort((a, b) => (b.annualRate ?? 0) - (a.annualRate ?? 0) || a.balance - b.balance)
    .map((d) => d.id);
}

/**
 * @param preferred Debt ids in the order the extra goes to them. Unknown, repeated or
 *   paid-off ids are skipped; open debts missing from it follow in the default avalanche
 *   order. Omit for the avalanche order.
 */
export function simulatePayoff(
  debts: readonly SimDebt[],
  extra = 0,
  maxMonths = 600,
  preferred?: readonly number[],
): PayoffSimulation {
  const state = debts.map((d) => ({ id: d.id, balance: Math.max(0, d.balance), payment: d.payment, rate: monthlyRate(d.annualRate), interest: 0 }));
  const avalanche = payoffOrder(debts);
  const given = (preferred ?? []).filter((id, i, all) => avalanche.includes(id) && all.indexOf(id) === i);
  const order = [...given, ...avalanche.filter((id) => !given.includes(id))];
  const byId = new Map(state.map((s) => [s.id, s]));
  const totals = [round(state.reduce((s, d) => s + d.balance, 0))];
  const balances = new Map(state.map((d) => [d.id, [d.balance]]));
  let interest = 0;
  let month = 0;

  while (totals[totals.length - 1] > 0.005 && month < maxMonths) {
    month++;
    for (const d of state) {
      if (d.balance <= 0) continue;
      const i = d.rate > 0 ? round(d.balance * d.rate) : 0;
      const pay = round(Math.min(Math.max(0, d.payment), d.balance + i));
      interest = round(interest + i);
      d.interest = round(d.interest + i);
      d.balance = Math.max(0, round(d.balance + i - pay));
    }
    let pool = Math.max(0, extra);
    for (const id of order) {
      if (pool <= 0) break;
      const d = byId.get(id)!;
      if (d.balance <= 0) continue;
      const x = round(Math.min(pool, d.balance));
      d.balance = round(d.balance - x);
      pool = round(pool - x);
    }
    totals.push(round(state.reduce((s, d) => s + d.balance, 0)));
    for (const d of state) balances.get(d.id)!.push(d.balance);
  }

  const done = totals[totals.length - 1] <= 0.005;
  const byDebt = state.map((d) => {
    const series = balances.get(d.id)!;
    const zero = series.findIndex((b) => b <= 0.005);
    return { id: d.id, balances: series, months: zero === -1 ? null : zero, interest: d.interest };
  });
  return { months: done ? month : null, totals, interest, order, byDebt };
}

/**
 * The month each debt in a simulation reaches zero, by debt id — the debt cards' "Free
 * in …" line. null when it never does within the simulation's cap (the payment does not
 * cover the interest, or the cap ran out first). Debts that were not in the simulation
 * are simply absent.
 */
export function payoffMonthsById(sim: PayoffSimulation): Map<number, number | null> {
  return new Map(sim.byDebt.map((d) => [d.id, d.months]));
}
