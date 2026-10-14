/**
 * Amortisation maths for debts that carry interest.
 *
 * The debt model was flat until now: balance ÷ payment, no interest anywhere (see the
 * old comment in dashboard-charts.tsx). A debt's `interestRate` is an optional *annual
 * nominal* percentage — null or 0 means every function here degrades to exactly the old
 * flat arithmetic, so debts without a rate keep the numbers they had.
 *
 * The convention throughout is the standard one: each month interest accrues on the
 * outstanding balance and the payment covers that interest first; only what's left over
 * reduces the principal. So a €104 payment on a debt accruing €30 of interest retires
 * €74 of debt, not €104 — which is why a repayment received gross must not simply be
 * subtracted from the balance.
 */

/** Cents. Every step rounds so a long schedule can't drift on floating-point dust. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Annual nominal percentage → monthly rate. 0 for null/absent/non-positive. */
export function monthlyRate(annualPercent: number | null | undefined): number {
  if (annualPercent == null || !Number.isFinite(annualPercent) || annualPercent <= 0) return 0;
  return annualPercent / 100 / 12;
}

/**
 * Whether a payment can ever clear a balance: at or below the monthly interest it only
 * services the interest and the debt never moves (or grows). Callers surface this rather
 * than rendering a payoff date that would be a lie.
 */
export function paymentCoversInterest(balance: number, payment: number, rate: number): boolean {
  if (balance <= 0) return true;
  if (rate <= 0) return payment > 0;
  return payment > round(balance * rate);
}

/**
 * The one payoff loop everything else is built on.
 *
 * Deliberately iterative rather than the closed-form amortisation term formula. The
 * schedule rounds to cents every month, so the closed form disagrees with it by a month
 * whenever those roundings leave a few cents outstanding at the end — and a payoff date
 * that depends on which function you asked is the exact bug this feature exists to fix.
 * Returns the number of payments; fills `collect` when given.
 */
function simulate(
  balance: number,
  payment: number,
  rate: number,
  maxMonths: number,
  collect: ScheduleEntry[] | null,
): number {
  let remaining = balance;
  let months = 0;
  while (remaining > 0.005 && months < maxMonths) {
    const interest = rate > 0 ? round(remaining * rate) : 0;
    // The last payment is only ever what's actually left plus its interest, so a payoff
    // ends on a prorated amount rather than a full payment and a negative balance.
    const amount = round(Math.min(payment, remaining + interest));
    const principal = round(amount - interest);
    remaining = round(remaining - principal);
    if (remaining < 0) remaining = 0;
    months++;
    collect?.push({ amount, interest, principal, balanceAfter: remaining });
  }
  return months;
}

/** A 100-year cap — a stop for pathological inputs, never reached by a real debt. */
const MAX_MONTHS = 1200;

/**
 * Number of payments needed to clear `balance`, or null when the payment can never do it.
 * With `rate` 0 this is exactly the old `Math.ceil(balance / payment)`.
 */
export function payoffMonths(balance: number, payment: number, rate: number): number | null {
  if (balance <= 0) return 0;
  if (payment <= 0) return null;
  if (!paymentCoversInterest(balance, payment, rate)) return null;
  return simulate(balance, payment, rate, MAX_MONTHS, null);
}

/**
 * Replay a real payment history against the debt, accruing interest every month —
 * including months where nothing was paid, which is the whole reason this takes a
 * per-month list rather than a single total. Returns the balance still outstanding.
 */
export function applyPayments(startingBalance: number, rate: number, payments: readonly number[]): number {
  let balance = startingBalance;
  for (const payment of payments) {
    if (balance <= 0) return 0;
    const interest = rate > 0 ? round(balance * rate) : 0;
    balance = round(balance + interest - payment);
    if (balance < 0) balance = 0;
  }
  return balance;
}

export type ScheduleEntry = {
  /** What actually leaves the account this month — the payment, or less on the final one. */
  amount: number;
  /** The part of `amount` swallowed by interest. 0 on an interest-free debt. */
  interest: number;
  /** The part of `amount` that reduces the debt. */
  principal: number;
  /** Balance once this payment has been applied. */
  balanceAfter: number;
};

/**
 * Month-by-month payoff schedule from `balance`. Ends when the debt is cleared; returns
 * an empty list when the payment can never clear it. `maxMonths` is a safety stop for a
 * pathological rate/payment combination.
 */
export function amortizationSchedule(
  balance: number,
  payment: number,
  rate: number,
  maxMonths = MAX_MONTHS,
): ScheduleEntry[] {
  if (balance <= 0 || payment <= 0) return [];
  if (!paymentCoversInterest(balance, payment, rate)) return [];
  const entries: ScheduleEntry[] = [];
  simulate(balance, payment, rate, maxMonths, entries);
  return entries;
}

/** Total interest paid over a full payoff — the headline "this debt costs you X" figure. */
export function totalInterest(balance: number, payment: number, rate: number): number {
  if (rate <= 0) return 0;
  return round(amortizationSchedule(balance, payment, rate).reduce((sum, e) => sum + e.interest, 0));
}
