import { db } from "@/db";
import { goals } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// A transaction linked to a savings goal contributes to it (expense — money set
// aside) or withdraws from it (income — money taken back out). Returns the signed
// delta that should be applied to the goal's currentAmount for this transaction.
export function goalDeltaForTransaction(direction: string, amount: number): number {
  return direction === "income" ? -amount : amount;
}

// Adds (or, with a negative delta, subtracts) from a goal's currentAmount in place —
// used both when a transaction gets newly linked to a goal and when reversing a
// transaction's old effect before it's deleted, unlinked, or otherwise changed.
export async function adjustGoalAmount(goalId: number, delta: number): Promise<void> {
  if (!delta) return;
  await db.update(goals).set({ currentAmount: sql`${goals.currentAmount} + ${delta}` }).where(eq(goals.id, goalId));
}
