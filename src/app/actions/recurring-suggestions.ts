"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { acceptSuggestion, detectRecurringSuggestions, linkSuggestion, rejectSuggestion, resolveMigrated } from "@/lib/recurring-suggestions";
import { isImportRunning, withImportLock } from "@/lib/import-lock";

// The review strip's buttons (Upcoming, Settings › Recurring) and Data health's full
// pass. Server actions so the layout is revalidated: an accepted bill shows up on Home,
// Budget and Upcoming at once.

type Result = { error?: string };

async function run(change: () => Promise<boolean>): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const ok = await change();
  revalidatePath("/", "layout");
  return ok ? {} : { error: "notFound" };
}

export async function acceptSuggestionAction(id: number): Promise<Result> {
  return run(() => acceptSuggestion(id));
}

export async function rejectSuggestionAction(id: number): Promise<Result> {
  return run(() => rejectSuggestion(id));
}

/** After "Edit": the recurring editor saved the suggestion as this item. */
export async function linkSuggestionAction(id: number, recurringItemId: number): Promise<Result> {
  return run(() => linkSuggestion(id, recurringItemId));
}

/** The migration review on Upcoming: Keep all / Remove all, or one item (`id`). */
export async function resolveMigratedAction(keep: boolean, id?: number): Promise<Result> {
  return run(async () => (await resolveMigrated(keep, id != null ? [id] : undefined)) > 0);
}

/** Settings › Data health › "Look for regular payments": the full pass over every
 *  counterparty (imports and bank syncs only re-test the ones they touched). */
export async function findRegularPaymentsAction(): Promise<{ error?: string; suggested?: number; autoAccepted?: number }> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  // An import runs the detector itself at its end; don't race it.
  if (isImportRunning()) return { error: "busy" };
  const result = await withImportLock(() => detectRecurringSuggestions());
  revalidatePath("/", "layout");
  return result;
}
