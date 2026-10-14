"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import type { BudgetRecurringMode, SharedCostMode } from "@/lib/app-settings";

// Saves the "how recurring bills count toward budgets" setting. Uses a server action
// (not the generic /api/settings + router.refresh path) so it can revalidatePath the
// server-side cache — router.refresh() only clears the client cache, which left the
// dashboard's "Spending by category" row showing stale numbers until a full reload.
export async function setBudgetRecurringModeAction(
  mode: BudgetRecurringMode,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };

  await db
    .insert(appSettings)
    .values({ key: "budget_recurring_mode", value: mode })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: mode } });

  revalidatePath("/", "layout");
  return {};
}

// Saves the "show shared bills gross or as my share" setting. Same server-action reason
// as above: every spend surface reads it server-side, so the cache must be revalidated.
export async function setSharedCostModeAction(
  mode: SharedCostMode,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };

  await db
    .insert(appSettings)
    .values({ key: "shared_cost_mode", value: mode })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: mode } });

  revalidatePath("/", "layout");
  return {};
}
