import { db } from "@/db";
import { categories, goals } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getNeedsReviewTransactions } from "@/lib/needs-review";
import { getCategoryTransactionCounts } from "@/lib/category-counts";
import { isAiReady } from "@/lib/ai-provider";
import { shiftDate } from "@/lib/date-range";
import { todayStr } from "../periods";
import { NeedsReviewView } from "./needs-review-view";

export const dynamic = "force-dynamic";

/** How many "Most used" categories to offer, and over how long. */
const MOST_USED = 10;
const MOST_USED_DAYS = 183;

/** Activity › Needs a category: every uncategorised transaction, one at a time. */
export default async function NeedsReviewPage() {
  const [rows, cats, savingsGoals, aiReady, counts] = await Promise.all([
    getNeedsReviewTransactions(),
    db.select().from(categories).orderBy(categories.group, categories.name),
    db.select().from(goals).where(and(eq(goals.goalType, "savings"), eq(goals.active, true))).orderBy(asc(goals.name)),
    isAiReady(),
    getCategoryTransactionCounts({ since: shiftDate(todayStr(), -MOST_USED_DAYS), skipGroups: true }),
  ]);

  return (
    <NeedsReviewView
      rows={rows}
      categories={cats}
      savingsGoals={savingsGoals}
      aiReady={aiReady}
      mostUsedIds={counts.slice(0, MOST_USED).map((c) => c.categoryId)}
    />
  );
}
