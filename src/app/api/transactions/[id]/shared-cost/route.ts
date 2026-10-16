import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

// GET /api/transactions/:id/shared-cost — the shared-cost state the split dialog edits:
// people sharing the expense (null = not shared) and the others' part. Writes go through
// PATCH /api/transactions with expectedReimbursement + sharedWithCount.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const transactionId = parseInt(id, 10);
  if (Number.isNaN(transactionId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [row] = await db
    .select({ sharedWithCount: transactions.sharedWithCount, expectedReimbursement: transactions.expectedReimbursement })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  return NextResponse.json(row);
}
