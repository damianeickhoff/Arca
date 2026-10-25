import type Database from "better-sqlite3";

// Moves between two imported accounts: the same amount leaves one account and arrives
// in another within two days (an ING card payment to Revolut and the Revolut top-up, or
// "To EUR …" between two Revolut accounts). Both legs are linked through
// transactions.transferPairId, which makes them internal transfers
// (src/lib/internal-transfers.ts). Matching is one-to-one, so a second payment of the
// same amount on the same day is never swallowed by a pair it does not belong to.

export type PairRow = {
  id: number;
  date: string;
  direction: string;
  amount: number;
  account: string | null;
  counterAccount: string | null;
  description: string | null;
  rawDescription: string | null;
};

export type PairAccount = { accountNumber: string | null; displayName: string | null };

export const PAIR_WINDOW_DAYS = 2;

// Words that say "this is a move of my own money" in either leg's text.
const TRANSFER_WORDS = /top-?up|opwaarder|overboeking|overschrijving|transfer|eigen rekening/;
// Name words too common to identify an account ("Revolut Main" → only "revolut" counts).
const GENERIC_NAME_WORDS = new Set([
  "main", "account", "rekening", "betaalrekening", "spaarrekening", "savings", "current", "checking",
  "card", "creditcard", "debit", "bank", "personal", "joint", "eigen", "privé", "prive",
]);

const normalizeAccount = (value: string | null | undefined) => value?.replace(/\s+/g, "").toUpperCase() ?? "";
const compact = (value: string | null | undefined) => value?.toLowerCase().replace(/\s+/g, "") ?? "";

function dayNumber(date: string) {
  return Math.round(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000);
}

function nameTokens(name: string | null) {
  return (name ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
}

/**
 * Whether a leg's own text points at the other side: the same description on both legs,
 * the other account as counter account or in the text, a distinctive word of the other
 * account's name ("revolut"), or a transfer word. A pair needs this on both legs, so a
 * card payment at a shop never pairs with a top-up that happens to have the same amount.
 */
function pointsAtOther(leg: PairRow, other: PairRow, otherAccount: PairAccount | undefined) {
  if (compact(leg.description) && compact(leg.description) === compact(other.description)) return true;
  const number = normalizeAccount(otherAccount?.accountNumber);
  if (number && normalizeAccount(leg.counterAccount) === number) return true;
  const text = `${leg.description ?? ""} ${leg.rawDescription ?? ""}`.toLowerCase();
  if (number && compact(text).includes(number.toLowerCase())) return true;
  if (nameTokens(otherAccount?.displayName ?? null).some((w) => text.includes(w))) return true;
  return TRANSFER_WORDS.test(text);
}

/** The pairs among `rows` as [expense id, income id], each row in at most one pair. */
export function findTransferPairs(rows: PairRow[], accounts: PairAccount[]): [number, number][] {
  const accountByNumber = new Map(accounts.map((a) => [normalizeAccount(a.accountNumber), a]));
  accountByNumber.delete("");
  const own = (r: PairRow) => accountByNumber.has(normalizeAccount(r.account));

  const incomeByCents = new Map<number, PairRow[]>();
  for (const r of rows) {
    if (r.direction !== "income" || !own(r)) continue;
    const cents = Math.round(r.amount * 100);
    const list = incomeByCents.get(cents) ?? [];
    list.push(r);
    incomeByCents.set(cents, list);
  }

  type Edge = { out: PairRow; in: PairRow; days: number; score: number };
  const edges: Edge[] = [];
  for (const out of rows) {
    if (out.direction !== "expense" || !own(out)) continue;
    const outAccount = normalizeAccount(out.account);
    for (const inc of incomeByCents.get(Math.round(out.amount * 100)) ?? []) {
      const inAccount = normalizeAccount(inc.account);
      if (inAccount === outAccount) continue;
      const days = Math.abs(dayNumber(out.date) - dayNumber(inc.date));
      if (days > PAIR_WINDOW_DAYS) continue;
      // A leg paid to someone else (a counter account that is not the other side) is a
      // payment, not half of a move.
      const outCounter = normalizeAccount(out.counterAccount);
      const inCounter = normalizeAccount(inc.counterAccount);
      if (outCounter && outCounter !== inAccount) continue;
      if (inCounter && inCounter !== outAccount) continue;
      if (!pointsAtOther(out, inc, accountByNumber.get(inAccount)) || !pointsAtOther(inc, out, accountByNumber.get(outAccount))) continue;
      const sameText = compact(out.description) === compact(inc.description);
      edges.push({ out, in: inc, days, score: (sameText ? 2 : 0) - days });
    }
  }

  // Strongest first: the same text, then the closest dates, then the oldest rows.
  edges.sort((a, b) => b.score - a.score || a.days - b.days || a.out.id - b.out.id || a.in.id - b.in.id);
  const used = new Set<number>();
  const pairs: [number, number][] = [];
  for (const e of edges) {
    if (used.has(e.out.id) || used.has(e.in.id)) continue;
    used.add(e.out.id);
    used.add(e.in.id);
    pairs.push([e.out.id, e.in.id]);
  }
  return pairs;
}

/**
 * Pairs every unpaired imported row it can and stores the links. Rows the owner marked
 * "Not a transfer" stay out. Returns how many pairs it made. Synchronous so the boot
 * migration in src/db/index.ts can run it; imports and bank syncs call it afterwards.
 */
export function pairTransfers(sqlite: Database.Database): number {
  const accounts = sqlite.prepare(`SELECT account_number AS accountNumber, display_name AS displayName FROM banks`).all() as PairAccount[];
  const rows = sqlite
    .prepare(
      `SELECT id, date, direction, amount, account, counter_account AS counterAccount,
              description, raw_description AS rawDescription
         FROM transactions
        WHERE source IN ('csv_import', 'bank') AND transfer_pair_id IS NULL AND not_transfer = 0`,
    )
    .all() as PairRow[];
  const pairs = findTransferPairs(rows, accounts);
  if (pairs.length === 0) return 0;
  const link = sqlite.prepare(`UPDATE transactions SET transfer_pair_id = ? WHERE id = ?`);
  sqlite.transaction(() => {
    for (const [out, inc] of pairs) {
      link.run(inc, out);
      link.run(out, inc);
    }
  })();
  return pairs.length;
}

/** Breaks the pair a row is in (both legs), e.g. when the owner says it is not a transfer. */
export function unpairTransfer(sqlite: Database.Database, id: number) {
  sqlite.prepare(`UPDATE transactions SET transfer_pair_id = NULL WHERE id = ? OR transfer_pair_id = ?`).run(id, id);
}
