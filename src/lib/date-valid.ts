// The one place that decides whether a string is a usable transaction date.
//
// transactions.date is a plain TEXT column with no CHECK constraint, so nothing in the
// database stops a bad value from landing there. Every writer (CSV import, bank parsers)
// and every reader (date formatting) funnels through these two helpers instead.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True only for a real calendar date written as YYYY-MM-DD.
 *
 * The regex alone is not enough: "2026-13-45" matches its shape but is not a date, and
 * `new Date()` would silently roll it over into 2027. So the parsed date is rendered back
 * to ISO and compared with the input — only an exact round-trip counts.
 */
export function isValidISODate(value: string | null | undefined): value is string {
  return parseISODateSafe(value) !== null;
}

/**
 * The Date for an ISO date string, or null when the string isn't one. Never throws —
 * that's the whole point, since `Intl.DateTimeFormat.format()` throws a RangeError on an
 * Invalid Date rather than producing "Invalid Date".
 *
 * Parsed as UTC midnight so the calendar day can't shift by timezone.
 */
export function parseISODateSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;

  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Rejects overflow dates ("2026-02-31" → 3 March) that Date happily accepts.
  if (date.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return null;

  return date;
}
