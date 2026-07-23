import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { requireAuth } from "@/lib/auth";

/** GET /api/transactions/summary?month=YYYY-MM */
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month");

  const conditions = [];
  if (month) {
    conditions.push(gte(transactions.date, `${month}-01`));
    conditions.push(lte(transactions.date, `${month}-31`));
  }

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryGroup: categories.group,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(conditions.length ? and(...conditions) : undefined);

  const splitRows = await getTransactionSplitRows(rows.map((row) => row.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(rows, splitMap);

  const totals = Array.from(
    allocations
      .filter((row) => !row.isInternalTransfer)
      .reduce((map, row) => {
        map.set(row.direction, (map.get(row.direction) ?? 0) + row.amount);
        return map;
      }, new Map<string, number>()),
  ).map(([direction, total]) => ({ direction, total }));

  // By category
  const byCategory = Array.from(
    allocations
      .filter((row) => !row.isInternalTransfer)
      .reduce((map, row) => {
        const key = `${row.direction}:${row.categoryId ?? "null"}:${row.categoryName ?? ""}`;
        const current = map.get(key) ?? {
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          categoryGroup: row.categoryGroup,
          direction: row.direction,
          total: 0,
        };
        current.total += row.amount;
        map.set(key, current);
        return map;
      }, new Map<string, { categoryId: number | null; categoryName: string | null; categoryGroup: string | null; direction: string; total: number }>()),
  )
    .map(([, value]) => value)
    .sort((left, right) => right.total - left.total);

  // Monthly aggregates for the current year
  const currentYear = month ? month.slice(0, 4) : new Date().getFullYear().toString();
  const monthlyRows = rows.filter((row) => row.date >= `${currentYear}-01-01`);
  const monthly = Array.from(
    buildSplitAllocations(monthlyRows, splitMap)
      .filter((row) => !row.isInternalTransfer)
      .reduce((map, row) => {
        const key = `${row.date.slice(0, 7)}:${row.direction}`;
        const current = map.get(key) ?? { month: row.date.slice(0, 7), direction: row.direction, total: 0 };
        current.total += row.amount;
        map.set(key, current);
        return map;
      }, new Map<string, { month: string; direction: string; total: number }>()),
  )
    .map(([, value]) => value)
    .sort((left, right) => left.month.localeCompare(right.month));

  return NextResponse.json({ totals, byCategory, monthly });
}
