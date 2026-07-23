import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categoryRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const rows = categoryId
    ? await db.select().from(categoryRules).where(eq(categoryRules.categoryId, parseInt(categoryId)))
    : await db.select().from(categoryRules);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const [row] = await db.insert(categoryRules).values(body).returning();
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, ...data } = await req.json();
  const [row] = await db.update(categoryRules).set(data).where(eq(categoryRules.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();
  await db.delete(categoryRules).where(eq(categoryRules.id, id));
  return NextResponse.json({ ok: true });
}
