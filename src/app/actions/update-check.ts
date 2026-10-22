"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { checkForUpdate, getUpdateCheckState, setUpdateCheckEnabled, type UpdateCheckState } from "@/lib/update-check";

/** Settings › About: the update-check switch. Admins only; it is an app-wide setting and
 *  the one connection Arca makes on its own. Turning it on runs a first check at once. */
export async function setUpdateCheckAction(enabled: boolean): Promise<{ error?: "denied" | "unavailable" | "unexpected"; state?: UpdateCheckState }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "denied" };
  await setUpdateCheckEnabled(enabled);
  if (!enabled) {
    revalidatePath("/", "layout");
    return { state: await getUpdateCheckState() };
  }
  const result = await checkForUpdate();
  revalidatePath("/", "layout");
  return result.ok ? { state: result.state } : { error: result.error, state: result.state };
}

export async function checkForUpdateNowAction(): Promise<{ error?: "denied" | "unavailable" | "unexpected"; state?: UpdateCheckState }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "denied" };
  const result = await checkForUpdate();
  revalidatePath("/", "layout");
  return result.ok ? { state: result.state } : { error: result.error, state: result.state };
}
