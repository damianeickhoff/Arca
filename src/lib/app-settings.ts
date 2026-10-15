import { db } from "@/db";
import { appSettings, financialMonthOverrides } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { asc, eq } from "drizzle-orm";

function parseStartDay(value: string | null | undefined) {
  if (!value) return 1;
  const n = parseInt(value, 10);
  if (!isNaN(n) && n >= 1 && n <= 28) return n;
  return 1;
}

export async function getFinancialMonthConfig(): Promise<FinancialMonthConfig> {
  const [settingRows, rollbackRows, overrides] = await Promise.all([
    db.select().from(appSettings).where(eq(appSettings.key, "month_start_day")).limit(1),
    db.select().from(appSettings).where(eq(appSettings.key, "month_start_weekend_rollback")).limit(1),
    db.select().from(financialMonthOverrides).orderBy(asc(financialMonthOverrides.month)),
  ]);

  return {
    defaultStartDay: parseStartDay(settingRows[0]?.value),
    overrides: Object.fromEntries(overrides.map((row) => [row.month, row.startDay])),
    weekendRollback: rollbackRows[0]?.value === "1",
  };
}

export async function getDefaultCurrency(): Promise<string> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "default_currency")).limit(1);
  const value = row[0]?.value;
  return value === "USD" || value === "GBP" ? value : "EUR";
}

export async function getStartDay(): Promise<number> {
  const config = await getFinancialMonthConfig();
  return config.defaultStartDay;
}

export async function getBudgetStrategy(): Promise<{ nodig: number; willen: number; sparen: number }> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "budget_strategy")).limit(1);
  if (row[0]?.value) {
    try {
      const p = JSON.parse(row[0].value);
      if (typeof p.nodig === "number" && typeof p.willen === "number" && typeof p.sparen === "number") {
        return p;
      }
    } catch { /* fall through */ }
  }
  return { nodig: 60, willen: 25, sparen: 15 };
}

// Whether unused category budget from last month carries into this month's target.
// Scope: category targets only, single-month lookback, no compounding chains — see
// src/app/budget/page.tsx#getBudgetData for the calculation.
export async function getBudgetRollover(): Promise<boolean> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "budget_rollover")).limit(1);
  return row[0]?.value === "1";
}

// How transactions matched to a recurring bill count toward a category's budget spend:
//   "always"   — always counted
//   "exclude"  — never counted (a recurring bill isn't something you budget down this month)
//   "budgeted" — counted only for categories that have a budget target set
// Applied identically by getBudgetOverview (budget page) and getDashboardData
// (dashboard "Spending by category") so the two never disagree.
export type BudgetRecurringMode = "always" | "exclude" | "budgeted";

export async function getBudgetRecurringMode(): Promise<BudgetRecurringMode> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "budget_recurring_mode")).limit(1);
  const value = row[0]?.value;
  return value === "always" || value === "exclude" ? value : "budgeted";
}

// Whether reports show the full amount of a shared bill or only the part you really pay:
//   "gross" — the amount that left your account, exactly as your bank shows it (default)
//   "net"   — minus what others pay back (recurringItems.sharedReimbursedAmount, or an
//             actual linked reimbursement when there is one — see reimbursedAmountSql)
// Only spend reporting reacts to this. Cash flow, the forecast, the bill tracker and the
// transaction list stay gross: that money genuinely moves and must tie to the statement.
export type SharedCostMode = "gross" | "net";

export async function getSharedCostMode(): Promise<SharedCostMode> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "shared_cost_mode")).limit(1);
  return row[0]?.value === "net" ? "net" : "gross";
}

// Cash-flow forecast "getting low" line. The forecast is Warning once the projected
// low point dips under this (and Critical once it goes negative) — see
// src/lib/cash-flow-forecast.ts.
export const DEFAULT_CASH_FLOW_WARNING_THRESHOLD = 500;

export async function getCashFlowWarningThreshold(): Promise<number> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "cash_flow_warning_threshold")).limit(1);
  const parsed = Number(row[0]?.value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CASH_FLOW_WARNING_THRESHOLD;
}

export interface AppLockConfig {
  enabled: boolean;
  hasWebAuthn: boolean;
  webAuthnCredentialId: string | null;
  // Length of the stored passcode (4–6), or null for passcodes set before the
  // length was recorded. The lock screen uses it to size the dots and know when
  // to auto-submit; a null falls back to a manual confirm button.
  pinLength: number | null;
}

export async function getAppLockConfig(): Promise<AppLockConfig> {
  const [enabledRow, webAuthnRow, pinLengthRow] = await Promise.all([
    db.select().from(appSettings).where(eq(appSettings.key, "app_lock_enabled")).limit(1),
    db.select().from(appSettings).where(eq(appSettings.key, "app_lock_webauthn_credential")).limit(1),
    db.select().from(appSettings).where(eq(appSettings.key, "app_lock_pin_length")).limit(1),
  ]);

  const enabled = enabledRow[0]?.value === "1";
  const webAuthnVal = webAuthnRow[0]?.value;
  let webAuthnCredentialId: string | null = null;
  if (webAuthnVal) {
    try {
      const parsed = JSON.parse(webAuthnVal);
      webAuthnCredentialId = parsed.credentialId ?? null;
    } catch { /* ignore */ }
  }

  const parsedLength = parseInt(pinLengthRow[0]?.value ?? "", 10);
  const pinLength = parsedLength >= 4 && parsedLength <= 6 ? parsedLength : null;

  return {
    enabled,
    hasWebAuthn: !!webAuthnCredentialId,
    webAuthnCredentialId,
    pinLength,
  };
}
