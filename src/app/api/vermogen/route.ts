import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vermogenAccounts } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { normalizeAccountNumber } from "@/lib/internal-transfers";
import { JOINT_TYPE, serializeMatchNames } from "@/lib/account-names";
import { markJointPaybacks } from "@/lib/joint-accounts";
import type Database from "better-sqlite3";

// A joint account was saved: mark the money it paid back, which is not income.
function afterSave(row: { type: string } | undefined) {
  if (row?.type === JOINT_TYPE) markJointPaybacks((db as unknown as { $client: Database.Database }).$client);
}

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
      icon: body.icon || null,
      color: body.color || null,
      notes: body.notes || null,
      lastUpdated: body.lastUpdated || null,
      active: body.active ?? true,
      includeInNetWorth: body.includeInNetWorth ?? true,
      accountNumber: typeof body.accountNumber === "string" ? normalizeAccountNumber(body.accountNumber) : null,
      matchNames: serializeMatchNames(body.matchNames),
    })
    .returning();
  afterSave(row);
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
      icon: data.icon !== undefined ? (data.icon || null) : undefined,
      color: data.color ?? undefined,
      notes: data.notes ?? undefined,
      lastUpdated: data.lastUpdated ?? undefined,
      active: data.active ?? undefined,
      includeInNetWorth: data.includeInNetWorth !== undefined ? !!data.includeInNetWorth : undefined,
      accountNumber: data.accountNumber !== undefined ? normalizeAccountNumber(typeof data.accountNumber === "string" ? data.accountNumber : null) : undefined,
      matchNames: data.matchNames !== undefined ? serializeMatchNames(data.matchNames) : undefined,
    })
    .where(eq(vermogenAccounts.id, id))
    .returning();
  afterSave(row);
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
