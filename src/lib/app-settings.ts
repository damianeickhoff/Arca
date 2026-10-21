import { db } from "@/db";
import { appSettings, financialMonthOverrides } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { asc, eq } from "drizzle-orm";
import { parseDebtSort, type DebtSort } from "@/app/debts/debt-shared";

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

// What an account's overdraft (banks.overdraftLimit) means for the money you have:
//   "buffer"    — a safety net only: the forecast warns once you dip into it and calls a
//                 shortfall once you pass it, but the room never counts as yours (default)
//   "spendable" — the unused room counts as available money: dipping into it is normal,
//                 and the low-balance warning is measured from the limit instead of zero
// Either way a balance past the limit is a shortfall. See judgeForecast.
export type OverdraftMode = "buffer" | "spendable";

export async function getOverdraftMode(): Promise<OverdraftMode> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "overdraft_mode")).limit(1);
  return row[0]?.value === "spendable" ? "spendable" : "buffer";
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

/** Plan › Debts' payoff order: how the extra is shared out, and how Your debts is
 *  sorted (see DEBT_SORTS). Set from the simulator's Order switch. A value saved before
 *  the three-way switch ("smallest") is rewritten to its new name ("quickest") the first
 *  time it is read. */
export async function getDebtPayoffOrder(): Promise<DebtSort> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "debt_payoff_order")).limit(1);
  const order = parseDebtSort(row?.value);
  if (row && row.value !== order) {
    await db.update(appSettings).set({ value: order }).where(eq(appSettings.key, "debt_payoff_order"));
  }
  return order;
}

/** Whether the user skipped Home's "Get started" card (set from the card's Skip button). */
export async function getHomeGetStartedDismissed(): Promise<boolean> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "home_get_started_dismissed")).limit(1);
  return row?.value === "1";
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
