import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import type { AiResult } from "@/lib/ai-schema";

// The AI's category picks from Needs a category › Ask AI, kept on the transaction
// (`ai_suggested_category_id`) so a reload shows them again and nobody pays for the same
// question twice. A pick only counts while its transaction has no category: giving it
// one clears the pick (the transactions route and the rule pass do that), and a stale
// pick on a categorised row is never read.

/** The stored pick per id, for the given ids that still wait for a category. */
export async function getStoredAiPicks(ids: number[]): Promise<Record<number, number>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: transactions.id, pick: transactions.aiSuggestedCategoryId })
    .from(transactions)
    .where(and(inArray(transactions.id, ids), isNull(transactions.categoryId), isNotNull(transactions.aiSuggestedCategoryId)));
  const picks: Record<number, number> = {};
  for (const r of rows) if (r.pick != null) picks[r.id] = r.pick;
  return picks;
}

/** Stores the AI's answers on rows that still have no category. */
export async function storeAiPicks(picks: Record<number, number>) {
  for (const [id, categoryId] of Object.entries(picks)) {
    await db
      .update(transactions)
      .set({ aiSuggestedCategoryId: categoryId })
      .where(and(eq(transactions.id, Number(id)), isNull(transactions.categoryId)));
  }
}

/**
 * The AI's picks for `ids`: the stored ones as they are, and one request (through `ask`)
 * for the rest only, whose answers are stored before they are returned. Nothing is
 * asked when every id already has a pick.
 */
export async function aiPicksFor(
  ids: number[],
  ask: (ids: number[]) => Promise<AiResult<Record<number, number>>>,
): Promise<AiResult<Record<number, number>>> {
  const stored = await getStoredAiPicks(ids);
  const missing = ids.filter((id) => stored[id] === undefined);
  if (missing.length === 0) return { ok: true, value: stored };
  const result = await ask(missing);
  if (!result.ok) return result;
  await storeAiPicks(result.value);
  return { ok: true, value: { ...stored, ...result.value } };
}
