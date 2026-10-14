"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";

/**
 * Re-renders the root layout after a client-side mutation that changes what it shows —
 * today that's the desktop sidebar's account balances (adding, deleting or importing
 * transactions). The layout reads them once per render and a soft navigation keeps it,
 * so without this the sidebar showed stale balances until a full reload.
 *
 * A Server Function rather than router.refresh(): router.refresh() only clears the
 * client cache, while revalidatePath from a server function updates the UI immediately
 * and invalidates the cached layout for the next navigation too (same pattern as
 * actions/budget-settings.ts). The API routes that perform these mutations also call
 * revalidatePath, for callers that don't use this action.
 */
export async function refreshLayoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  revalidatePath("/", "layout");
}
