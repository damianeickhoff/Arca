import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { like, and, eq, desc } from "drizzle-orm";

// GET /api/merchant-stats?q=ALBERT+HEIJN&direction=expense
// Returns total + full transaction list filtered by direction (expense or income).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const direction = req.nextUrl.searchParams.get("direction")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ total: 0, count: 0, transactions: [] });
  }

  const whereClause = direction
    ? and(like(transactions.description, `%${q}%`), eq(transactions.direction, direction as "expense" | "income"))
    : like(transactions.description, `%${q}%`);

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      direction: transactions.direction,
      isReimbursement: transactions.isReimbursement,
    })
    .from(transactions)
    .where(whereClause)
    .orderBy(desc(transactions.date), desc(transactions.id));

  const total = rows.reduce((sum, r) => {
    if (r.isReimbursement) return sum;
    return sum + (r.correctedAmount ?? r.amount);
  }, 0);

  return NextResponse.json({ total, count: rows.length, transactions: rows });
}
