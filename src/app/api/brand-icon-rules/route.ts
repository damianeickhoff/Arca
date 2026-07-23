import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { brandIconRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db.select().from(brandIconRules).orderBy(brandIconRules.namePattern);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const [row] = await db.insert(brandIconRules).values(body).returning();
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, ...data } = await req.json();
  const [row] = await db.update(brandIconRules).set(data).where(eq(brandIconRules.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();
  await db.delete(brandIconRules).where(eq(brandIconRules.id, id));
  return NextResponse.json({ ok: true });
}
