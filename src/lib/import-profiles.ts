import { db } from "@/db";
import { importProfiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { cleanLines, guessDelimiter, splitDelimited, type ParsedRow } from "@/lib/bank-parsers/types";
import { parseAmount, parseDate, type ColumnMapping } from "@/lib/import-parse";
import crypto from "crypto";

export type { ColumnMapping };

function normalizeHeaderSignature(headerLine: string, delimiter: string): string {
  return splitDelimited(headerLine, delimiter)
    .map((h) => h.trim().toLowerCase())
    .join("|");
}

function firstLine(raw: string): string {
  return cleanLines(raw).find((l) => l.trim()) ?? "";
}

export async function findMatchingProfile(raw: string) {
  const header = firstLine(raw);
  if (!header) return null;
  const delimiter = guessDelimiter(header);
  const signature = normalizeHeaderSignature(header, delimiter);

  const [profile] = await db
    .select()
    .from(importProfiles)
    .where(eq(importProfiles.headerSignature, signature))
    .limit(1);

  if (!profile) return null;
  return { ...profile, mapping: JSON.parse(profile.mapping) as ColumnMapping };
}

export async function saveProfile(label: string, headerLine: string, delimiter: string, mapping: ColumnMapping) {
  const signature = normalizeHeaderSignature(headerLine, delimiter);
  await db
    .insert(importProfiles)
    .values({ label, headerSignature: signature, mapping: JSON.stringify(mapping) })
    .onConflictDoUpdate({
      target: importProfiles.headerSignature,
      set: { label, mapping: JSON.stringify(mapping) },
    });
}

/** Every saved profile, newest first — backs the "Import profiles" settings panel. */
export async function listImportProfiles() {
  const rows = await db.select().from(importProfiles).orderBy(desc(importProfiles.id));
  return rows.map((row) => ({ ...row, mapping: JSON.parse(row.mapping) as ColumnMapping }));
}

/** Forget a saved mapping, so the next import of that file asks again instead of
 *  silently reapplying a mapping that turned out to be wrong. */
export async function deleteImportProfile(id: number) {
  await db.delete(importProfiles).where(eq(importProfiles.id, id));
}

/** A data row whose date cell could not be read — reported back to the user instead of
 *  being written to the database with a garbage date. */
export interface InvalidDateRow {
  /** 1-based line number in the uploaded file, header included. */
  line: number;
  value: string;
}

export interface MappedParseResult {
  rows: ParsedRow[];
  invalid: InvalidDateRow[];
}

export function parseWithMapping(raw: string, mapping: ColumnMapping): MappedParseResult {
  const lines = cleanLines(raw).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("File has no data rows");

  const rows: ParsedRow[] = [];
  const invalid: InvalidDateRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitDelimited(lines[i], mapping.delimiter);
    const maxIdx = Math.max(mapping.dateColumn, mapping.descriptionColumn, mapping.amountColumn);
    if (cols.length <= maxIdx) continue;

    const dateRaw = cols[mapping.dateColumn];
    // A date we can't read is a mapping mistake, not a row to salvage: collect it and
    // let the caller refuse the whole import rather than storing the raw cell.
    const date = parseDate(dateRaw, mapping.dateFormat, mapping.customDateFormat);
    if (date === null) {
      invalid.push({ line: i + 1, value: (dateRaw ?? "").trim() });
      continue;
    }

    const description = cols[mapping.descriptionColumn]?.trim() ?? "";
    const amountRaw = cols[mapping.amountColumn];
    const signedAmount = parseAmount(amountRaw, mapping.decimalSeparator);

    let direction: "income" | "expense";
    let amount: number;
    if (mapping.directionColumn !== null) {
      const directionValue = (cols[mapping.directionColumn] ?? "").trim().toLowerCase();
      direction = directionValue === (mapping.directionExpenseValue ?? "").toLowerCase() ? "expense" : "income";
      amount = Math.abs(signedAmount);
    } else {
      direction = signedAmount < 0 ? "expense" : "income";
      amount = Math.abs(signedAmount);
    }

    // Stored exactly as the bank supplied it — parsed with the mapping's own decimal
    // separator and nothing else. No validation against the amount, no recalculation:
    // a row whose balance cell is empty or unreadable just carries no balance.
    const balanceRaw = mapping.balanceColumn != null ? cols[mapping.balanceColumn] : undefined;
    const parsedBalance = balanceRaw?.trim() ? parseAmount(balanceRaw, mapping.decimalSeparator) : NaN;
    const reportedBalance = Number.isFinite(parsedBalance) ? parsedBalance : null;

    const account = mapping.accountColumn !== null ? (cols[mapping.accountColumn]?.trim() ?? "") : "";
    const counterAccount = mapping.counterAccountColumn !== null ? (cols[mapping.counterAccountColumn]?.trim() ?? "") : "";

    // Deliberately excludes the balance: the dedup key must stay identical to what
    // pre-balance imports produced, so re-importing a file after mapping the balance
    // column updates the existing rows instead of duplicating them.
    const hash = crypto
      .createHash("sha256")
      .update(`${dateRaw}|${description}|${amountRaw}|${account}`)
      .digest("hex")
      .slice(0, 16);

    rows.push({
      date,
      name: description,
      account,
      counterAccount,
      code: "",
      direction,
      amount,
      type: "",
      description,
      hash,
      reportedBalance,
    });
  }
  return { rows, invalid };
}
