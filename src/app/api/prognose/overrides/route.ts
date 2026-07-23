import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { prognoseOverrides } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const from  = searchParams.get("from");
  const to    = searchParams.get("to");

  if (month) {
    const rows = await db.select().from(prognoseOverrides)
      .where(eq(prognoseOverrides.month, month));
    return NextResponse.json(rows);
  }

  if (from && to) {
    const rows = await db.select().from(prognoseOverrides)
      .where(and(gte(prognoseOverrides.month, from), lte(prognoseOverrides.month, to)));
    return NextResponse.json(rows);
  }

  const rows = await db.select().from(prognoseOverrides);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { recurringItemId, month, amount } = await req.json();

  // Upsert via delete + insert
  await db.delete(prognoseOverrides).where(
    and(
      eq(prognoseOverrides.recurringItemId, recurringItemId),
      eq(prognoseOverrides.month, month),
    ),
  );

  const [row] = await db.insert(prognoseOverrides)
    .values({ recurringItemId, month, amount })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { recurringItemId, month } = await req.json();

  await db.delete(prognoseOverrides).where(
    and(
      eq(prognoseOverrides.recurringItemId, recurringItemId),
      eq(prognoseOverrides.month, month),
    ),
  );

  return NextResponse.json({ ok: true });
}
