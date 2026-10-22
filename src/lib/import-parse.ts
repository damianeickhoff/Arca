// Pure parsing helpers for CSV imports — no database, no node built-ins, so the column
// mapping dialog can import them and show the user exactly what their mapping produces
// *before* anything is written. bank-parsers/types is pure too. src/lib/import-profiles.ts (server-only: db + crypto)
// builds on top of these.

import { isValidISODate } from "@/lib/date-valid";
import { roundToCents } from "@/lib/transaction-splits";
import { guessDelimiter, splitDelimited } from "@/lib/bank-parsers/types";

export interface ColumnMapping {
  delimiter: string;
  // Which of the file's non-empty lines holds the column names (0-based). Banks like DKB
  // open with a few lines about the account before the real header. Absent on profiles
  // saved before this existed; null/absent means "detect it" (see detectCsvLayout).
  headerRow?: number | null;
  dateColumn: number;
  dateFormat: "iso" | "dmy" | "mdy" | "custom"; // yyyy-mm-dd | dd-mm-yyyy | mm-dd-yyyy | custom pattern
  // Pattern using DD, MM, YYYY/YY tokens (e.g. "DD.MM.YYYY"). Only used when dateFormat is "custom".
  customDateFormat?: string | null;
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
  // Column holding the balance the bank reports after each transaction ("Saldo na
  // mutatie", "Resulting balance", …). Optional in every sense: absent on profiles
  // saved before this existed, and null when the user's file has no such column — in
  // both cases the import behaves exactly as it did before.
  balanceColumn?: number | null;
}

/** How many of a file's first lines can be the header row — enough for any bank's
 *  account summary, few enough to list in a picker. */
export const HEADER_ROW_CHOICES = 20;

/** Lines looked at to learn a file's shape; data rows all look alike, so more adds nothing. */
const LAYOUT_SAMPLE_LINES = 200;

const DELIMITERS = [";", "\t", ","];

/** The field count most lines share (ties go to the wider one), and how many share it. */
function commonFieldCount(counts: number[]): { fields: number; lines: number } {
  const freq = new Map<number, number>();
  for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
  let best = { fields: 0, lines: 0 };
  for (const [fields, lines] of freq) {
    if (lines > best.lines || (lines === best.lines && fields > best.fields)) best = { fields, lines };
  }
  return best;
}

export interface CsvLayout {
  delimiter: string;
  /** Index into the file's non-empty lines. */
  headerRow: number;
}

/**
 * A CSV's delimiter and header row, read from the whole file rather than its first line.
 * Some banks (DKB, Sparkasse, …) open with a few lines like "Girokonto;DE12…" or
 * "Kontostand vom 22.07.2026:" before the real column names; those lines have far fewer
 * fields than the transactions below them, so the header is the first line that is
 * about as wide as most of the file. `lines` are the file's non-empty lines.
 *
 * A guess: the mapping dialog shows it and lets the user pick another row.
 */
export function detectCsvLayout(lines: string[]): CsvLayout {
  const sample = lines.slice(0, LAYOUT_SAMPLE_LINES);
  let best: { delimiter: string; counts: number[]; fields: number; lines: number } | null = null;
  for (const delimiter of DELIMITERS) {
    const counts = sample.map((l) => splitDelimited(l, delimiter).length);
    const common = commonFieldCount(counts);
    if (common.fields < 2) continue;
    if (!best || common.lines > best.lines || (common.lines === best.lines && common.fields > best.fields)) {
      best = { delimiter, counts, ...common };
    }
  }
  if (!best) return { delimiter: guessDelimiter(lines[0] ?? ""), headerRow: 0 };

  // "About as wide": a header can be a field short of its rows (a trailing delimiter on
  // every data line), but an account summary line is far narrower.
  const minFields = Math.max(2, Math.ceil(best.fields * 0.75));
  const headerRow = best.counts.slice(0, HEADER_ROW_CHOICES).findIndex((c) => c >= minFields);
  return { delimiter: best.delimiter, headerRow: Math.max(0, headerRow) };
}

/** The mapping's header row when it points inside the file, otherwise a detected one. */
export function resolveHeaderRow(lines: string[], mapping: Pick<ColumnMapping, "headerRow">): number {
  const row = mapping.headerRow;
  if (typeof row === "number" && Number.isInteger(row) && row >= 0 && row < lines.length) return row;
  return detectCsvLayout(lines).headerRow;
}

export function parseAmount(raw: string, decimalSeparator: "," | "."): number {
  const s = raw.trim().replace(/^\+/, "");
  if (decimalSeparator === ",") {
    return roundToCents(parseFloat(s.replace(/\./g, "").replace(",", ".")));
  }
  return roundToCents(parseFloat(s.replace(/,/g, "")));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Builds a regex + token order from a pattern like "DD.MM.YYYY" so custom bank
// date formats (any separator, 2- or 4-digit year) can be parsed without a library.
export function buildCustomDateParser(pattern: string): { regex: RegExp; order: ("DD" | "MM" | "YYYY" | "YY")[] } {
  const tokenRegex = /YYYY|YY|MM|DD/g;
  let regexStr = "";
  let lastIndex = 0;
  const order: ("DD" | "MM" | "YYYY" | "YY")[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(pattern))) {
    regexStr += escapeRegExp(pattern.slice(lastIndex, m.index));
    const token = m[0] as "DD" | "MM" | "YYYY" | "YY";
    order.push(token);
    regexStr += token === "YYYY" ? "(\\d{4})" : token === "YY" ? "(\\d{2})" : "(\\d{1,2})";
    lastIndex = tokenRegex.lastIndex;
  }
  regexStr += escapeRegExp(pattern.slice(lastIndex));
  return { regex: new RegExp("^" + regexStr), order };
}

function parseCustomDate(raw: string, pattern: string): string | null {
  const s = raw.trim();
  const { regex, order } = buildCustomDateParser(pattern);
  const m = s.match(regex);
  if (!m) return null;
  let day = "", month = "", year = "";
  order.forEach((token, i) => {
    const value = m[i + 1];
    if (token === "DD") day = value;
    else if (token === "MM") month = value;
    else if (token === "YYYY") year = value;
    else if (token === "YY") year = `20${value}`;
  });
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * A cell's ISO date under the given mapping, or **null when it can't be read as one**.
 *
 * Returning null rather than the raw cell is the point of this function: the previous
 * behaviour passed unparseable values straight through into transactions.date, so a
 * mis-mapped column wrote descriptions where dates belong. Callers must handle null by
 * rejecting the row — never by falling back to the raw string.
 */
export function parseDate(
  raw: string,
  format: ColumnMapping["dateFormat"],
  customFormat?: string | null,
): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  let iso: string | null;
  if (format === "custom") {
    iso = customFormat ? parseCustomDate(s, customFormat) : null;
  } else if (format === "iso") {
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    iso = m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
  } else {
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (!m) return null;
    const [, a, b, year] = m;
    // dmy: a=day, b=month. mdy: a=month, b=day.
    const [day, month] = format === "dmy" ? [a, b] : [b, a];
    iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Shape isn't enough — "31-02-2026" parses cleanly above but isn't a real date.
  return isValidISODate(iso) ? iso : null;
}
