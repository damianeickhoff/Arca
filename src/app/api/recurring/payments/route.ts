import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { billPayments } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { offsetFinancialMonth, currentFinancialMonth } from "@/lib/date-range";
import { getFinancialMonthConfig } from "@/lib/app-settings";

// Payment history for one recurring item: last 12 financial months, each with the
// manual mark (if any). Auto-match status for past months isn't recomputed here — the
// caller can combine this with getBillStatuses() for the current month if needed.
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const itemId = Number(req.nextUrl.searchParams.get("itemId"));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "Missing or invalid itemId" }, { status: 400 });
  }

  const financialMonth = await getFinancialMonthConfig();
  const nowMonth = currentFinancialMonth(financialMonth);
  const months = Array.from({ length: 12 }, (_, i) => offsetFinancialMonth(nowMonth, -i));

  const rows = await db
    .select()
    .from(billPayments)
    .where(eq(billPayments.recurringItemId, itemId))
    .orderBy(desc(billPayments.month));

  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const history = months.map((month) => ({
    month,
    paid: byMonth.has(month),
    paidAt: byMonth.get(month)?.paidAt ?? null,
    amount: byMonth.get(month)?.amount ?? null,
  }));

  return NextResponse.json(history);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { recurringItemId, month, amount } = await req.json();
  if (!Number.isInteger(recurringItemId) || typeof month !== "string") {
    return NextResponse.json({ error: "Missing recurringItemId or month" }, { status: 400 });
  }

  const [row] = await db
    .insert(billPayments)
    .values({ recurringItemId, month, amount: amount ?? null })
    .onConflictDoUpdate({
      target: [billPayments.recurringItemId, billPayments.month],
      set: { amount: amount ?? null },
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { recurringItemId, month } = await req.json();
  if (!Number.isInteger(recurringItemId) || typeof month !== "string") {
    return NextResponse.json({ error: "Missing recurringItemId or month" }, { status: 400 });
  }

  await db
    .delete(billPayments)
    .where(and(eq(billPayments.recurringItemId, recurringItemId), eq(billPayments.month, month)));

  return NextResponse.json({ ok: true });
}
