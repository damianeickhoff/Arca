import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { banks, transactions } from "@/db/schema";
import { BANK_PARSERS } from "@/lib/bank-parsers";
import { listImportProfiles } from "@/lib/import-profiles";
import { maskAccountNumber } from "@/lib/format";
import { listActivity } from "@/lib/activity-log";

/** What Settings › Import shows beside the flows: profiles, recent CSV imports, the sync log. */
export interface ImportOverview {
  /** The banks a built-in parser recognises ("ING", "Rabobank", …). */
  builtInBanks: string[];
  profiles: { id: number; label: string; columns: number; savedOn: string | null }[];
  /** Earlier CSV imports, newest first: one account on one day. */
  recent: { day: string; account: string | null; rows: number }[];
  /** Bank syncs from the change log, newest first; `error` is a failed run's code. */
  syncLog: { id: number; at: string; imported: number; skipped: number; source: string | null; error: string | null }[];
}

/** How many earlier imports and syncs the side cards list. */
const RECENT_IMPORTS = 4;
const SYNC_LOG = 6;

export async function loadImportOverview(): Promise<ImportOverview> {
  // An import is the rows of one account written on one day — the import itself isn't
  // recorded anywhere else, and that is close enough for "what did I bring in lately".
  const day = sql<string>`substr(${transactions.createdAt}, 1, 10)`;
  const [profiles, recentRows, bankRows] = await Promise.all([
    listImportProfiles(),
    db
      .select({ day, account: transactions.account, rows: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.source, "csv_import"))
      .groupBy(day, transactions.account)
      .orderBy(desc(day))
      .limit(RECENT_IMPORTS),
    db.select({ accountNumber: banks.accountNumber, displayName: banks.displayName }).from(banks),
  ]);

  const names = new Map(bankRows.map((b) => [b.accountNumber, b.displayName?.trim() || null]));

  return {
    builtInBanks: BANK_PARSERS.map((p) => p.label),
    profiles: profiles.map((p) => {
      const m = p.mapping;
      // Every column the mapping reads: date, description and amount always, the rest when set.
      const optional = [m.directionColumn, m.accountColumn, m.counterAccountColumn, m.balanceColumn];
      return {
        id: p.id,
        label: p.label,
        columns: 3 + optional.filter((c) => c != null).length,
        savedOn: p.createdAt ? p.createdAt.slice(0, 10) : null,
      };
    }),
    recent: recentRows
      .filter((r) => r.day)
      .map((r) => ({
        day: r.day,
        account: r.account ? names.get(r.account) ?? maskAccountNumber(r.account) : null,
        rows: Number(r.rows),
      })),
    syncLog: listActivity(200)
      .filter((a) => a.kind === "bankSync")
      .slice(0, SYNC_LOG)
      .map((a) => ({
        id: a.id,
        at: a.at,
        imported: a.affectedCount,
        skipped: typeof a.params.skipped === "number" ? a.params.skipped : 0,
        source: typeof a.params.source === "string" ? a.params.source : null,
        error: typeof a.params.error === "string" ? a.params.error : null,
      })),
  };
}
