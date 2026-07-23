import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, recurringItems, debts, categories } from "@/db/schema";
import { like, or, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ transactions: [], recurring: [], debts: [], categories: [] });

  const pattern = `%${q}%`;

  const [txns, recurring, debtResults, catResults] = await Promise.all([
    db
      .select({ id: transactions.id, description: transactions.description, amount: transactions.amount, date: transactions.date, direction: transactions.direction })
      .from(transactions)
      .where(or(like(transactions.description, pattern), like(transactions.rawDescription, pattern)))
      .orderBy(desc(transactions.date))
      .limit(5),

    db
      .select({ id: recurringItems.id, name: recurringItems.name, amount: recurringItems.amount, type: recurringItems.type })
      .from(recurringItems)
      .where(like(recurringItems.name, pattern))
      .limit(3),

    db
      .select({ id: debts.id, name: debts.name, startingBalance: debts.startingBalance })
      .from(debts)
      .where(like(debts.name, pattern))
      .limit(3),

    db
      .select({ id: categories.id, name: categories.name, group: categories.group, color: categories.color })
      .from(categories)
      .where(like(categories.name, pattern))
      .limit(3),
  ]);

  return NextResponse.json({ transactions: txns, recurring, debts: debtResults, categories: catResults });
}
