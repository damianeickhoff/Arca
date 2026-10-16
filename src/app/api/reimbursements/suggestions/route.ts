import { NextRequest, NextResponse } from "next/server";
import { transactionIdRef } from "@/lib/reimbursed-amount";
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { eq, and, lte, gte, ne, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { shiftDate } from "@/lib/date-range";

const WINDOW_BEFORE_DAYS = 30;
const WINDOW_AFTER_DAYS = 7;

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
      allocatedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.reimbursement_transaction_id = ${transactionIdRef}), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.id, Number(transactionId)))
    .limit(1);

  if (!tikkie) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const remainingBalance = tikkie.amount - tikkie.allocatedAmount;
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim();

  // Without a search: the expenses from a month before the payment up to a week after
  // it (a Tikkie can arrive before you pay the bill). With one: every expense whose
  // name matches, however old. String-based date shifts, not Date#setDate +
  // toISOString — the latter round-trips through UTC and can land on the wrong
  // calendar day depending on the server's timezone offset.
  const linked = sql`COALESCE((
    SELECT sum(r.amount) FROM reimbursements r
    WHERE r.original_transaction_id = ${transactionIdRef}
  ), 0)`;
  const scope = query
    ? sql`${transactions.description} LIKE ${`%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} ESCAPE '\\'`
    : and(gte(transactions.date, shiftDate(tikkie.date, -WINDOW_BEFORE_DAYS)), lte(transactions.date, shiftDate(tikkie.date, WINDOW_AFTER_DAYS)));

  // Expenses that still have something left to pay back. No amount filter beyond that:
  // one payment may cover part of a bigger expense, or several smaller ones (the old
  // "expense >= this payment" rule hid every expense smaller than the money that came
  // in). Same-amount and half-amount matches sort first, then the newest.
  const suggestions = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      expectedReimbursement: transactions.expectedReimbursement,
      description: transactions.description,
      categoryName: categories.name,
      categoryColor: categories.color,
      alreadyLinked: sql<number>`${linked}`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.direction, "expense"),
        ne(transactions.id, tikkie.id),
        scope,
        sql`(COALESCE(${transactions.expectedReimbursement}, ${transactions.amount}) - ${linked}) > 0.005`,
      ),
    )
    .orderBy(
      sql`CASE WHEN abs(${transactions.amount} - ${remainingBalance}) < 0.005 THEN 0 WHEN abs(${transactions.amount} / 2 - ${remainingBalance}) < 0.005 THEN 1 ELSE 2 END`,
      sql`${transactions.date} desc`,
      sql`${transactions.id} desc`,
    )
    .limit(query ? 50 : 100);

  return NextResponse.json(suggestions);
}
