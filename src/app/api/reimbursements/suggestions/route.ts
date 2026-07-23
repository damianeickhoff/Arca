import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, reimbursements, categories } from "@/db/schema";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { shiftDate } from "@/lib/date-range";

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const transactionId = req.nextUrl.searchParams.get("transactionId");
  if (!transactionId) {
    return NextResponse.json({ error: "Missing transactionId" }, { status: 400 });
  }

  // Load the reimbursement transaction + how much is already allocated to expenses
  const [tikkie] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      allocatedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.reimbursement_transaction_id = ${transactions.id}), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.id, Number(transactionId)))
    .limit(1);

  if (!tikkie) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const remainingBalance = tikkie.amount - tikkie.allocatedAmount;

  // Look back up to 14 days before the Tikkie date. String-based shift, not
  // Date#setDate + toISOString — the latter round-trips through UTC and can land on
  // the wrong calendar day depending on the server's timezone offset.
  const windowStartStr = shiftDate(tikkie.date, -14);

  // Find expense transactions within the window that aren't fully covered yet
  const suggestions = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      expectedReimbursement: transactions.expectedReimbursement,
      description: transactions.description,
      categoryName: categories.name,
      categoryColor: categories.color,
      alreadyLinked: sql<number>`COALESCE((
        SELECT sum(r.amount) FROM reimbursements r
        WHERE r.original_transaction_id = ${transactions.id}
      ), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.direction, "expense"),
        gte(transactions.date, windowStartStr),
        lte(transactions.date, tikkie.date),
        // expense amount must be >= remaining Tikkie balance
        sql`${transactions.amount} >= ${remainingBalance}`,
        // remaining capacity (uses expectedReimbursement if set) must fit the remaining balance
        sql`(COALESCE(${transactions.expectedReimbursement}, ${transactions.amount}) - COALESCE((
          SELECT sum(r.amount) FROM reimbursements r
          WHERE r.original_transaction_id = ${transactions.id}
        ), 0)) >= ${remainingBalance - 0.01}`
      )
    )
    .orderBy(sql`${transactions.date} desc`);

  return NextResponse.json(suggestions);
}
