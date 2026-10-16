import { NextRequest, NextResponse } from "next/server";
import { and, desc, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { banks, transactionSplits, transactions } from "@/db/schema";
import type { Bank, CategoryRule } from "@/db/schema";
import { matchRules } from "@/lib/apply-rules";
import { requireAuth } from "@/lib/auth";
import { transactionIdRef } from "@/lib/reimbursed-amount";

const EXAMPLES = 3;

/** A number from the query string, or null when it's missing or not a number. */
function num(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Escapes LIKE's wildcards so a "%" or "_" in a pattern matches itself. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * GET /api/category-rules/preview — what a rule being edited would match, for the
 * rule dialog's live "Matches N earlier transactions" line. Takes the rule's own
 * fields (pattern, match = contains | word | exact, amount or amountMin/amountMax,
 * direction, bankId) and runs them through matchRules, the same function the
 * apply-rules pass uses, so the count is exactly what saving would match. Split
 * transactions are left out, as that pass leaves them out. `ids=1` adds every matched id.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const params = req.nextUrl.searchParams;
  const pattern = (params.get("pattern") ?? "").trim();
  const match = params.get("match");
  const direction = params.get("direction");
  const bankId = num(params.get("bankId"));
  if (!pattern && bankId == null) return NextResponse.json({ count: 0, uncategorized: 0, examples: [] });

  const rule: CategoryRule = {
    id: 0,
    categoryId: 0,
    namePattern: pattern || null,
    nameWildcard: match !== "exact",
    nameWholeWord: match === "word",
    amount: num(params.get("amount")),
    amountMin: num(params.get("amountMin")),
    amountMax: num(params.get("amountMax")),
    direction: direction === "income" || direction === "expense" ? direction : null,
    bankId,
    createdAt: null,
  };

  // Narrow in SQL first (a whole-word match is always a "contains" match too), then let
  // matchRules decide — it's the source of truth for whole words, amounts and banks.
  const lower = pattern.toLowerCase();
  const nameFilter = !pattern
    ? undefined
    : match === "exact"
      ? sql`lower(trim(${transactions.description})) = ${lower}`
      : sql`${transactions.description} LIKE ${`%${escapeLike(pattern)}%`} ESCAPE '\\'`;

  const [rows, allBanks] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
        direction: transactions.direction,
        account: transactions.account,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(
        and(
          nameFilter,
          // transactionIdRef, not ${transactions.id}: in a single-table select Drizzle
          // renders a bare "id", which inside this subquery means transaction_splits.id.
          notExists(db.select({ one: sql`1` }).from(transactionSplits).where(sql`${transactionSplits.transactionId} = ${transactionIdRef}`)),
        ),
      )
      .orderBy(desc(transactions.date), desc(transactions.id)),
    db.select().from(banks),
  ]);

  const banksByAccountNumber = new Map<string, Bank>();
  for (const bank of allBanks) if (bank.accountNumber) banksByAccountNumber.set(bank.accountNumber, bank);

  const matched = rows.filter((r) => matchRules(r.description, r.amount, r.direction, r.account, [rule], banksByAccountNumber) != null);
  return NextResponse.json({
    count: matched.length,
    uncategorized: matched.filter((r) => r.categoryId == null).length,
    examples: matched.slice(0, EXAMPLES).map(({ id, date, description, amount, direction }) => ({ id, date, description, amount, direction })),
    // Every id only when asked: the dialog's save moves them, the live preview doesn't need them.
    ...(params.get("ids") === "1" ? { ids: matched.map((r) => r.id) } : {}),
  });
}
