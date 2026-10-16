import type { OverdraftMode } from "@/lib/app-settings";

// Types and pure helpers for the cash flow forecast, split out from cash-flow-forecast.ts
// so client components (the chart, the status card) can import them without dragging
// better-sqlite3 into the browser bundle.

export const FORECAST_HORIZON_DAYS = 90;

/**
 * "empty" is not a verdict — it means there is nothing to forecast from (no starting
 * balance and no future transactions or recurring items). Without it a fresh install
 * would score its flat zero line as "warning", because zero is below any positive
 * low-balance threshold.
 */
export type ForecastStatus = "healthy" | "warning" | "critical" | "empty";

/**
 * Why the forecast got its status, so the copy can say what actually happens:
 *   "short"       — below zero, no overdraft to fall back on
 *   "pastLimit"   — past the overdraft limit
 *   "inOverdraft" — below zero but inside the overdraft (buffer mode only)
 *   "nearLimit"   — inside the overdraft and within the safety margin of its limit (spendable mode)
 *   "low"         — under the safety line, still above zero
 *   "fine"        — above the safety line
 */
export type ForecastReason = "short" | "pastLimit" | "inOverdraft" | "nearLimit" | "low" | "fine";

export interface ForecastEvent {
  /** Stable React key — projections have no row id of their own. */
  key: string;
  date: string; // YYYY-MM-DD
  name: string;
  /** Signed: positive = money in, negative = money out. */
  amount: number;
  /** "transaction" = already booked with a future date; "recurring" = projected. */
  kind: "transaction" | "recurring";
  transactionId: number | null;
  recurringItemId: number | null;
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
}

export interface ForecastPoint {
  date: string;
  /** Projected running amount at the end of this day. */
  amount: number;
  /** Net movement on this day (0 on quiet days). */
  change: number;
}

export interface ForecastFloor {
  /** Combined overdraft limit of every bank account, as a positive amount (0 = none). */
  overdraftLimit: number;
  overdraftMode: OverdraftMode;
}

export interface CashFlowForecast extends ForecastFloor {
  from: string;
  to: string;
  /** false = no account has a starting balance, so amounts are cumulative cash flow. */
  hasStartingBalance: boolean;
  /** Today's figure: the account balance, or 0 when there is none. */
  current: number;
  points: ForecastPoint[];
  events: ForecastEvent[];
  lowest: { amount: number; date: string } | null;
  /** The first day the projection drops past what the accounts allow (zero, or the overdraft limit). */
  firstShortDate: string | null;
  nextIncome: ForecastEvent | null;
  totalIncome: number;
  totalExpenses: number;
  netChange: number;
  warningThreshold: number;
  status: ForecastStatus;
}

/**
 * Where the dashed safety line sits. Normally the warning threshold above zero; when the
 * overdraft counts as spendable it sits the same distance above the overdraft limit, since
 * that limit is then where the money really runs out.
 */
export function safetyLine(threshold: number, floor: ForecastFloor): number {
  return floor.overdraftMode === "spendable" ? threshold - floor.overdraftLimit : threshold;
}

/**
 * The one verdict for a projected low point, shared by the server (the full horizon) and
 * the Forecast page's 30 days · 3 months switch. Past the overdraft limit (or below zero
 * without one) is always critical. Inside the overdraft is a warning when the overdraft
 * is a safety net, and ordinary money when it counts as spendable — then only coming
 * within the threshold of the limit warns.
 */
export function judgeForecast(
  lowest: number,
  threshold: number,
  floor: ForecastFloor,
): { status: Exclude<ForecastStatus, "empty">; reason: ForecastReason } {
  const limit = Math.max(0, floor.overdraftLimit);
  if (lowest < -limit) return { status: "critical", reason: limit > 0 ? "pastLimit" : "short" };
  if (floor.overdraftMode === "buffer" && lowest < 0) return { status: "warning", reason: "inOverdraft" };
  if (lowest < safetyLine(threshold, floor)) {
    return { status: "warning", reason: lowest < 0 ? "nearLimit" : "low" };
  }
  return { status: "healthy", reason: "fine" };
}

/** The first point that drops past what the accounts allow, or null. */
export function firstShortPoint<T extends { amount: number }>(points: readonly T[], overdraftLimit: number): T | null {
  const floor = -Math.max(0, overdraftLimit);
  return points.find((p) => p.amount < floor) ?? null;
}
