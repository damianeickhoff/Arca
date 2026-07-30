import { db } from "@/db";
import { transactions } from "@/db/schema";
import { sql, asc } from "drizzle-orm";
import { isValidISODate } from "@/lib/date-valid";

export interface BrokenDateRow {
  id: number;
  date: string;
  description: string;
  amount: number;
  direction: string;
  account: string | null;
  source: string;
}

/**
 * Transactions whose `date` isn't a real YYYY-MM-DD — the residue of a CSV imported with
 * the date mapped to the wrong column, before the import path started rejecting those.
 *
 * Such rows are close to unreachable in the normal UI: the transactions list filters by
 * `date >= from AND date <= to` on a TEXT column, so a value like "Albert Heijn" sorts
 * outside every range and simply doesn't appear. This query deliberately applies no date
 * filter at all, which is the only way to get at them.
 */
export async function findBrokenDateTransactions(): Promise<BrokenDateRow[]> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      direction: transactions.direction,
      account: transactions.account,
      source: transactions.source,
    })
    .from(transactions)
    // Two different kinds of wrong: the wrong *shape* ("Albert Heijn 1177"), caught by
    // GLOB, and the right shape but an impossible day ("2026-13-45"), caught by SQLite's
    // own date() — which returns NULL for a date it can't make sense of. The condition
    // must be broad rather than exact; isValidISODate below is the actual authority, and
    // it only ever sees rows this WHERE lets through.
    .where(sql`
      ${transactions.date} NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      OR date(${transactions.date}) IS NULL
      OR date(${transactions.date}) <> ${transactions.date}
    `)
    .orderBy(asc(transactions.id));

  return rows.filter((row) => !isValidISODate(row.date));
}

/** Same rows, but only how many — for a badge or an "all clear" check. */
export async function countBrokenDateTransactions(): Promise<number> {
  return (await findBrokenDateTransactions()).length;
}
