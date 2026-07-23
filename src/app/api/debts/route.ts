import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debts, debtRecurring, recurringItems } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { findRecurringItemByName } from "@/lib/recurring-dedupe";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db.select().from(debts).orderBy(asc(debts.name));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { recurringIds, createRecurringBill, ...data } = await req.json();
  const [row] = await db.insert(debts).values(data).returning();

  const linkIds: number[] = Array.isArray(recurringIds) ? [...recurringIds] : [];
  if (createRecurringBill) {
    // Reuse an existing bill with the same name instead of creating a duplicate
    // (see recurring-dedupe.ts) — otherwise create one from the debt's own fields.
    const existing = await findRecurringItemByName(data.name ?? "");
    if (existing) {
      if (!linkIds.includes(existing.id)) linkIds.push(existing.id);
    } else {
      const [bill] = await db
        .insert(recurringItems)
        .values({
          name: data.name,
          type: "debt",
          amount: data.minimumPayment || 0,
          frequency: "monthly",
          budgetType: "nodig",
          active: true,
          startDate: `${data.startMonth}-01`,
          dueDay: 1,
          source: "manual",
        })
        .returning();
      linkIds.push(bill.id);
    }
  }
  if (linkIds.length > 0) {
    await db.insert(debtRecurring).values(linkIds.map((rid) => ({ debtId: row.id, recurringItemId: rid })));
  }
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, recurringIds, ...data } = await req.json();
  const [row] = await db.update(debts).set(data).where(eq(debts.id, id)).returning();
  // Replace the recurring-bill links
  await db.delete(debtRecurring).where(eq(debtRecurring.debtId, id));
  if (Array.isArray(recurringIds) && recurringIds.length > 0) {
    await db.insert(debtRecurring).values(recurringIds.map((rid: number) => ({ debtId: id, recurringItemId: rid })));
  }
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();
  await db.delete(debts).where(eq(debts.id, id));
  return NextResponse.json({ ok: true });
}
