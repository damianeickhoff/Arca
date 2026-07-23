import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { budgets, budgetTargets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

// Single active overall budget. POST upserts it (there is only ever one active row);
// DELETE clears it. Category-level budgets are managed via /api/budget-targets.
export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { amount, period } = await req.json();
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  const normPeriod = period === "weekly" ? "weekly" : "monthly";
  // There is no user-facing "start day" — monthly always tracks the app's financial
  // month, weekly is always Monday–Sunday (see src/lib/budget-overview.ts). The
  // column is kept for schema compatibility but no longer holds meaningful data.
  const startDay = 1;

  const [existing] = await db.select().from(budgets).where(eq(budgets.active, true)).limit(1);
  if (existing) {
    const [row] = await db.update(budgets)
      .set({ amount: amt, period: normPeriod, startDay })
      .where(eq(budgets.id, existing.id))
      .returning();
    return NextResponse.json(row);
  }
  const [row] = await db.insert(budgets)
    .values({ amount: amt, period: normPeriod, startDay, active: true })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE() {
  const denied = await requireAuth();
  if (denied) return denied;

  // Deleting the overall budget resets the whole budget setup, so its category-level
  // defaults (year=0/month=0, set from the budget portal) are cleared too — otherwise
  // the portal would look "empty" but silently keep computing against stale targets.
  await db.delete(budgets).where(eq(budgets.active, true));
  await db.delete(budgetTargets).where(and(eq(budgetTargets.year, 0), eq(budgetTargets.month, 0)));
  return NextResponse.json({ ok: true });
}
