"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { acceptSuggestion, linkSuggestion, rejectSuggestion } from "@/lib/recurring-suggestions";

// The review strip's buttons (Upcoming, Settings › Recurring). Server actions so the
// layout is revalidated: an accepted bill shows up on Home, Budget and Upcoming at once.

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
