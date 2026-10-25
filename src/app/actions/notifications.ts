"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isNotificationKind } from "@/lib/notification-kinds";
import { clearAllNotifications, markAllNotificationsRead, markNotificationRead, setKindEnabled } from "@/lib/notifications";

// /notifications and Settings › Notifications. The unread count lives in the root
// layout (sidebar badge, Home's bell dot), so every change revalidates the layout.

export async function markNotificationReadAction(id: number): Promise<{ error?: "denied" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "denied" };
  if (Number.isInteger(id)) await markNotificationRead(user.id, id);
  revalidatePath("/", "layout");
  return {};
}

export async function markAllNotificationsReadAction(): Promise<{ error?: "denied" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "denied" };
  await markAllNotificationsRead(user.id);
  revalidatePath("/", "layout");
  return {};
}

/** "Clear all": hides every notice of this user (soft, see clearAllNotifications). */
export async function clearAllNotificationsAction(): Promise<{ error?: "denied" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "denied" };
  await clearAllNotifications(user.id);
  revalidatePath("/", "layout");
  return {};
}

/** One kind's switch; per user, no admin gate. */
export async function setNotificationKindAction(kind: string, enabled: boolean): Promise<{ error?: "denied" | "invalid" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "denied" };
  if (!isNotificationKind(kind) || typeof enabled !== "boolean") return { error: "invalid" };
  await setKindEnabled(user.id, kind, enabled);
  revalidatePath("/", "layout");
  return {};
}
