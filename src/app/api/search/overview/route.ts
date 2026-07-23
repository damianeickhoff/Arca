import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, banks, categories } from "@/db/schema";
import { and, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

// Powers the default (empty-query) view of the global search overlay:
// the Categories / Accounts / Brands cards, each with live 30-day activity.
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  // 30-day window on the day-granular `date` column.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const since = cutoff.toISOString().slice(0, 10);

  // Transaction-derived running balance plus the account's manually-set opening
  // balance (see banks.startingBalance) — display only, never used in reports.
  // Transactions on/before banks.startingDate are the ones the opening balance was
  // recorded from, so they're excluded to avoid double-counting on top of it.
  const signedAmount = sql<number>`COALESCE(${banks.startingBalance}, 0) + COALESCE(SUM(CASE
    WHEN ${banks.startingDate} IS NOT NULL AND ${transactions.date} <= ${banks.startingDate} THEN 0
    WHEN ${transactions.direction} = 'income' THEN ${transactions.amount}
    ELSE -${transactions.amount}
  END), 0)`;

  const [catRows, accountRows, brandRows] = await Promise.all([
    // Top categories by transaction count over the last 30 days.
    db
      .select({
        id: categories.id,
        name: categories.name,
        icon: categories.icon,
        color: categories.color,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(gte(transactions.date, since))
      .groupBy(categories.id)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(6),

    // Every account with its running balance and most recent activity.
    db
      .select({
        accountNumber: banks.accountNumber,
        displayName: banks.displayName,
        cardType: banks.cardType,
        balance: signedAmount,
        lastAt: sql<string | null>`MAX(${transactions.createdAt})`,
        lastDate: sql<string | null>`MAX(${transactions.date})`,
      })
      .from(banks)
      .leftJoin(transactions, eq(transactions.account, banks.accountNumber))
      .where(isNotNull(banks.accountNumber))
      .groupBy(banks.id)
      .orderBy(desc(sql`MAX(${transactions.createdAt})`))
      .limit(8),

    // Top brands by transaction count over the last 30 days.
    db
      .select({
        iconKey: transactions.brandIcon,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(gte(transactions.date, since), isNotNull(transactions.brandIcon), ne(transactions.brandIcon, "")))
      .groupBy(transactions.brandIcon)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(6),
  ]);

  return NextResponse.json({
    categories: catRows,
    accounts: accountRows,
    brands: brandRows,
  });
}
