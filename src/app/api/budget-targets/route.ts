import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { budgetTargets } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { categoryId, month: monthStr, targetAmount } = await req.json();
  const [year, mon] = monthStr.split("-").map(Number);

  // Upsert: delete then insert
  await db.delete(budgetTargets).where(
    and(eq(budgetTargets.year, year), eq(budgetTargets.month, mon), eq(budgetTargets.categoryId, categoryId))
  );
  const [row] = await db.insert(budgetTargets)
    .values({ year, month: mon, categoryId, targetAmount })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { categoryId, month: monthStr } = await req.json();
  const [year, mon] = monthStr.split("-").map(Number);
  await db.delete(budgetTargets).where(
    and(eq(budgetTargets.year, year), eq(budgetTargets.month, mon), eq(budgetTargets.categoryId, categoryId))
  );
  return NextResponse.json({ ok: true });
}
