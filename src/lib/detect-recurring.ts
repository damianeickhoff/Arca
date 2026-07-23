import { db } from "@/db";
import { recurringItems, transactions, transactionSplits } from "@/db/schema";
import { RECURRING_MERCHANTS } from "@/config/recurring-merchants";
import { resolveFriendlyName } from "@/lib/friendly-names";
import { matchRecurringItem, type RecurringMatcher } from "@/lib/recurring-match";

// Minimum number of distinct calendar months an unknown transaction group must span before the
// frequency heuristic treats it as recurring. Known merchants (RECURRING_MERCHANTS) bypass this.
const MIN_MONTHS = 3;
// When the amount spread within a group stays under this fraction of the largest charge we treat
// it as a fixed ("exact") amount; above it, we create a range ("between") item instead.
const AMOUNT_DRIFT_RATIO = 0.05;
// Above this spread the amounts are too erratic to be a genuine recurring bill (they're usually
// ad-hoc transfers to the same counterparty or savings movements) — skip rather than guess. A
// real variable bill (energy/water) drifts within ~2.5× between its cheapest and priciest month.
const MAX_DRIFT_RATIO = 0.6;

type NewItem = {
  name: string;
  type: string;
  frequency: string;
  dueDay: number | null;
  budgetType: string | null;
  matchPattern: string;
  matchAmount: number | null;
  matchAmountMin: number | null;
  matchAmountMax: number | null;
  source: string;
  signature: string;
};

/** Leading, contiguous, alphabetic slug of a description — a genuine substring usable as a
 * matchPattern. e.g. "AH TO GO 4192 AMSTERDAM" → "ah to go". */
function leadingSlug(description: string): string {
  const lower = description.toLowerCase();
  // Stop at the first digit — bank descriptions put the merchant name up front.
  const head = lower.split(/\d/)[0];
  const words = head.replace(/[^a-zà-ÿ\s]/g, " ").split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join(" ").trim();
}

/** Most frequent value in a list (first-seen wins ties). */
function mode<T>(values: T[]): T {
  const counts = new Map<T, number>();
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) { bestCount = c; best = v; }
  }
  return best;
}

/**
 * Scans all transactions and auto-creates recurring_items for the ones that look recurring —
 * both via the curated RECURRING_MERCHANTS list (instant) and a frequency heuristic (≥3 months).
 * Never touches manual items, and never recreates a signature that already exists — including
 * dismissed ones, which is what keeps a dismissed false positive from coming back.
 * Returns the number of items created. Callers should run applyAllRules() afterwards to link
 * the matching transactions.
 */
export async function detectRecurringTransactions(): Promise<number> {
  const [txns, existing, splitRows] = await Promise.all([
    db.select({
      description: transactions.description,
      amount: transactions.amount,
      direction: transactions.direction,
      date: transactions.date,
      id: transactions.id,
    }).from(transactions),
    db.select().from(recurringItems),
    db.select({ transactionId: transactionSplits.transactionId }).from(transactionSplits),
  ]);

  const splitIds = new Set(splitRows.map((r) => r.transactionId));
  const rows = txns.filter((t) => !splitIds.has(t.id));

  // Signatures already represented by a row (any source, incl. dismissed) — never recreate these.
  const takenSignatures = new Set(existing.filter((e) => e.signature).map((e) => e.signature as string));
  // Active matchers, used so we don't create an item for something a (manual) item already covers.
  const activeMatchers: RecurringMatcher[] = existing
    .filter((e) => e.active && !e.dismissed)
    .map((e) => ({
      id: e.id, name: e.name, matchPattern: e.matchPattern, matchAmount: e.matchAmount,
      matchAmountMin: e.matchAmountMin, matchAmountMax: e.matchAmountMax,
      categoryId: e.categoryId, friendlyName: e.friendlyName, active: e.active,
    }));

  const toCreate = new Map<string, NewItem>();
  // Grows as we queue items, so later passes see earlier queued patterns as "covered".
  const queuedMatchers: RecurringMatcher[] = [];
  const covered = (desc: string, amount: number) =>
    matchRecurringItem(desc, amount, activeMatchers) != null ||
    matchRecurringItem(desc, amount, queuedMatchers) != null;

  const queue = (sig: string, item: NewItem) => {
    toCreate.set(sig, item);
    queuedMatchers.push({
      id: -toCreate.size, name: item.name, matchPattern: item.matchPattern,
      matchAmount: item.matchAmount, matchAmountMin: item.matchAmountMin,
      matchAmountMax: item.matchAmountMax, categoryId: null, friendlyName: item.name, active: true,
    });
  };

  // ── Pass 1: known merchants (instant) ─────────────────────────────────────
  for (const t of rows) {
    const desc = t.description.toLowerCase();
    const merchant = RECURRING_MERCHANTS.find((m) => desc.includes(m.pattern.toLowerCase()));
    if (!merchant) continue;
    const sig = `m:${merchant.pattern.toLowerCase()}`;
    if (takenSignatures.has(sig) || toCreate.has(sig)) continue;
    if (covered(t.description, t.amount)) continue;
    queue(sig, {
      name: merchant.name,
      type: merchant.type,
      frequency: "monthly",
      dueDay: null,
      budgetType: merchant.type === "income" ? null : (merchant.budgetType ?? "willen"),
      matchPattern: merchant.pattern,
      matchAmount: null, // subscriptions can change price → pattern-only
      matchAmountMin: null,
      matchAmountMax: null,
      source: "auto",
      signature: sig,
    });
  }

  // ── Pass 2: frequency heuristic on everything not already covered ──────────
  type Group = { slug: string; amounts: number[]; months: Set<string>; days: number[]; income: boolean; sampleDesc: string };
  const groups = new Map<string, Group>();
  for (const t of rows) {
    if (covered(t.description, t.amount)) continue;
    const slug = leadingSlug(t.description);
    if (slug.length < 3) continue; // too generic to match on
    const g = groups.get(slug) ?? { slug, amounts: [], months: new Set(), days: [], income: false, sampleDesc: t.description };
    g.amounts.push(Math.abs(t.amount));
    g.months.add(t.date.slice(0, 7));
    const day = parseInt(t.date.slice(8, 10), 10);
    if (!Number.isNaN(day)) g.days.push(day);
    if (t.direction === "income") g.income = true;
    groups.set(slug, g);
  }

  for (const g of groups.values()) {
    if (g.months.size < MIN_MONTHS) continue;
    const sig = `h:${g.slug}`;
    if (takenSignatures.has(sig) || toCreate.has(sig)) continue;

    const min = Math.min(...g.amounts);
    const max = Math.max(...g.amounts);
    const drift = max > 0 ? (max - min) / max : 0;
    // Too erratic to be a recurring bill (ad-hoc transfers, savings movements) → skip.
    if (drift > MAX_DRIFT_RATIO) continue;
    const isRange = drift > AMOUNT_DRIFT_RATIO;
    const name = resolveFriendlyName(g.sampleDesc) ?? g.slug.replace(/\b\w/g, (c) => c.toUpperCase());

    queue(sig, {
      name,
      type: g.income ? "income" : "bill",
      frequency: "monthly",
      dueDay: g.days.length ? mode(g.days) : null,
      budgetType: g.income ? null : "nodig",
      matchPattern: g.slug,
      matchAmount: isRange ? null : Math.round(mode(g.amounts.map((a) => Math.round(a * 100))) ) / 100,
      matchAmountMin: isRange ? Math.floor(min * 100) / 100 : null,
      matchAmountMax: isRange ? Math.ceil(max * 100) / 100 : null,
      source: "auto",
      signature: sig,
    });
  }

  const items = [...toCreate.values()];
  if (items.length) await db.insert(recurringItems).values(items);
  return items.length;
}
