import { monthlyRate } from "@/lib/debt-interest";

/**
 * Pay-off simulation across several debts at once, for the Debts page's simulator, its
 * "Where the extra goes" plan and the payoff timeline.
 *
 * Every debt keeps paying its own minimum, exactly as computeDebt/payoffMonths model one
 * debt on its own (interest accrues first on the balance before the month's payment, the
 * payment covers it, the last payment is prorated, cents rounded every month) — so with
 * no extra, each debt is paid off in the same month its own row says. The extra goes on
 * top, in one of two ways:
 *
 * - In order (the default): to one debt at a time, in the order the caller passes (the
 *   Debts page's "Quickest win first" or "Highest interest first"; by default the highest
 *   interest rate first, ties to the smallest balance). Whatever a debt cannot absorb
 *   because its balance is smaller than what it is given flows on to the next open debt
 *   in the SAME month, cascading down the list.
 * - `spread`: divided in equal amounts over every open debt each month (spare cents to
 *   the first in the order). A debt that would get more than it still owes passes the
 *   rest on, divided equally again over the debts still open, until nothing is left or
 *   everything is paid.
 *
 * With `rollover` (the page turns it on whenever there is an extra) a paid-off debt's
 * whole payment joins the extra: what its prorated last payment leaves over in its final
 * month, and its whole minimum from the month after (the snowball), so the month's total
 * stays the same until everything is paid. Without it, freed-up minimums are kept, so
 * extra = 0 is exactly the minimums timeline either way.
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
  /** The order the extra is applied in (debt ids); with `spread`, the order spare cents go in. */
  order: number[];
  /** Whether a paid-off debt's payment rolled on to the next one. */
  rollover: boolean;
  /** Whether the extra was divided equally over the open debts instead of going in order. */
  spread: boolean;
  /** Each debt's own balance at month 0 and after each month (same length as `totals`),
   *  the month it reaches zero — null when it never does within the cap — the interest
   *  it accrued over the simulated months (together they add up to `interest`), and what
   *  was paid on it each month (index 0 is now, always 0; the extra included). */
  byDebt: { id: number; balances: number[]; months: number | null; interest: number; payments: number[]; interestByMonth: number[] }[];
}

/** Cents, like debt-interest.ts — a long schedule must not drift on floating-point dust. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `amount` in `n` equal parts to the cent; the spare cents go to the first parts. */
function splitEqually(amount: number, n: number): number[] {
  const cents = Math.round(amount * 100);
  const each = Math.floor(cents / n);
  const spare = cents - each * n;
  return Array.from({ length: n }, (_, i) => (each + (i < spare ? 1 : 0)) / 100);
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
 * @param options.rollover Roll a paid-off debt's whole payment on to the others.
 * @param options.spread Divide the extra equally over the open debts instead of in order.
 */
export function simulatePayoff(
  debts: readonly SimDebt[],
  extra = 0,
  maxMonths = 600,
  preferred?: readonly number[],
  options: { rollover?: boolean; spread?: boolean } = {},
): PayoffSimulation {
  const rollover = options.rollover ?? false;
  const spread = options.spread ?? false;
  const state = debts.map((d) => ({
    id: d.id,
    balance: Math.max(0, d.balance),
    payment: Math.max(0, d.payment),
    rate: monthlyRate(d.annualRate),
    interest: 0,
    open: d.balance > 0,
  }));
  const avalanche = payoffOrder(debts);
  const given = (preferred ?? []).filter((id, i, all) => avalanche.includes(id) && all.indexOf(id) === i);
  const order = [...given, ...avalanche.filter((id) => !given.includes(id))];
  const byId = new Map(state.map((s) => [s.id, s]));
  const ordered = order.map((id) => byId.get(id)!);
  const totals = [round(state.reduce((s, d) => s + d.balance, 0))];
  const balances = new Map(state.map((d) => [d.id, [d.balance]]));
  const payments = new Map(state.map((d) => [d.id, [0]]));
  const interests = new Map(state.map((d) => [d.id, [0]]));
  let interest = 0;
  let month = 0;

  while (totals[totals.length - 1] > 0.005 && month < maxMonths) {
    month++;
    let pool = Math.max(0, extra);
    const paid = new Map<number, number>();
    const pay = (d: (typeof state)[number], amount: number) => {
      d.balance = Math.max(0, round(d.balance - amount));
      paid.set(d.id, round((paid.get(d.id) ?? 0) + amount));
    };

    // Interest on the balance before this month's payment, then each debt's own minimum.
    for (const d of state) {
      if (d.balance <= 0) {
        // Cleared in an earlier month: its minimum is free for the others.
        if (rollover && d.open) pool = round(pool + d.payment);
        interests.get(d.id)!.push(0);
        continue;
      }
      const i = d.rate > 0 ? round(d.balance * d.rate) : 0;
      const minimum = round(Math.min(d.payment, d.balance + i));
      interest = round(interest + i);
      d.interest = round(d.interest + i);
      d.balance = round(d.balance + i);
      pay(d, minimum);
      interests.get(d.id)!.push(i);
      // A prorated last payment leaves part of the minimum over.
      if (rollover && minimum < d.payment) pool = round(pool + d.payment - minimum);
    }

    if (spread) {
      // Equal shares over the open debts; what a debt can't absorb is shared out again.
      let open = ordered.filter((d) => d.balance > 0);
      while (pool > 0.005 && open.length > 0) {
        const shares = splitEqually(pool, open.length);
        pool = 0;
        open.forEach((d, i) => {
          const x = round(Math.min(shares[i], d.balance));
          pay(d, x);
          pool = round(pool + shares[i] - x);
        });
        open = open.filter((d) => d.balance > 0);
      }
    } else {
      // The whole pool to the first open debt; what it can't absorb flows on this month.
      for (const d of ordered) {
        if (pool <= 0) break;
        if (d.balance <= 0) continue;
        const x = round(Math.min(pool, d.balance));
        pay(d, x);
        pool = round(pool - x);
      }
    }

    totals.push(round(state.reduce((s, d) => s + d.balance, 0)));
    for (const d of state) {
      balances.get(d.id)!.push(d.balance);
      payments.get(d.id)!.push(paid.get(d.id) ?? 0);
    }
  }

  const done = totals[totals.length - 1] <= 0.005;
  const byDebt = state.map((d) => {
    const series = balances.get(d.id)!;
    const zero = series.findIndex((b) => b <= 0.005);
    return {
      id: d.id,
      balances: series,
      months: zero === -1 ? null : zero,
      interest: d.interest,
      payments: payments.get(d.id)!,
      interestByMonth: interests.get(d.id)!,
    };
  });
  return { months: done ? month : null, totals, interest, order, rollover, spread, byDebt };
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

/** One row of the "Where the extra goes, month by month" plan. */
export interface PayoffPlanRow {
  id: number;
  /** Its own minimum. */
  minimum: number;
  /** What it gets on top of the minimum this month (the first simulated month): the
   *  extra, what a smaller debt before it could not absorb, or its equal share. */
  extraNow: number;
  /** What is paid on it this month: the minimum (or the prorated last payment) plus the extra. */
  pay: number;
  /** The month it is paid off; null when never within the simulation. */
  months: number | null;
  /** From `month` on the payments of the debts before it have rolled on to it: it pays
   *  `pay` a month from then until it is paid off. Null when its payment never steps up
   *  before its last month (and always with `spread`). */
  step: { month: number; pay: number } | null;
  /** The debt its payment moves on to once it is paid off (the first one still open
   *  after its last month); null for none. With `spread` its share is divided over all
   *  the debts still open instead, and this is just the first of them. */
  rollsTo: number | null;
  /** What moves on a month once it is paid off: its full payment by then. */
  rolls: number;
}

/**
 * The simulation as a plan, one row per open debt in the order the extra goes: what it
 * gets now, when the payments of the debts before it roll on to it (and how much it
 * then pays a month) and where its own payment goes once it is paid off. Everything is
 * read from the simulation's own month-by-month payments, so the in-month overflow and
 * the snowball show exactly as simulated. Run with `rollover` for anything to roll on;
 * without it the rows only say what each debt gets now and when it is paid off.
 */
export function buildPayoffPlan(debts: readonly SimDebt[], sim: PayoffSimulation, extra: number): PayoffPlanRow[] {
  const debtById = new Map(debts.map((d) => [d.id, d]));
  const simById = new Map(sim.byDebt.map((d) => [d.id, d]));
  const monthsOf = (id: number) => simById.get(id)?.months ?? null;
  const firstOpen = sim.order.find((id) => (simById.get(id)?.balances[0] ?? 0) > 0);

  return sim.order.flatMap((id): PayoffPlanRow[] => {
    const s = simById.get(id);
    if (!s) return [];
    const minimum = Math.max(0, debtById.get(id)?.payment ?? 0);
    const pay = round(s.payments[1] ?? 0);
    const extraNow = Math.max(0, round(pay - minimum));
    const months = s.months;

    // Its full monthly payment: the highest it pays before its (prorated) last month.
    const full = months != null && months >= 2 ? Math.max(...s.payments.slice(1, months)) : null;
    let step: PayoffPlanRow["step"] = null;
    if (!sim.spread && sim.rollover && full != null && full > pay + 0.5) {
      const from = s.payments.findIndex((p, m) => m >= 1 && p >= full - 0.005);
      step = { month: from, pay: round(full) };
    }
    // Paid off in the first month: its minimum moves on, and the extra too when it was
    // the debt the extra went to.
    const rolls = full ?? round(minimum + (!sim.spread && id === firstOpen ? Math.max(0, extra) : 0));

    // Its payment goes to whichever debt is first in the order and still open by then.
    const rollsTo =
      sim.rollover && months != null
        ? sim.order.find((other) => {
            if (other === id) return false;
            const m = monthsOf(other);
            return m == null || m > months;
          }) ?? null
        : null;

    return [{ id, minimum, extraNow, pay, months, step, rollsTo, rolls }];
  });
}
