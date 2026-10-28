/**
 * The time of day a bank wrote into a transaction's description — ING's card payments
 * ("Datum: 24-10-2026 Tijd: 12:24") and transfers ("Datum/Tijd: 27-10-2026 01:42:33") —
 * as "12:24". Transactions themselves only store a date, so most have none: null.
 */
export function transactionTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/\bTijd:\s*(?:\d{1,2}-\d{1,2}-\d{4}\s+)?(\d{1,2}):(\d{2})\b/i);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
