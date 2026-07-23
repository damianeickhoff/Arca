import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, reimbursements, categories } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const view = req.nextUrl.searchParams.get("view");

  if (view === "unlinked") {
    // Tikkie transactions (isReimbursement=true) with no entry in reimbursements table
    const rows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        description: transactions.description,
        rawDescription: transactions.rawDescription,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.isReimbursement, true),
          sql`NOT EXISTS (SELECT 1 FROM reimbursements r WHERE r.reimbursement_transaction_id = ${transactions.id})`
        )
      )
      .orderBy(sql`${transactions.date} desc`);
    return NextResponse.json(rows);
  }

  if (view === "open" || view === "closed") {
    // Expenses that have at least one linked reimbursement
    const rows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        description: transactions.description,
        categoryName: categories.name,
        categoryColor: categories.color,
        linkedAmount: sql<number>`COALESCE((SELECT sum(r2.amount) FROM reimbursements r2 WHERE r2.original_transaction_id = ${transactions.id}), 0)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        sql`EXISTS (SELECT 1 FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id})`
      )
      .orderBy(sql`${transactions.date} desc`);

    const filtered = rows.filter((r) =>
      view === "open"
        ? r.linkedAmount < r.amount - 0.01
        : r.linkedAmount >= r.amount - 0.01
    );
    return NextResponse.json(filtered);
  }

  // Default: return all reimbursement links with transaction details
  const rows = await db
    .select({
      id: reimbursements.id,
      amount: reimbursements.amount,
      createdAt: reimbursements.createdAt,
      reimbursementTransactionId: reimbursements.reimbursementTransactionId,
      originalTransactionId: reimbursements.originalTransactionId,
    })
    .from(reimbursements)
    .orderBy(sql`${reimbursements.createdAt} desc`);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const { reimbursementTransactionId, originalTransactionId, amount, expectedReimbursement } = body;

  if (!reimbursementTransactionId || !originalTransactionId || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const [row] = await db
    .insert(reimbursements)
    .values({ reimbursementTransactionId, originalTransactionId, amount })
    .returning();

  // Store how much of this expense is expected back (other person's share)
  if (expectedReimbursement != null) {
    await db
      .update(transactions)
      .set({ expectedReimbursement })
      .where(eq(transactions.id, originalTransactionId));
  }

  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.delete(reimbursements).where(eq(reimbursements.id, id));
  return NextResponse.json({ ok: true });
}
