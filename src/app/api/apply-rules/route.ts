import { NextResponse } from "next/server";
import { applyRulePass, planRulePass } from "@/lib/apply-rules";
import { detectRecurringTransactions } from "@/lib/detect-recurring";
import { requireAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/activity-log";
import { rulePassEntry } from "@/lib/activity-log-entries";

export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  // Detect (create) recurring items first, then link every transaction to them.
  const detected = await detectRecurringTransactions();
  const changes = await planRulePass();
  const updated = await applyRulePass(changes);
  // A run that changed rows goes in the change log, with what each row had before.
  const activityId = await recordActivity(rulePassEntry(changes));
  return NextResponse.json({ updated, detected, activityId });
}
