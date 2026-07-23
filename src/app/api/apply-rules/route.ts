import { NextResponse } from "next/server";
import { applyAllRules } from "@/lib/apply-rules";
import { detectRecurringTransactions } from "@/lib/detect-recurring";
import { requireAuth } from "@/lib/auth";

export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  // Detect (create) recurring items first, then link every transaction to them.
  const detected = await detectRecurringTransactions();
  const updated = await applyAllRules();
  return NextResponse.json({ updated, detected });
}
