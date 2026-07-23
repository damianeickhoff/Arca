import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vermogenAccounts } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db
    .select()
    .from(vermogenAccounts)
    .orderBy(asc(vermogenAccounts.type), asc(vermogenAccounts.name));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const [row] = await db
    .insert(vermogenAccounts)
    .values({
      name: body.name,
      type: body.type,
      value: body.value ?? 0,
      color: body.color || null,
      notes: body.notes || null,
      lastUpdated: body.lastUpdated || null,
      active: body.active ?? true,
      includeInNetWorth: body.includeInNetWorth ?? true,
    })
    .returning();
  revalidatePath("/", "layout");
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const { id, ...data } = body;
  const [row] = await db
    .update(vermogenAccounts)
    .set({
      name: data.name ?? undefined,
      type: data.type ?? undefined,
      value: data.value ?? undefined,
      color: data.color ?? undefined,
      notes: data.notes ?? undefined,
      lastUpdated: data.lastUpdated ?? undefined,
      active: data.active ?? undefined,
      includeInNetWorth: data.includeInNetWorth !== undefined ? !!data.includeInNetWorth : undefined,
    })
    .where(eq(vermogenAccounts.id, id))
    .returning();
  revalidatePath("/", "layout");
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  await db.delete(vermogenAccounts).where(eq(vermogenAccounts.id, body.id));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
