import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { applyRulePass, planRulePass, withoutCategoryFor } from "@/lib/apply-rules";
import { requireAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/activity-log";
import { rulePassEntry } from "@/lib/activity-log-entries";

/**
 * POST — runs every rule over every transaction. An optional `{ exclude: number[] }`
 * (the rows unticked in "Show the N transactions" when a rule is made) keeps those
 * out: the pass leaves their category alone, and they are marked as set by hand so a
 * later pass (the next import, another rule) leaves them alone too.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.exclude) ? body.exclude : [];
  const exclude = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))];

  if (exclude.length > 0) await db.update(transactions).set({ manuallyCategorized: true }).where(inArray(transactions.id, exclude));
  const changes = withoutCategoryFor(await planRulePass(), new Set(exclude));
  const updated = await applyRulePass(changes);
  // A run that changed rows goes in the change log, with what each row had before.
  const activityId = await recordActivity(rulePassEntry(changes));
  return NextResponse.json({ updated, activityId });
}
