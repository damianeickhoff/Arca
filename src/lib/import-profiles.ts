import { db } from "@/db";
import { importProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { roundToCents } from "@/lib/transaction-splits";
import { cleanLines, guessDelimiter, splitDelimited, type ParsedRow } from "@/lib/bank-parsers/types";
import crypto from "crypto";

export interface ColumnMapping {
  delimiter: string;
  dateColumn: number;
  dateFormat: "iso" | "dmy" | "mdy"; // yyyy-mm-dd | dd-mm-yyyy | mm-dd-yyyy
  descriptionColumn: number;
  amountColumn: number;
  decimalSeparator: "," | ".";
  directionColumn: number | null;
  // Value found in directionColumn that means "money left the account"; anything else
  // in that column means "money came in". Ignored when directionColumn is null (the
  // amount's own sign decides direction instead — negative = expense).
  directionExpenseValue: string | null;
  accountColumn: number | null;
  counterAccountColumn: number | null;
}

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

function parseAmount(raw: string, decimalSeparator: "," | "."): number {
  const s = raw.trim().replace(/^\+/, "");
  if (decimalSeparator === ",") {
    return roundToCents(parseFloat(s.replace(/\./g, "").replace(",", ".")));
  }
  return roundToCents(parseFloat(s.replace(/,/g, "")));
}

function parseDate(raw: string, format: ColumnMapping["dateFormat"]): string {
  const s = raw.trim();
  if (format === "iso") {
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : s;
  }
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (!m) return s;
  const [, a, b, year] = m;
  // dmy: a=day, b=month. mdy: a=month, b=day.
  const [day, month] = format === "dmy" ? [a, b] : [b, a];
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseWithMapping(raw: string, mapping: ColumnMapping): ParsedRow[] {
  const lines = cleanLines(raw).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("File has no data rows");

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitDelimited(lines[i], mapping.delimiter);
    const maxIdx = Math.max(mapping.dateColumn, mapping.descriptionColumn, mapping.amountColumn);
    if (cols.length <= maxIdx) continue;

    const dateRaw = cols[mapping.dateColumn];
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

    const account = mapping.accountColumn !== null ? (cols[mapping.accountColumn]?.trim() ?? "") : "";
    const counterAccount = mapping.counterAccountColumn !== null ? (cols[mapping.counterAccountColumn]?.trim() ?? "") : "";

    const hash = crypto
      .createHash("sha256")
      .update(`${dateRaw}|${description}|${amountRaw}|${account}`)
      .digest("hex")
      .slice(0, 16);

    rows.push({
      date: parseDate(dateRaw, mapping.dateFormat),
      name: description,
      account,
      counterAccount,
      code: "",
      direction,
      amount,
      type: "",
      description,
      hash,
    });
  }
  return rows;
}
