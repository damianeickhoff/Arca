import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debts, debtRecurring, recurringItems } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import type { Debt } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { findRecurringItemByName } from "@/lib/recurring-dedupe";
import { computeDebtBillEndDate } from "@/app/debts/debt-shared";

// Push the debt's start date, derived due-day and computed last-payment (end) date onto
// every linked recurring bill, so a debt and its bills always share one period. The debt's
// computed end date is leading — see computeDebtBillEndDate — hence bills can't set their
// own end date (the recurring editor hides it for linked/debt bills).
async function syncLinkedBillsPeriod(debt: Debt, billIds: number[]) {
  if (billIds.length === 0) return;
  const startDate = debt.startDate ?? `${debt.startMonth}-01`;
  const dueDay = Number(startDate.slice(8, 10)) || 1;
  const endDate = computeDebtBillEndDate(startDate, debt.startingBalance, debt.minimumPayment);
  await db.update(recurringItems).set({ startDate, dueDay, endDate }).where(inArray(recurringItems.id, billIds));
}

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db.select().from(debts).orderBy(asc(debts.name));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { recurringIds, createRecurringBill, recurringCategoryId, recurringBudgetType, ...data } = await req.json();
  const [row] = await db.insert(debts).values(data).returning();

  const linkIds: number[] = Array.isArray(recurringIds) ? [...recurringIds] : [];
  if (createRecurringBill) {
    // Reuse an existing bill with the same name instead of creating a duplicate
    // (see recurring-dedupe.ts) — otherwise create one from the debt's own fields.
    const existing = await findRecurringItemByName(data.name ?? "");
    if (existing) {
      if (!linkIds.includes(existing.id)) linkIds.push(existing.id);
    } else {
      // syncLinkedBillsPeriod below is what keeps every linked bill aligned with the
      // debt, but the period is written here too so the row is never briefly (or, if
      // linking fails, permanently) left without the start date the user just entered.
      const startDate: string | null = row.startDate ?? (row.startMonth ? `${row.startMonth}-01` : null);
      const [bill] = await db
        .insert(recurringItems)
        .values({
          name: data.name,
          type: "debt",
          amount: data.minimumPayment || 0,
          frequency: "monthly",
          budgetType: recurringBudgetType || "nodig",
          categoryId: recurringCategoryId ?? null,
          notes: data.notes ?? null,
          startDate,
          dueDay: startDate ? Number(startDate.slice(8, 10)) || 1 : null,
          active: true,
          source: "manual",
        })
        .returning();
      linkIds.push(bill.id);
    }
  }
  if (linkIds.length > 0) {
    await db.insert(debtRecurring).values(linkIds.map((rid) => ({ debtId: row.id, recurringItemId: rid })));
    await syncLinkedBillsPeriod(row, linkIds);
  }
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, recurringIds, recurringCategoryId, recurringBudgetType, createRecurringBill, ...data } = await req.json();
  void recurringCategoryId; void recurringBudgetType; void createRecurringBill;
  const [row] = await db.update(debts).set(data).where(eq(debts.id, id)).returning();
  // Replace the recurring-bill links
  await db.delete(debtRecurring).where(eq(debtRecurring.debtId, id));
  if (Array.isArray(recurringIds) && recurringIds.length > 0) {
    await db.insert(debtRecurring).values(recurringIds.map((rid: number) => ({ debtId: id, recurringItemId: rid })));
    // Keep the linked bills' start/end dates in sync with the (possibly changed) debt.
    await syncLinkedBillsPeriod(row, recurringIds);
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
