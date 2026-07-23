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

export const DEFAULT_SIDEBAR_SUBTITLE = "";

// Caption shown under the "Arca" wordmark in the sidebar (src/components/brand-mark.tsx),
// editable from the profile settings page.
export async function getSidebarSubtitle(): Promise<string> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "sidebar_subtitle")).limit(1);
  return row[0]?.value?.trim() || DEFAULT_SIDEBAR_SUBTITLE;
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

export interface AppLockConfig {
  enabled: boolean;
  hasWebAuthn: boolean;
  webAuthnCredentialId: string | null;
}

export async function getAppLockConfig(): Promise<AppLockConfig> {
  const [enabledRow, webAuthnRow] = await Promise.all([
    db.select().from(appSettings).where(eq(appSettings.key, "app_lock_enabled")).limit(1),
    db.select().from(appSettings).where(eq(appSettings.key, "app_lock_webauthn_credential")).limit(1),
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

  return {
    enabled,
    hasWebAuthn: !!webAuthnCredentialId,
    webAuthnCredentialId,
  };
}
