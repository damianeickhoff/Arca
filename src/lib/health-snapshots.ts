import { db } from "@/db";
import { financialHealthSnapshots } from "@/db/schema";
import type { FinancialHealthSnapshot } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { computeNetWorth } from "@/lib/net-worth-snapshots";
import { getFinancialHealth } from "@/lib/financial-health-data";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth } from "@/lib/date-range";

// ─── Monthly financial-health history ────────────────────────────────────────
//
// The score itself is always "as of now" — its metrics read trailing windows that
// can't be reconstructed for arbitrary past months (budgets, accounts and recurring
// items all change over time, and Arca keeps no history of those). So instead of
// back-computing, the current financial month's score is written on each visit and
// simply stops being touched once the month rolls over. That leaves each past month
// holding the last score that month actually had.
//
// Same trigger shape as the daily net-worth snapshot (see net-worth-snapshots.ts):
// called from the root layout, guarded so it can never break a render.

/**
 * Writes (or refreshes) the snapshot for the financial month in progress.
 * Past months are never rewritten.
 */
export async function recordCurrentMonthHealthSnapshot(): Promise<void> {
  const financialMonth = await getFinancialMonthConfig();
  const month = currentFinancialMonth(financialMonth);

  const [health, netWorth] = await Promise.all([
    getFinancialHealth(financialMonth),
    computeNetWorth().catch(() => null),
  ]);

  // Nothing measurable yet — don't seed the history with a meaningless zero.
  if (health.score === null) return;

  const breakdown = JSON.stringify(
    Object.fromEntries(health.categories.map((c) => [c.key, c.points])),
  );

  const values = {
    month,
    score: health.score,
    netWorth: netWorth?.netWorth ?? null,
    savingsRate: health.metrics.savingsRate,
    breakdown,
    updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  };

  await db
    .insert(financialHealthSnapshots)
    .values(values)
    .onConflictDoUpdate({ target: financialHealthSnapshots.month, set: values });
}

/**
 * Layout-safe wrapper. Refreshes the current month's snapshot at most once a day —
 * scoring touches a good number of tables, and the figure barely moves within a
 * single day, so a cheap single-row lookup guards the real work (same select-first
 * shape as maybeRecordDailyNetWorthSnapshot). Best-effort throughout: a snapshot
 * failure must never break the page that triggered it.
 */
export async function maybeRecordMonthlyHealthSnapshot(): Promise<void> {
  try {
    const financialMonth = await getFinancialMonthConfig();
    const month = currentFinancialMonth(financialMonth);
    const existing = await getHealthSnapshot(month);
    const today = new Date().toISOString().slice(0, 10);
    if (existing && (existing.updatedAt ?? "").slice(0, 10) === today) return;
    await recordCurrentMonthHealthSnapshot();
  } catch {
    // Swallowed on purpose — see above.
  }
}

/** Snapshot history, oldest first, capped to the most recent `limit` months. */
export async function getHealthHistory(limit = 12): Promise<FinancialHealthSnapshot[]> {
  const rows = await db
    .select()
    .from(financialHealthSnapshots)
    .orderBy(asc(financialHealthSnapshots.month));
  return rows.slice(-limit);
}

/** A single month's snapshot, if one was recorded. */
export async function getHealthSnapshot(month: string): Promise<FinancialHealthSnapshot | null> {
  const [row] = await db
    .select()
    .from(financialHealthSnapshots)
    .where(eq(financialHealthSnapshots.month, month))
    .limit(1);
  return row ?? null;
}
