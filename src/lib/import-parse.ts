// Pure parsing helpers for CSV imports — no database, no node built-ins, so the column
// mapping dialog can import them and show the user exactly what their mapping produces
// *before* anything is written. src/lib/import-profiles.ts (server-only: db + crypto)
// builds on top of these.

import { isValidISODate } from "@/lib/date-valid";
import { roundToCents } from "@/lib/transaction-splits";

export interface ColumnMapping {
  delimiter: string;
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
