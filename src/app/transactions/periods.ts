import { financialMonthRange, type FinancialMonthConfig } from "@/lib/date-range";

/** Lower bound for the "All" period — matches the all-time floor used across the app. */
export const ALL_FROM = "2000-01-01";

function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayStr() {
  return toStr(new Date());
}

export type TransactionPeriod = { key: string; label: string; from: string; to: string };

/**
 * The period presets offered by the transaction filter, in display order. "Custom" is not
 * listed here — the filter sheet handles arbitrary ranges separately. Shared between the
 * filter sheet (to render pills) and the active-filter chip row (to label the active range).
 */
export function transactionPeriods(fm: FinancialMonthConfig): TransactionPeriod[] {
  const now = new Date();
  const today = toStr(now);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const halfYear = new Date(now);
  halfYear.setMonth(halfYear.getMonth() - 6);

  const year = new Date(now);
  year.setFullYear(year.getFullYear() - 1);

  const thisMonth = financialMonthRange(fm, 0);
  const prevMonth = financialMonthRange(fm, -1);

  return [
    { key: "all", label: "All Time", from: ALL_FROM, to: today },
    { key: "today", label: "Today", from: today, to: today },
    { key: "yesterday", label: "Yesterday", from: toStr(yesterday), to: toStr(yesterday) },
    { key: "this-month", label: "This month", from: thisMonth.from, to: thisMonth.to },
    { key: "prev-month", label: "Previous month", from: prevMonth.from, to: prevMonth.to },
    { key: "half-year", label: "Half a year", from: toStr(halfYear), to: today },
    { key: "year", label: "Year", from: toStr(year), to: today },
  ];
}

/** The matching preset for a range, or null when it's a custom range (or the default "All"). */
export function matchTransactionPeriod(fm: FinancialMonthConfig, from: string, to: string): TransactionPeriod | null {
  return transactionPeriods(fm).find((p) => p.from === from && p.to === to) ?? null;
}
