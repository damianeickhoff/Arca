"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users, type Invite } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createInvite, deleteInvite } from "@/lib/invites";

export async function setUserAdminAction(userId: number, isAdmin: boolean): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isAdmin) return { error: "Access denied." };
  if (userId === currentUser.id) return { error: "You cannot change your own role." };

  await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
  revalidatePath("/", "layout");
  return {};
}

export async function deleteUserAction(userId: number): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isAdmin) return { error: "Access denied." };
  if (userId === currentUser.id) return { error: "You cannot delete yourself." };

  await db.delete(users).where(eq(users.id, userId));
  revalidatePath("/", "layout");
  return {};
}

/** Settings › Users: a new invite link. Only the token and its expiry go back. */
export async function createInviteAction(): Promise<{ error?: string; invite?: Invite }> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isAdmin) return { error: "Access denied." };

  const invite = await createInvite(currentUser.id);
  revalidatePath("/settings", "layout");
  return { invite };
}

/** Settings › Users: withdraw an invite link before anyone uses it. */
export async function revokeInviteAction(inviteId: number): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isAdmin) return { error: "Access denied." };

  await deleteInvite(inviteId);
  revalidatePath("/settings", "layout");
  return {};
}
