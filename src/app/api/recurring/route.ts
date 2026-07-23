import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recurringItems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { applyAllRules } from "@/lib/apply-rules";
import { findRecurringItemByName } from "@/lib/recurring-dedupe";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db
    .select({
      id: recurringItems.id,
      name: recurringItems.name,
      type: recurringItems.type,
      amount: recurringItems.amount,
      frequency: recurringItems.frequency,
      dueDay: recurringItems.dueDay,
      budgetType: recurringItems.budgetType,
      active: recurringItems.active,
      notes: recurringItems.notes,
      matchPattern: recurringItems.matchPattern,
      matchAmount: recurringItems.matchAmount,
      matchAmountMin: recurringItems.matchAmountMin,
      matchAmountMax: recurringItems.matchAmountMax,
      categoryId: recurringItems.categoryId,
      friendlyName: recurringItems.friendlyName,
      icon: recurringItems.icon,
      iconColor: recurringItems.iconColor,
      source: recurringItems.source,
      dismissed: recurringItems.dismissed,
      startDate: recurringItems.startDate,
      endDate: recurringItems.endDate,
    })
    .from(recurringItems)
    .orderBy(asc(recurringItems.type), asc(recurringItems.name));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const existing = await findRecurringItemByName(body.name ?? "");
  if (existing) {
    return NextResponse.json(
      { error: "duplicate", message: `A recurring item named "${existing.name}" already exists.`, existing },
      { status: 409 },
    );
  }
  const [row] = await db.insert(recurringItems).values(body).returning();
  // Backfill existing transactions so the new item's category/link/friendly name apply.
  await applyAllRules();
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, ...data } = await req.json();
  const [row] = await db.update(recurringItems).set(data).where(eq(recurringItems.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Recurring item not found" }, { status: 404 });
  // Re-apply so pattern/amount/category edits re-flow to matching transactions.
  await applyAllRules();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();
  const [existing] = await db
    .select({ source: recurringItems.source })
    .from(recurringItems)
    .where(eq(recurringItems.id, id));
  if (!existing) return NextResponse.json({ error: "Recurring item not found" }, { status: 404 });

  if (existing.source === "auto") {
    // Soft-dismiss: keep the row (with its signature) so the detector never recreates it, but
    // deactivate it so it stops matching. Restorable via PATCH { id, dismissed: false }.
    await db
      .update(recurringItems)
      .set({ dismissed: true, active: false })
      .where(eq(recurringItems.id, id));
  } else {
    await db.delete(recurringItems).where(eq(recurringItems.id, id));
  }
  // Unlink transactions from the now-gone/inactive item (and re-flow rules).
  await applyAllRules();
  return NextResponse.json({ ok: true });
}
