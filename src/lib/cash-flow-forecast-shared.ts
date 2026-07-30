import { formatEur } from "@/lib/format";
import { getTranslations } from "next-intl/server";

// Types and pure presentation helpers for the cash flow forecast, split out from
// cash-flow-forecast.ts so client components (the chart, the events list) can import
// them without dragging better-sqlite3 into the browser bundle.

export const FORECAST_HORIZON_DAYS = 90;

/**
 * "empty" is not a verdict — it means there is nothing to forecast from (no starting
 * balance and no future transactions or recurring items). Without it a fresh install
 * would score its flat zero line as "warning", because zero is below any positive
 * low-balance threshold.
 */
export type ForecastStatus = "healthy" | "warning" | "critical" | "empty";

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

export interface CashFlowForecast {
  from: string;
  to: string;
  /** false = no account has a starting balance, so amounts are cumulative cash flow. */
  hasStartingBalance: boolean;
  /** Today's figure: the account balance, or 0 when there is none. */
  current: number;
  points: ForecastPoint[];
  events: ForecastEvent[];
  lowest: { amount: number; date: string } | null;
  firstNegativeDate: string | null;
  nextIncome: ForecastEvent | null;
  totalIncome: number;
  totalExpenses: number;
  netChange: number;
  warningThreshold: number;
  status: ForecastStatus;
  /** One-line insight for the dashboard card, already prioritised. */
  message: string;
}

export function formatForecastDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/** Signed euro label — formatEur() is unsigned, and a forecast dip needs its minus. */
export function signedForecastEur(amount: number): string {
  return `${amount < 0 ? "-" : ""}${formatEur(Math.abs(amount))}`;
}

// Priority is fixed by the feature spec: negative first, then the low-balance
// warning, then the healthy case.
export async function forecastMessage({
  status,
  lowest,
  firstNegativeDate,
  threshold,
  points,
}: {
  status: ForecastStatus;
  lowest: { amount: number; date: string };
  firstNegativeDate: string | null;
  threshold: number;
  points: ForecastPoint[];
}): Promise<string> {

  const t = await getTranslations("cashFlow");

  if (status === "empty") return t("alert.empty");

  if (status === "critical") {
    const date = firstNegativeDate ?? lowest.date;
    const atDate = points.find((p) => p.date === date)?.amount ?? lowest.amount;

    return t("alert.critical", {
      amount: signedForecastEur(atDate),
      date: formatForecastDate(date),
    });
  }

  if (status === "warning") {
    return t("alert.warning", {
      amount: formatEur(threshold),
      date: formatForecastDate(lowest.date),
    });
  }

  return t("alert.healthy");
}
