import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { merchants, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { resolveMerchantIdFor } from "@/lib/merchants";

// GET /api/merchants/for-transaction?transactionId=123
// Returns { merchant: Merchant | null } for one transaction. When the transaction has
// no merchant yet, one is derived from its description and linked on the spot — so
// opening a transaction detail is enough to heal a row the backfill couldn't reach.
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const transactionId = parseInt(req.nextUrl.searchParams.get("transactionId") ?? "", 10);
  if (Number.isNaN(transactionId)) return NextResponse.json({ error: "Missing transactionId" }, { status: 400 });

  const [row] = await db
    .select({
      id: transactions.id,
      merchantId: transactions.merchantId,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
      isManualTransfer: transactions.isManualTransfer,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId));
  if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  let merchantId = row.merchantId;
  if (merchantId == null && !row.isManualTransfer) {
    merchantId = await resolveMerchantIdFor(row);
    if (merchantId != null) {
      await db.update(transactions).set({ merchantId }).where(eq(transactions.id, transactionId));
    }
  }
  if (merchantId == null) return NextResponse.json({ merchant: null });

  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
  return NextResponse.json({ merchant: merchant ?? null });
}
