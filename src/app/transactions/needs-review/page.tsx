import { db } from "@/db";
import { categories, goals } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getNeedsReviewTransactions } from "@/lib/needs-review";
import { NeedsReviewView } from "./needs-review-view";

export const dynamic = "force-dynamic";

/** Activity › Needs a category: every uncategorised transaction, one at a time. */
export default async function NeedsReviewPage() {
  const [rows, cats, savingsGoals] = await Promise.all([
    getNeedsReviewTransactions(),
    db.select().from(categories).orderBy(categories.group, categories.name),
    db.select().from(goals).where(and(eq(goals.goalType, "savings"), eq(goals.active, true))).orderBy(asc(goals.name)),
  ]);

  return <NeedsReviewView rows={rows} categories={cats} savingsGoals={savingsGoals} />;
}
