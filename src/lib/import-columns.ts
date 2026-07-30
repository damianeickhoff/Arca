/**
 * Header-name recognition for the manual CSV column mapping.
 *
 * Deliberately free of any server-only import (no `@/db`), so the mapping dialog — a
 * client component — can pre-select columns from the uploaded file's headers while
 * src/lib/import-profiles.ts uses the same lists on the server.
 */

/** Header names that mean "the account balance after this transaction", across the
 *  bank exports we've seen (English, Dutch, and the usual accounting phrasings).
 *  Matched case-insensitively as substrings, so "Saldo na mutatie", "Saldo na trn" and
 *  "Balance (EUR)" are all covered by the shorter entries. */
export const BALANCE_HEADER_PATTERNS = [
  "resulting balance",
  "running balance",
  "closing balance",
  "balance after",
  "resultaat saldo",
  "eindsaldo",
  "saldo",
  "balance",
] as const;

function normalize(header: string): string {
  return header.trim().toLowerCase();
}

/**
 * Index of the first header that looks like a resulting-balance column, or null when
 * none does. Only ever a suggestion — the user can always override it (or clear it)
 * in the mapping dialog, and a wrong guess costs nothing because the field is optional.
 */
export function guessBalanceColumn(headers: string[]): number | null {
  for (const pattern of BALANCE_HEADER_PATTERNS) {
    const idx = headers.findIndex((h) => normalize(h).includes(pattern));
    if (idx !== -1) return idx;
  }
  return null;
}
