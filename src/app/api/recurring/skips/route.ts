import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { billSkips } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

// "Skip October": leave one financial month's occurrence of a recurring item out of
// every total (see lib/bill-status.ts). POST skips it, DELETE takes the skip back.

async function parse(req: NextRequest) {
  const { recurringItemId, month } = await req.json().catch(() => ({}));
  if (!Number.isInteger(recurringItemId) || typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) return null;
  return { recurringItemId: recurringItemId as number, month };
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = await parse(req);
  if (!body) return NextResponse.json({ error: "Missing recurringItemId or month" }, { status: 400 });
  await db.insert(billSkips).values(body).onConflictDoNothing();
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = await parse(req);
  if (!body) return NextResponse.json({ error: "Missing recurringItemId or month" }, { status: 400 });
  await db.delete(billSkips).where(and(eq(billSkips.recurringItemId, body.recurringItemId), eq(billSkips.month, body.month)));
  return NextResponse.json({ ok: true });
}
