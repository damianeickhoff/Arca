import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { variablePrognoseOverrides } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { categoryId, month, overrideAmount } = await req.json();

  // Upsert via delete + insert
  await db.delete(variablePrognoseOverrides).where(
    and(
      eq(variablePrognoseOverrides.categoryId, categoryId),
      eq(variablePrognoseOverrides.month, month),
    ),
  );

  const [row] = await db.insert(variablePrognoseOverrides)
    .values({ categoryId, month, overrideAmount })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { categoryId, month } = await req.json();

  await db.delete(variablePrognoseOverrides).where(
    and(
      eq(variablePrognoseOverrides.categoryId, categoryId),
      eq(variablePrognoseOverrides.month, month),
    ),
  );

  return NextResponse.json({ ok: true });
}
