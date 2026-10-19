import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, bankConnections } from "@/db/schema";
import { getBankConfig, isBankConfigured } from "@/lib/enable-banking/client";
import { syncBankConnections } from "@/lib/bank-sync";
import { isImportRunning } from "@/lib/import-lock";

// The daily bank sync: started once per server process from src/instrumentation.ts.
// It wakes every hour and syncs when the last automatic run is a day old, so a restart
// neither skips a day nor syncs twice. A run is skipped (and retried next hour) while a
// CSV import or a manual sync is busy. For an external schedule see /api/bank/cron.

const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 5 * 60 * 1000;
const RUN_EVERY_MS = 23.5 * 60 * 60 * 1000;
const LAST_RUN_KEY = "eb_last_auto_sync";

const state = globalThis as typeof globalThis & { __centjeBankScheduler?: boolean };

async function tick() {
  try {
    const [last] = await db.select().from(appSettings).where(eq(appSettings.key, LAST_RUN_KEY)).limit(1);
    if (last?.value && Date.now() - new Date(last.value).getTime() < RUN_EVERY_MS) return;
    if (isImportRunning()) return;
    if (!isBankConfigured(await getBankConfig())) return;
    const [any] = await db.select({ id: bankConnections.id }).from(bankConnections).limit(1);
    if (!any) return;

    const outcome = await syncBankConnections();
    if (!outcome.ok) return; // busy: try again next hour
    const value = new Date().toISOString();
    await db.insert(appSettings).values({ key: LAST_RUN_KEY, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
    const imported = outcome.results.reduce((n, r) => n + r.summary.imported, 0);
    console.log(`[bank-sync] daily sync: ${imported} new transaction(s) from ${outcome.results.length} connection(s)`);
  } catch (e) {
    console.warn("[bank-sync] daily sync failed:", e);
  }
}

export function startBankScheduler() {
  if (state.__centjeBankScheduler || process.env.BANK_SYNC_DISABLED === "1") return;
  state.__centjeBankScheduler = true;
  setTimeout(() => void tick(), FIRST_CHECK_MS).unref();
  setInterval(() => void tick(), CHECK_EVERY_MS).unref();
}
