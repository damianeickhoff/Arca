"use server";

import { asc } from "drizzle-orm";
import { db } from "@/db";
import { banks, categories, type Bank, type Category, type RecurringItem } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { loadDebtBills } from "@/app/debts/load-debts";

// What the shell's add menu (components/shell/quick-add.tsx) needs to open a create
// dialog on any page: the debt form links recurring bills, the goal form and the new
// category dialog pick from the categories, the category's rules can target an account.
// Read when the item is chosen, so the layout never loads it up front.

export type QuickAddData =
  | { kind: "debt"; bills: RecurringItem[] }
  | { kind: "goal"; categories: Category[] }
  | { kind: "category"; categories: Category[]; banks: Bank[] };

export async function loadQuickAddData(kind: QuickAddData["kind"]): Promise<QuickAddData | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (kind === "debt") return { kind, bills: await loadDebtBills() };
  const cats = await db.select().from(categories).orderBy(categories.group, categories.name);
  if (kind === "goal") return { kind, categories: cats };
  return { kind, categories: cats, banks: await db.select().from(banks).orderBy(asc(banks.displayName)) };
}
