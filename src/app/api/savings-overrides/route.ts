import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { savingsMonthOverrides } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const month = req.nextUrl.searchParams.get("month");
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });
  const rows = await db.select().from(savingsMonthOverrides).where(eq(savingsMonthOverrides.month, month));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { goalId, month, overrideAmount } = await req.json();
  const [row] = await db
    .insert(savingsMonthOverrides)
    .values({ goalId, month, overrideAmount })
    .onConflictDoUpdate({
      target: [savingsMonthOverrides.goalId, savingsMonthOverrides.month],
      set: { overrideAmount: sql`excluded.override_amount` },
    })
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { goalId, month } = await req.json();
  await db.delete(savingsMonthOverrides).where(
    and(eq(savingsMonthOverrides.goalId, goalId), eq(savingsMonthOverrides.month, month))
  );
  return NextResponse.json({ ok: true });
}
