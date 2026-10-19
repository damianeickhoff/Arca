import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

// GET /api/icons/subject?kind=category|merchant&id=12
// What the icon picker shows about the thing it picks an icon for: how many
// transactions it had this year and its latest one, drawn as the preview row.
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const kind = req.nextUrl.searchParams.get("kind");
  const id = Number(req.nextUrl.searchParams.get("id"));
  if ((kind !== "category" && kind !== "merchant") || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ count: null, sample: null });
  }

  const owner = kind === "category" ? eq(transactions.categoryId, id) : eq(transactions.merchantId, id);
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(owner, gte(transactions.date, yearStart)));

  const [latest] = await db
    .select({
      description: transactions.description,
      customName: transactions.customName,
      date: transactions.date,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      direction: transactions.direction,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(owner)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(1);

  const sample = latest
    ? {
        name: latest.customName || latest.description,
        date: latest.date,
        categoryName: latest.categoryName,
        amount: Math.abs(latest.correctedAmount ?? latest.amount) * (latest.direction === "expense" ? -1 : 1),
      }
    : null;

  return NextResponse.json({ count: Number(count) || 0, sample });
}
