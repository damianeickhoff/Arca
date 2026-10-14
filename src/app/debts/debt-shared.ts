import { toMonthly } from "@/lib/format";
import {
  amortizationSchedule,
  applyPayments,
  monthlyRate,
  paymentCoversInterest,
  payoffMonths,
  totalInterest,
} from "@/lib/debt-interest";
import type { Debt, RecurringItem } from "@/db/schema";

/**
 * What the recurring bills linked to a debt cost per month — the debt's minimum
 * monthly payment defaults to this, because a linked bill *is* the payment and
 * typing the same figure twice only creates a chance for the two to disagree.
 *
 * Frequencies are normalised (a quarterly bill contributes a third of its amount each
 * month), and several linked bills add up. Rounded to cents so it drops cleanly into
 * an amount keypad.
 */
export function linkedBillsMonthlyTotal(bills: readonly RecurringItem[]): number {
  const total = bills.reduce((sum, b) => sum + toMonthly(b.amount, b.frequency), 0);
  return Math.round(total * 100) / 100;
}

/** A number as an amount-keypad expression string (comma decimal); "" for zero, which
 *  is what the keypads treat as empty. */
export function amountToExpr(amount: number): string {
  return amount ? String(amount).replace(".", ",") : "";
}

export function monthsElapsed(startMonth: string, asOf: Date = new Date()): number {
  const [sy, sm] = startMonth.split("-").map(Number);
  return Math.max(0, (asOf.getFullYear() - sy) * 12 + (asOf.getMonth() + 1 - sm));
}

/** Local YYYY-MM-DD — never toISOString(), which shifts the day across UTC. */
function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM of a YYYY-MM-DD date. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Add `n` months to a YYYY-MM. */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The date `startingBalance` was actually true.
 *
 * Falls back to the start date for debts created before the two were separated, which is
 * exactly the behaviour those debts already had.
 */
export function debtBalanceDate(debt: {
  balanceDate?: string | null;
  startDate?: string | null;
  startMonth: string;
}): string {
  return debt.balanceDate ?? debt.startDate ?? `${debt.startMonth}-01`;
}

/**
 * The months that carry a payment between two dates, first instalment falling one month
 * *after* `fromDate` — a debt is taken on day one and repaid from the month after.
 *
 * The single place that convention lives. It used to be implied in three different
 * places that disagreed: an exclusive `monthsElapsed` count, an inclusive `monthRange`
 * in debt-recurring-paid.ts, and `payoffAnchor` treating the current month as the next
 * payment. That spread is what put the projected payoff date out by a month or two
 * depending on whether a recurring bill happened to be linked.
 */
export function scheduledPaymentMonths(fromDate: string, toDate: string): string[] {
  const first = addMonths(monthOf(fromDate), 1);
  const last = monthOf(toDate);
  const months: string[] = [];
  let cursor = first;
  // Bounded so a nonsense date can't spin forever.
  for (let i = 0; i < 1200 && cursor <= last; i++) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/**
 * The month the next payment falls in: one month after whichever is later, the balance
 * date or the last month already accounted for. Replaces payoffAnchor, which anchored on
 * the current month and so double-counted a payment already recorded this month.
 */
export function firstOutstandingMonth(
  debt: { balanceDate?: string | null; startDate?: string | null; startMonth: string },
  lastRecordedMonth?: string | null,
  asOf: Date = new Date(),
): string {
  const balanceDate = debtBalanceDate(debt);
  // Months already accounted for: every scheduled payment between the balance date and
  // now. Derived here rather than taken from the caller so the unlinked path lands on the
  // same month as the linked one — a debt shouldn't shift its payoff date by a month
  // purely because a recurring bill happens to be attached to it.
  const scheduled = scheduledPaymentMonths(balanceDate, toDateString(asOf));
  const covered = [monthOf(balanceDate), scheduled.at(-1) ?? "", lastRecordedMonth ?? ""].reduce((a, b) =>
    a > b ? a : b,
  );
  // A balance date in the future keeps its own later schedule; no clamp to today needed,
  // since `scheduled` already reaches the present for any past balance date.
  return addMonths(covered, 1);
}

/** A debt's real payment history, one entry per month since it started — including
 *  months where nothing was paid, which still accrue interest. */
export type DebtProgress = {
  /** Cash actually paid. Not the same as principal retired once interest is involved. */
  total: number;
  byMonth: { month: string; amount: number }[];
};

/**
 * How much of the debt has actually been retired, and what's left.
 *
 * Without an interest rate this is the original arithmetic: every euro paid comes
 * straight off the balance. With one, the history is replayed month by month so each
 * payment covers that month's interest first — so `amountPaid` is *principal* retired,
 * always ≤ the cash in `progress.total`.
 */
export function debtBalance(debt: Debt, progress: DebtProgress | null, asOf: Date = new Date()) {
  const rate = monthlyRate(debt.interestRate);
  // Everything is measured from the balance date, not the debt's start date. With the
  // default (balance date = today) there are no months in between, so nothing is assumed
  // repaid and the balance you entered is the balance you have.
  const assumedMonths = scheduledPaymentMonths(debtBalanceDate(debt), toDateString(asOf)).length;

  if (rate === 0) {
    const amountPaid =
      progress !== null
        ? Math.min(progress.total, debt.startingBalance)
        : Math.min(assumedMonths * debt.minimumPayment, debt.startingBalance);
    return { amountPaid, currentBalance: Math.max(debt.startingBalance - amountPaid, 0) };
  }

  // No links to read a history from — assume the schedule was kept to, which is the
  // same assumption the interest-free branch's linear model makes.
  const payments = progress
    ? progress.byMonth.map((m) => m.amount)
    : Array.from({ length: assumedMonths }, () => debt.minimumPayment);

  const currentBalance = applyPayments(debt.startingBalance, rate, payments);
  return { amountPaid: Math.max(debt.startingBalance - currentBalance, 0), currentBalance };
}

// `progress` is the payment history from the debt's linked recurring bills, or null when
// it has no links — in which case the linear minimumPayment × monthsElapsed model applies.
export function computeDebt(debt: Debt, progress: DebtProgress | null) {
  const rate = monthlyRate(debt.interestRate);
  const { amountPaid, currentBalance } = debtBalance(debt, progress);
  const monthsRemaining =
    debt.minimumPayment > 0 && currentBalance > 0
      ? payoffMonths(currentBalance, debt.minimumPayment, rate)
      : currentBalance === 0 ? 0 : null;
  // A payment at or below the monthly interest never clears the debt. Distinct from
  // "no payment set" (also null months), so the UI can say which is wrong.
  const neverPaysOff =
    currentBalance > 0 &&
    debt.minimumPayment > 0 &&
    !paymentCoversInterest(currentBalance, debt.minimumPayment, rate);
  // The FINAL payment's date (not the month after). With N payments left, counting from
  // the first outstanding one, the last falls (N − 1) months later. Keep the debt's own
  // payment day (its start date's day) so the date shows a real day, not the 1st.
  const lastRecorded = progress?.byMonth.filter((m) => m.amount > 0).at(-1)?.month ?? null;
  const lastPaymentDate =
    monthsRemaining != null && monthsRemaining > 0
      ? (() => {
          const [fy, fm] = firstOutstandingMonth(debt, lastRecorded).split("-").map(Number);
          const d = new Date(fy, fm - 1 + (monthsRemaining - 1), 1);
          const day = debt.startDate ? Number(debt.startDate.slice(8, 10)) || 1 : 1;
          const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          d.setDate(Math.min(day, lastDay));
          return d;
        })()
      : null;
  // What the interest actually costs over the rest of the payoff — 0 without a rate.
  const remainingInterest = totalInterest(currentBalance, debt.minimumPayment, rate);
  return { amountPaid, currentBalance, monthsRemaining, lastPaymentDate, neverPaysOff, remainingInterest, lastRecordedMonth: lastRecorded };
}

// The linked recurring bill's end date: the full date of the debt's final payment,
// projected from the FULL starting balance (a freshly created/edited debt has the
// whole balance still outstanding). Keeps the bill's day-of-month aligned with the
// debt's start date. Null when there's no minimum payment to project from, or when the
// payment can never clear the interest.
export function computeDebtBillEndDate(
  startDate: string,
  startingBalance: number,
  minimumPayment: number,
  interestRate?: number | null,
): string | null {
  if (minimumPayment <= 0 || startingBalance <= 0) return null;
  const months = payoffMonths(startingBalance, minimumPayment, monthlyRate(interestRate));
  if (months == null || months <= 0) return null;
  // The first instalment falls one month after the start date (scheduledPaymentMonths),
  // so N payments end N months out, not N − 1 — this is what keeps the bill's stored end
  // date equal to the debt's own last-payment date.
  // The day is clamped to the target month's length (Jan 31 + 10 months is Nov 30, not
  // Dec 1) — the same clamp computeDebt applies to lastPaymentDate, so the bill's end
  // date and the debt's own last payment can't land in different months.
  const [y, m, d] = startDate.split("-").map(Number);
  const end = new Date(y, (m - 1) + months, 1);
  const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  end.setDate(Math.min(d || 1, lastDay));
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

// When an original amount is set (and genuinely bigger than the starting balance —
// i.e. tracking began after some of it was already paid off), progress is measured
// against that true original total instead of the starting balance alone.
function hasOriginalAmount(debt: Debt): boolean {
  return debt.originalAmount != null && debt.originalAmount > debt.startingBalance;
}

/** The denominator progress is measured against: originalAmount when set, else startingBalance. */
export function debtEffectiveTotal(debt: Debt): number {
  return hasOriginalAmount(debt) ? debt.originalAmount! : debt.startingBalance;
}

/** The numerator: originalAmount − currentBalance when set, else the modeled amountPaid. */
export function debtEffectivePaid(debt: Debt, amountPaid: number, currentBalance: number): number {
  return hasOriginalAmount(debt) ? debt.originalAmount! - currentBalance : amountPaid;
}

// The "% paid/received" figure for a single debt — see debtEffectiveTotal/debtEffectivePaid
// above for why this needs to differ from a plain amountPaid/startingBalance ratio when an
// original amount is set (that ratio would otherwise read as 0% for a debt that already
// had a head start before tracking began).
export function debtPaidPct(debt: Debt, amountPaid: number, currentBalance: number): number {
  const total = debtEffectiveTotal(debt);
  if (total <= 0) return 0;
  return Math.min(Math.max((debtEffectivePaid(debt, amountPaid, currentBalance) / total) * 100, 0), 100);
}

// Projected future payments toward payoff, one per month, starting this month —
// each capped at whatever balance remains, so the final entry is prorated instead
// of always equal to minimumPayment (e.g. a 1100 balance at 300/month shows
// 300, 300, 300, 200, not four full 300s).
export function computeDebtPayoffSchedule(
  debt: Debt,
  currentBalance: number,
  /** Last month a payment was actually recorded, so the schedule resumes after it. */
  lastRecordedMonth?: string | null,
): { date: Date; amount: number; interest: number; principal: number }[] {
  if (debt.minimumPayment <= 0 || currentBalance <= 0) return [];
  // Starts at the first payment not already accounted for — the same anchor
  // computeDebt's last-payment date uses, so the list and the date always agree.
  const [fy, fm] = firstOutstandingMonth(debt, lastRecordedMonth).split("-").map(Number);
  // Interest-bearing debts split each payment; without a rate `interest` is 0 throughout
  // and this reduces to the old "full payment until the prorated last one".
  return amortizationSchedule(currentBalance, debt.minimumPayment, monthlyRate(debt.interestRate)).map(
    (entry, i) => ({
      date: new Date(fy, fm - 1 + i, 1),
      amount: entry.amount,
      interest: entry.interest,
      principal: entry.principal,
    }),
  );
}

export function fmtShortMonth(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
export function fmtLongMonth(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
export function fmtLongDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export type ComputedDebt = {
  debt: Debt;
  // The recurring bills that pay this debt off — their paid months drive amountPaid.
  linkedBills: RecurringItem[];
  linkedBillIds: number[];
  amountPaid: number;
  currentBalance: number;
  monthsRemaining: number | null;
  // Date of the final payment (last payment month), or null when already settled.
  lastPaymentDate: Date | null;
  /** The minimum payment doesn't cover the monthly interest — this debt grows forever. */
  neverPaysOff: boolean;
  /** Interest still to be paid over the remaining term. 0 on an interest-free debt. */
  remainingInterest: number;
  /** Last month a payment was actually recorded, so the schedule resumes after it. */
  lastRecordedMonth: string | null;
};

export type DebtChartRow = { name: string; Total: number; [key: string]: number | string };
export type DebtChartSeries = { key: string; label: string; color: string };

// Prop bag shared by DebtsMobile/DebtsDesktop — both are handed the exact same
// server-computed data from page.tsx, only the layout differs per breakpoint.
export interface DebtsPageData {
  rows: Debt[];
  bills: RecurringItem[];
  computed: ComputedDebt[];
  /** Debts in the "owed" direction — money others owe you. */
  computedOwed: ComputedDebt[];
  totalDebt: number;
  /** Sum of current balances of "owed" debts (money coming in). */
  totalOwed: number;
  /** totalDebt − totalOwed. */
  netDebt: number;
  totalStarting: number;
  totalPaid: number;
  totalPaidPct: number;
  totalMonthly: number;
  latestPaymentDate: Date | null;
  snowballTarget: ComputedDebt | null;
  debtHistory: number[];
  hasChart: boolean;
  chartData: DebtChartRow[];
  chartSeries: DebtChartSeries[];
  /** "Owed" direction (money coming in) rollups, mirroring the "owe" totals above. */
  totalOwedStarting: number;
  totalOwedPaid: number;
  totalOwedPaidPct: number;
  totalOwedMonthly: number;
  latestOwedPaymentDate: Date | null;
}
