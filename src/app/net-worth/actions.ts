"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { vermogenAccounts, vermogenAccountValues } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { todayStr } from "@/lib/date-range";

/**
 * Update balances (Insights › Net worth): new values for hand-kept accounts. Each
 * changed one gets today's date as its last update and a row in its value history; the
 * first time, the value it replaces is recorded too (on its own last-updated date), so
 * the chart shows the step from the old value to the new one.
 */
export async function updateManualBalancesAction(updates: { id: number; value: number }[]): Promise<{ error?: string; saved?: number }> {
  const user = await getCurrentUser();
  if (!user) return { error: "signedOut" };

  const clean = updates.filter((u) => Number.isInteger(u.id) && Number.isFinite(u.value)).map((u) => ({ id: u.id, value: Math.round(u.value * 100) / 100 }));
  if (clean.length === 0) return { saved: 0 };

  const today = todayStr();
  const rows = await db.select().from(vermogenAccounts).where(inArray(vermogenAccounts.id, clean.map((u) => u.id)));
  const known = await db.select({ accountId: vermogenAccountValues.accountId }).from(vermogenAccountValues).where(inArray(vermogenAccountValues.accountId, rows.map((r) => r.id)));
  const withHistory = new Set(known.map((k) => k.accountId));

  let saved = 0;
  for (const update of clean) {
    const row = rows.find((r) => r.id === update.id);
    if (!row) continue;
    // The same value again confirms it is still right: only the date moves on.
    if (row.value === update.value) {
      await db.update(vermogenAccounts).set({ lastUpdated: today }).where(eq(vermogenAccounts.id, row.id));
      saved++;
      continue;
    }
    if (!withHistory.has(row.id) && row.lastUpdated && row.lastUpdated < today) {
      await db.insert(vermogenAccountValues).values({ accountId: row.id, date: row.lastUpdated, value: row.value });
    }
    // One value per day: a second save today replaces the first.
    await db.delete(vermogenAccountValues).where(and(eq(vermogenAccountValues.accountId, row.id), eq(vermogenAccountValues.date, today)));
    await db.insert(vermogenAccountValues).values({ accountId: row.id, date: today, value: update.value });
    await db.update(vermogenAccounts).set({ value: update.value, lastUpdated: today }).where(eq(vermogenAccounts.id, row.id));
    saved++;
  }

  if (saved > 0) revalidatePath("/", "layout");
  return { saved };
}
