import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getTransactionDetailById } from "@/lib/transaction-detail-row";

// GET /api/transactions/:id — one transaction in the detail sheet's row shape, for the
// surfaces that list transactions without carrying the whole row (the merchant and
// category profiles). Writes still go through PATCH/DELETE on /api/transactions.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const transactionId = parseInt(id, 10);
  if (Number.isNaN(transactionId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const row = await getTransactionDetailById(transactionId);
  if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  return NextResponse.json(row);
}
