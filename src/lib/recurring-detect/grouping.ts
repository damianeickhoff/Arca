import type { DetectTransaction } from "./types";
import { median } from "./rhythm";

// The "same counterparty" test. Transactions are grouped by merchant (or, for a
// merchant-less transfer, the counter account), split by direction, and — when the
// group as a whole isn't one series — by amount band, so "Tikkie to Sanne €12,50" and
// "Tikkie to Mark €240" never merge, and a shop that also bills a subscription keeps
// the two apart.

/** Amounts within this fraction of a band's smallest amount share the band. */
export const BAND_WIDTH = 0.08;

/** Who the money went to or came from, or null when nothing identifies them. */
export function counterpartyKey(tx: DetectTransaction): string | null {
  if (tx.merchantId != null) return `m${tx.merchantId}`;
  const account = tx.counterAccount?.replace(/\s+/g, "").toUpperCase();
  return account ? `a${account}` : null;
}

/** Transactions by counterparty and direction ("m12:expense"), each list oldest first. */
export function groupByCounterparty(txns: DetectTransaction[]): Map<string, DetectTransaction[]> {
  const groups = new Map<string, DetectTransaction[]>();
  for (const tx of txns) {
    const key = counterpartyKey(tx);
    if (!key) continue;
    const groupKey = `${key}:${tx.direction === "income" ? "income" : "expense"}`;
    const list = groups.get(groupKey) ?? [];
    list.push(tx);
    groups.set(groupKey, list);
  }
  for (const list of groups.values()) list.sort(byDate);
  return groups;
}

export function byDate(a: DetectTransaction, b: DetectTransaction) {
  return a.date.localeCompare(b.date) || a.id - b.id;
}

/** Splits a group into amount bands (each oldest first). */
export function amountBands(txns: DetectTransaction[]): DetectTransaction[][] {
  const sorted = [...txns].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
  const bands: DetectTransaction[][] = [];
  let current: DetectTransaction[] = [];
  let floor = 0;
  for (const tx of sorted) {
    const abs = Math.abs(tx.amount);
    if (current.length > 0 && abs > floor * (1 + BAND_WIDTH)) {
      bands.push(current);
      current = [];
    }
    if (current.length === 0) floor = abs;
    current.push(tx);
  }
  if (current.length > 0) bands.push(current);
  return bands.map((band) => band.sort(byDate));
}

/** A stable label for a band's amount level, for its signature: steps of BAND_WIDTH on
 *  a log scale, so €12,50 and €12,60 land on the same bucket. */
export function amountBucket(txns: DetectTransaction[]): number {
  const m = median(txns.map((t) => Math.abs(t.amount)));
  return m > 0 ? Math.round(Math.log(m) / Math.log(1 + BAND_WIDTH)) : 0;
}

/**
 * A match pattern that every description contains (lower case): the first hint that
 * fits (a curated pattern, the merchant's own patterns, its name), else the longest
 * run of leading words shared by all of them, cut at the first digit. Null when there
 * is nothing of at least three characters to match on.
 */
export function derivePattern(descriptions: string[], hints: (string | null | undefined)[] = []): string | null {
  const lowered = descriptions.map((d) => d.toLowerCase());
  const fits = (p: string) => p.length >= 3 && lowered.every((d) => d.includes(p));
  for (const hint of hints) {
    const p = hint?.toLowerCase().trim();
    if (p && fits(p)) return p;
  }
  const words = (lowered[0] ?? "").split(/\d/)[0].split(/\s+/).filter(Boolean);
  for (let n = Math.min(words.length, 4); n >= 1; n--) {
    const p = words.slice(0, n).join(" ").replace(/[^a-z0-9à-ÿ]+$/, "");
    if (fits(p)) return p;
  }
  return null;
}
