import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db.select().from(goals).orderBy(goals.name);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const [row] = await db.insert(goals).values(body).returning();
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, ...data } = await req.json();
  const [row] = await db.update(goals).set(data).where(eq(goals.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();
  await db.delete(goals).where(eq(goals.id, id));
  return NextResponse.json({ ok: true });
}
