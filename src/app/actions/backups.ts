"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createBackup, deleteBackup, type BackupInfo } from "@/lib/backups";

/** Settings › Data health: a manual backup, admins only (it holds everyone's data). */
export async function createBackupAction(): Promise<{ error?: string; backup?: BackupInfo }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "denied" };
  try {
    const backup = await createBackup("manual");
    revalidatePath("/settings", "layout");
    return { backup };
  } catch {
    return { error: "failed" };
  }
}

export async function deleteBackupAction(name: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "denied" };
  if (!deleteBackup(name)) return { error: "failed" };
  revalidatePath("/settings", "layout");
  return {};
}
