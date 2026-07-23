import type { Debt, RecurringItem } from "@/db/schema";

export function monthsElapsed(startMonth: string, asOf: Date = new Date()): number {
  const [sy, sm] = startMonth.split("-").map(Number);
  return Math.max(0, (asOf.getFullYear() - sy) * 12 + (asOf.getMonth() + 1 - sm));
}

// `billPaid` is the amount paid via the debt's linked recurring bills, or null when
// it has no links — in which case the linear minimumPayment × monthsElapsed model applies.
export function computeDebt(debt: Debt, billPaid: number | null) {
  const amountPaid =
    billPaid !== null
      ? Math.min(billPaid, debt.startingBalance)
      : Math.min(monthsElapsed(debt.startMonth) * debt.minimumPayment, debt.startingBalance);
  const currentBalance = Math.max(debt.startingBalance - amountPaid, 0);
  const monthsRemaining =
    debt.minimumPayment > 0 && currentBalance > 0
      ? Math.ceil(currentBalance / debt.minimumPayment)
      : currentBalance === 0 ? 0 : null;
  const debtFreeDate =
    monthsRemaining != null
      ? (() => { const d = new Date(); d.setMonth(d.getMonth() + monthsRemaining); return d; })()
      : null;
  return { amountPaid, currentBalance, monthsRemaining, debtFreeDate };
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
export function computeDebtPayoffSchedule(debt: Debt, currentBalance: number): { date: Date; amount: number }[] {
  if (debt.minimumPayment <= 0 || currentBalance <= 0) return [];
  const schedule: { date: Date; amount: number }[] = [];
  const now = new Date();
  let remaining = currentBalance;
  let i = 0;
  while (remaining > 0.005 && i < 1200) {
    const amount = Math.min(debt.minimumPayment, remaining);
    schedule.push({ date: new Date(now.getFullYear(), now.getMonth() + i, 1), amount });
    remaining -= amount;
    i++;
  }
  return schedule;
}

export function fmtShortMonth(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
export function fmtLongMonth(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export type ComputedDebt = {
  debt: Debt;
  // The recurring bills that pay this debt off — their paid months drive amountPaid.
  linkedBills: RecurringItem[];
  linkedBillIds: number[];
  amountPaid: number;
  currentBalance: number;
  monthsRemaining: number | null;
  debtFreeDate: Date | null;
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
  latestFreeDate: Date | null;
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
  latestOwedFreeDate: Date | null;
}
