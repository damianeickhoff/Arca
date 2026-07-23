"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

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
