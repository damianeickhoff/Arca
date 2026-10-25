import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { desc, or, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { transactionMatchesRecurringItem } from "@/lib/recurring-match";
import { recurringItemPatterns } from "@/lib/recurring-patterns";

/** How many matching charges the preview hands back (the "Last 12 charges" chart). */
const LIMIT = 12;

function amountParam(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// The transactions a recurring item WOULD match, before it is saved: the editor sends
// its match pattern and amount rule while you type, and gets back how many past
// transactions match plus the latest ones for the "Last 12 charges" chart. Matching is
// the exact rule apply-rules uses to link transactions once the item is saved
// (transactionMatchesRecurringItem on the description and amount), so the preview shows
// what saving will link. SQL only narrows by the patterns; the rule itself runs here.
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const p = req.nextUrl.searchParams;
  // The main pattern plus every extra name (`alt`, repeated): all names together.
  const matcher = {
    matchPattern: (p.get("pattern") ?? "").trim() || null,
    altMatchPatterns: p.getAll("alt"),
    matchWholeWord: p.get("wholeWord") === "1",
    matchAmount: amountParam(p.get("amount")),
    matchAmountMin: amountParam(p.get("min")),
    matchAmountMax: amountParam(p.get("max")),
  };
  const patterns = recurringItemPatterns(matcher);
  if (patterns.length === 0) return NextResponse.json({ total: 0, rows: [] });

  const likes = patterns.map((pattern) => {
    const like = `%${pattern.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return sql`lower(${transactions.description}) like ${like} escape '\\'`;
  });
  const candidates = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      description: transactions.description,
    })
    .from(transactions)
    .where(or(...likes))
    .orderBy(desc(transactions.date), desc(transactions.id));

  const matches = candidates.filter((t) => transactionMatchesRecurringItem(t.description, t.amount, matcher));
  return NextResponse.json({
    total: matches.length,
    rows: matches.slice(0, LIMIT).map(({ id, date, amount, correctedAmount }) => ({ id, date, amount, correctedAmount })),
  });
}
