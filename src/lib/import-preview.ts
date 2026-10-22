import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { banks, transactions } from "@/db/schema";
import { detectAndParse, type ParsedRow } from "@/lib/bank-parsers";
import { cleanLines, splitDelimited } from "@/lib/bank-parsers/types";
import { findMatchingProfile, parseWithMapping, type ColumnMapping } from "@/lib/import-profiles";
import { HEADER_ROW_CHOICES, detectCsvLayout } from "@/lib/import-parse";
import { cacheRawImport } from "@/lib/import-raw-cache";
import { normalizeAccountNumber } from "@/lib/internal-transfers";
import { isValidISODate } from "@/lib/date-valid";
import { maskAccountNumber } from "@/lib/format";

// One place that decides what an uploaded CSV is — a built-in bank export, a file a
// saved import profile recognises, or something the user has to map — shared by the
// one-shot import (/api/import, also used by the register wizard) and the Import
// page's two-step flow (/api/import/preview → /api/import/confirm).

/** Where the rows came from: a built-in bank parser or a saved import profile. */
export type ImportSource =
  | { kind: "bank"; label: string }
  | { kind: "profile"; id: number; label: string };

export type ResolvedImport =
  | { kind: "rows"; rows: ParsedRow[]; source: ImportSource }
  /** `prefill` seeds the mapping dialog with a mapping we already have but can't
   *  trust — a saved profile that stopped producing readable dates. */
  | { kind: "needsMapping"; prefill?: ColumnMapping };

/**
 * Built-in parsers first, then a saved profile for the same header shape. A profile
 * whose mapping no longer reads the dates sends the user back to the mapping dialog
 * with it prefilled — importing it anyway is how bad dates got into the database.
 * Throws when a parser or the mapping itself fails on the file.
 */
export async function resolveImport(text: string): Promise<ResolvedImport> {
  const parsed = detectAndParse(text);
  if (parsed) return { kind: "rows", rows: parsed.rows, source: { kind: "bank", label: parsed.label } };

  const profile = await findMatchingProfile(text);
  if (profile) {
    const mapped = parseWithMapping(text, profile.mapping);
    if (mapped.invalid.length > 0) return { kind: "needsMapping", prefill: profile.mapping };
    return { kind: "rows", rows: mapped.rows, source: { kind: "profile", id: profile.id, label: profile.label } };
  }

  return { kind: "needsMapping" };
}

export interface MappingRequest {
  needsMapping: true;
  rawId: string;
  delimiter: string;
  /** The row holding the column names: the saved profile's, else a detected one. */
  headerRow: number;
  /** The file's first lines, split — enough to pick any header row and preview the
   *  rows under it. */
  rows: string[][];
  prefill: ColumnMapping | null;
}

/** Rows shown under the header in the mapping dialog. */
const MAPPING_PREVIEW_ROWS = 5;

/** The file handed back to the client so the user can map its columns; null for an
 *  empty file. */
export function mappingRequest(text: string, prefill?: ColumnMapping): MappingRequest | null {
  const lines = cleanLines(text).filter((l) => l.trim());
  if (lines.length === 0) return null;
  const { delimiter, headerRow: detected } = detectCsvLayout(lines);
  const prefillRow = prefill?.headerRow;
  const headerRow = typeof prefillRow === "number" && prefillRow >= 0 && prefillRow < Math.min(lines.length, HEADER_ROW_CHOICES) ? prefillRow : detected;
  return {
    needsMapping: true,
    rawId: cacheRawImport(text),
    delimiter,
    headerRow,
    rows: lines.slice(0, HEADER_ROW_CHOICES + MAPPING_PREVIEW_ROWS).map((l) => splitDelimited(l, delimiter)),
    prefill: prefill ?? null,
  };
}

/** How many of a file's rows the Check step shows. */
export const PREVIEW_ROW_COUNT = 6;

export type PreviewRowStatus = "new" | "duplicate" | "invalidDate";

export interface PreviewRow {
  date: string;
  name: string;
  /** Signed: money out is negative. */
  amount: number;
  balance: number | null;
  status: PreviewRowStatus;
}

export interface ImportPreview {
  preview: true;
  rawId: string;
  source: ImportSource;
  total: number;
  newCount: number;
  duplicateCount: number;
  invalidDates: number;
  /** Date range of the readable rows (ISO), null when there are none. */
  from: string | null;
  to: string | null;
  /** The accounts in the file: the account's name when Centje knows it, else its masked number. */
  accounts: string[];
  rows: PreviewRow[];
}


/**
 * What importing these rows would do, without writing anything: which rows are new,
 * which are already in the database (or repeated in the file — the import's unique
 * hash skips those just the same) and which carry a date that can't be read.
 */
export async function buildImportPreview(text: string, rows: ParsedRow[], source: ImportSource): Promise<ImportPreview> {
  const hashes = [...new Set(rows.map((r) => r.hash))];
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += 500) {
    const found = await db
      .select({ hash: transactions.importHash })
      .from(transactions)
      .where(inArray(transactions.importHash, hashes.slice(i, i + 500)));
    for (const f of found) if (f.hash) existing.add(f.hash);
  }

  const seen = new Set<string>();
  let newCount = 0;
  let duplicateCount = 0;
  let invalidDates = 0;
  let from: string | null = null;
  let to: string | null = null;
  const statuses: PreviewRowStatus[] = rows.map((row) => {
    if (!isValidISODate(row.date)) {
      invalidDates++;
      return "invalidDate";
    }
    if (!from || row.date < from) from = row.date;
    if (!to || row.date > to) to = row.date;
    if (existing.has(row.hash) || seen.has(row.hash)) {
      duplicateCount++;
      return "duplicate";
    }
    seen.add(row.hash);
    newCount++;
    return "new";
  });

  const accountNumbers = [...new Set(rows.map((r) => normalizeAccountNumber(r.account)).filter((a): a is string => a != null))];
  const known = accountNumbers.length > 0
    ? await db.select({ accountNumber: banks.accountNumber, displayName: banks.displayName }).from(banks).where(inArray(banks.accountNumber, accountNumbers))
    : [];
  const names = new Map(known.map((b) => [b.accountNumber, b.displayName]));
  const accounts = accountNumbers.map((a) => {
    const name = names.get(a)?.trim();
    return name ? `${name} ${maskAccountNumber(a)}` : maskAccountNumber(a);
  });

  return {
    preview: true,
    rawId: cacheRawImport(text),
    source,
    total: rows.length,
    newCount,
    duplicateCount,
    invalidDates,
    from,
    to,
    accounts,
    rows: rows.slice(0, PREVIEW_ROW_COUNT).map((row, i) => ({
      date: row.date,
      name: row.name,
      amount: row.direction === "expense" ? -row.amount : row.amount,
      balance: row.reportedBalance ?? null,
      status: statuses[i],
    })),
  };
}
