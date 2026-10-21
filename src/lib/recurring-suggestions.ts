import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  merchantPatterns,
  merchants,
  recurringItems,
  recurringSuggestions,
  transactions,
  transactionSplits,
  type RecurringItem,
  type RecurringSuggestion,
} from "@/db/schema";
import { detectRecurring, shouldAutoAccept, type DetectTransaction, type RecurringCandidate } from "@/lib/recurring-detect";
import { counterpartyKey } from "@/lib/recurring-detect/grouping";
import { matchRecurringItem, type RecurringMatcher } from "@/lib/recurring-match";
import { notInternalTransferCondition } from "@/lib/internal-transfers";
import { findRecurringItemByName } from "@/lib/recurring-dedupe";
import { applyAllRules } from "@/lib/apply-rules";
import { recordActivity } from "@/lib/activity-log";
import { recurringDetectedEntry } from "@/lib/activity-log-entries";
import { todayStr } from "@/lib/date-range";
import { resolveRecurringIcon } from "@/lib/auto-brand";

// The recurring detector's database half: load the transactions, run the pure detector
// (lib/recurring-detect/) and store what it finds as suggestions. Nothing becomes an
// active recurring item until the user accepts it — except a high-confidence match on
// the curated RECURRING_MERCHANTS list, which is accepted straight away and recorded in
// the change log so it can be undone.

/** Transactions the detector looks at: no splits, no transfers between own accounts,
 *  nothing already linked to a recurring item. */
async function loadDetectTransactions(): Promise<DetectTransaction[]> {
  const splitIds = db.select({ id: transactionSplits.transactionId }).from(transactionSplits);
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      direction: transactions.direction,
      description: transactions.description,
      merchantId: transactions.merchantId,
      merchantName: merchants.name,
      counterAccount: transactions.counterAccount,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(and(
      isNull(transactions.recurringItemId),
      eq(transactions.isManualTransfer, false),
      notInArray(transactions.id, splitIds),
      notInternalTransferCondition,
    ));
  return rows;
}

async function loadMerchantPatternHints(): Promise<Map<number, string[]>> {
  const rows = await db
    .select({ merchantId: merchantPatterns.merchantId, pattern: merchantPatterns.pattern })
    .from(merchantPatterns)
    .where(eq(merchantPatterns.matchType, "contains"));
  const map = new Map<number, string[]>();
  for (const r of rows) map.set(r.merchantId, [...(map.get(r.merchantId) ?? []), r.pattern]);
  return map;
}

function toMatcher(item: RecurringItem): RecurringMatcher {
  return {
    id: item.id, name: item.name, matchPattern: item.matchPattern, matchWholeWord: item.matchWholeWord,
    matchAmount: item.matchAmount, matchAmountMin: item.matchAmountMin, matchAmountMax: item.matchAmountMax,
    categoryId: item.categoryId, friendlyName: item.friendlyName, active: true,
  };
}

/** The group key ("m12:expense") a suggestion's signature starts with. */
function groupKeyOf(signature: string): string {
  return signature.replace(/^r:/, "").split(":").slice(0, 2).join(":");
}

export type DetectionRun = {
  /** New suggestions waiting for the user. */
  suggested: number;
  /** Curated matches accepted without asking. */
  autoAccepted: number;
};

/**
 * Looks for regular payments and stores them as suggestions. `touchedTransactionIds`
 * limits the run to the counterparties those transactions belong to (an import or a
 * bank sync); without it every counterparty is tested (Settings › Data health).
 * Pending suggestions of a tested counterparty that no longer pass are dropped; ones
 * the user rejected or accepted are never touched or recreated.
 */
export async function detectRecurringSuggestions(touchedTransactionIds?: number[]): Promise<DetectionRun> {
  const [all, hints, items, stored] = await Promise.all([
    loadDetectTransactions(),
    loadMerchantPatternHints(),
    db.select().from(recurringItems),
    db.select().from(recurringSuggestions),
  ]);

  let txns = all;
  let testedGroups: Set<string> | null = null;
  if (touchedTransactionIds) {
    if (touchedTransactionIds.length === 0) return { suggested: 0, autoAccepted: 0 };
    const touched = new Set(touchedTransactionIds);
    const keys = new Set(all.filter((t) => touched.has(t.id)).map(counterpartyKey).filter((k): k is string => k != null));
    txns = all.filter((t) => keys.has(counterpartyKey(t) ?? ""));
    testedGroups = new Set([...keys].flatMap((k) => [`${k}:expense`, `${k}:income`]));
  }

  const candidates = detectRecurring(txns, { today: todayStr(), merchantPatterns: hints });

  // An item the user has (active) covers its payments already; a dismissed one is a
  // "no" the user gave before this detector existed. Either way: don't suggest it.
  const active = items.filter((i) => i.active && !i.dismissed).map(toMatcher);
  const dismissed = items.filter((i) => i.dismissed).map(toMatcher);
  const byId = new Map(txns.map((t) => [t.id, t]));
  const mostlyMatched = (c: RecurringCandidate, matchers: RecurringMatcher[]) => {
    const hits = c.transactionIds.filter((id) => {
      const t = byId.get(id);
      return t != null && matchRecurringItem(t.description, t.amount, matchers) != null;
    }).length;
    return hits * 2 > c.transactionIds.length;
  };
  const storedBySignature = new Map(stored.map((s) => [s.signature, s]));
  const itemSignatures = new Set(items.map((i) => i.signature).filter(Boolean));
  const fresh = candidates.filter((c) =>
    !itemSignatures.has(c.signature) &&
    (storedBySignature.get(c.signature)?.status ?? "pending") === "pending" &&
    !mostlyMatched(c, active) &&
    !mostlyMatched(c, dismissed),
  );

  const autoAccept = fresh.filter((c) => shouldAutoAccept(c) && !storedBySignature.has(c.signature));
  const toSuggest = fresh.filter((c) => !autoAccept.includes(c));

  // Re-tested groups: pending suggestions that no longer pass go (never one from the
  // migration pass, which waits for the user's answer).
  const found = new Set(fresh.map((c) => c.signature));
  const stale = stored.filter((s) =>
    s.status === "pending" && !s.wasActive && !found.has(s.signature) && (!testedGroups || testedGroups.has(s.groupKey)),
  );
  if (stale.length > 0) await db.delete(recurringSuggestions).where(inArray(recurringSuggestions.id, stale.map((s) => s.id)));

  let suggested = 0;
  for (const c of toSuggest) {
    const values = suggestionValues(c);
    const existing = storedBySignature.get(c.signature);
    if (existing) {
      await db.update(recurringSuggestions).set({ ...values, updatedAt: sql`(datetime('now'))` }).where(eq(recurringSuggestions.id, existing.id));
    } else {
      const inserted = await db.insert(recurringSuggestions).values(values).onConflictDoNothing().returning({ id: recurringSuggestions.id });
      suggested += inserted.length;
    }
  }

  const accepted: { id: number; name: string }[] = [];
  for (const c of autoAccept) {
    const [row] = await db.insert(recurringSuggestions).values({ ...suggestionValues(c), status: "accepted" }).onConflictDoNothing().returning();
    if (!row) continue;
    const item = await createItemFor(row);
    if (item.changed) accepted.push(item);
  }
  if (accepted.length > 0) {
    await applyAllRules();
    // Auto-accepted items go in the change log; undoing them dismisses them.
    await recordActivity(recurringDetectedEntry(accepted));
  }
  return { suggested, autoAccepted: accepted.length };
}

function suggestionValues(c: RecurringCandidate) {
  return {
    signature: c.signature,
    groupKey: groupKeyOf(c.signature),
    name: c.name,
    type: c.type,
    frequency: c.frequency,
    dueDay: c.dueDay,
    startDate: c.startDate,
    amount: c.amount,
    amountMin: c.amountMin,
    amountMax: c.amountMax,
    matchPattern: c.matchPattern,
    matchAmount: c.matchAmount,
    matchAmountMin: c.matchAmountMin,
    matchAmountMax: c.matchAmountMax,
    budgetType: c.budgetType,
    merchantId: c.merchantId,
    occurrences: c.occurrences,
    firstDate: c.firstDate,
    lastDate: c.lastDate,
    confidence: c.confidence,
    curated: c.curated,
    transactionIds: JSON.stringify(c.transactionIds),
  };
}

/**
 * Makes (or revives) the recurring item for a suggestion and marks the suggestion
 * accepted. An item with the same name is reused: a dismissed or paused one is switched
 * back on with the detected schedule, an active one is simply linked. Doesn't run the
 * rule pass — callers do, once, after their last accept. `changed` is false when an
 * active item was only linked: there is nothing of ours to undo there.
 */
async function createItemFor(s: RecurringSuggestion): Promise<{ id: number; name: string; changed: boolean }> {
  const schedule = {
    type: s.type,
    amount: s.amount,
    frequency: s.frequency,
    dueDay: s.dueDay,
    startDate: s.startDate,
    budgetType: s.budgetType,
    matchPattern: s.matchPattern,
    matchWholeWord: false,
    matchAmount: s.matchAmount,
    matchAmountMin: s.matchAmountMin,
    matchAmountMax: s.matchAmountMax,
  };
  const existing = await findRecurringItemByName(s.name);
  let itemId: number;
  let changed = true;
  if (existing?.active && !existing.dismissed) {
    itemId = existing.id;
    changed = false;
  } else if (existing) {
    await db.update(recurringItems).set({ ...schedule, active: true, dismissed: false }).where(eq(recurringItems.id, existing.id));
    itemId = existing.id;
  } else {
    const [row] = await db
      .insert(recurringItems)
      .values({ ...schedule, name: s.name, source: "auto", signature: s.signature, active: true })
      .returning({ id: recurringItems.id });
    itemId = row.id;
  }
  await db.update(recurringSuggestions)
    .set({ status: "accepted", recurringItemId: itemId, updatedAt: sql`(datetime('now'))` })
    .where(eq(recurringSuggestions.id, s.id));
  return { id: itemId, name: s.name, changed };
}

async function pendingSuggestion(id: number): Promise<RecurringSuggestion | null> {
  const [row] = await db.select().from(recurringSuggestions).where(and(eq(recurringSuggestions.id, id), eq(recurringSuggestions.status, "pending")));
  return row ?? null;
}

/** Accept: the suggestion becomes an active recurring item and its payments are linked. */
export async function acceptSuggestion(id: number): Promise<boolean> {
  const s = await pendingSuggestion(id);
  if (!s) return false;
  await createItemFor(s);
  await applyAllRules();
  return true;
}

/** Edit: the user saved the recurring editor (prefilled from the suggestion) as `recurringItemId`. */
export async function linkSuggestion(id: number, recurringItemId: number): Promise<boolean> {
  const s = await pendingSuggestion(id);
  if (!s) return false;
  await db.update(recurringSuggestions)
    .set({ status: "accepted", recurringItemId, updatedAt: sql`(datetime('now'))` })
    .where(eq(recurringSuggestions.id, id));
  return true;
}

/** Not a bill: the row stays, rejected, so the same series never comes back. */
export async function rejectSuggestion(id: number): Promise<boolean> {
  const s = await pendingSuggestion(id);
  if (!s) return false;
  await db.update(recurringSuggestions)
    .set({ status: "rejected", updatedAt: sql`(datetime('now'))` })
    .where(eq(recurringSuggestions.id, id));
  return true;
}

/**
 * Keep or remove items the migration pass switched off (all of them, or `ids`). Keep
 * switches the item back on; Remove dismisses it the way deleting an auto item always
 * has, so it stays restorable from Settings › Recurring and is never suggested again.
 * Returns how many were resolved.
 */
export async function resolveMigrated(keep: boolean, ids?: number[]): Promise<number> {
  const rows = (await db.select().from(recurringSuggestions)
    .where(and(eq(recurringSuggestions.status, "pending"), eq(recurringSuggestions.wasActive, true))))
    .filter((r) => !ids || ids.includes(r.id));
  if (rows.length === 0) return 0;
  const itemIds = rows.map((r) => r.recurringItemId).filter((id): id is number => id != null);
  if (itemIds.length > 0) {
    await db.update(recurringItems)
      .set(keep ? { active: true, dismissed: false } : { active: false, dismissed: true })
      .where(inArray(recurringItems.id, itemIds));
  }
  await db.update(recurringSuggestions)
    .set({ status: keep ? "accepted" : "rejected", updatedAt: sql`(datetime('now'))` })
    .where(inArray(recurringSuggestions.id, rows.map((r) => r.id)));
  // Kept items link their payments again; removed ones are already unlinked.
  if (keep) await applyAllRules();
  return rows.length;
}

/** A suggestion as the review strip shows it. */
export type SuggestionView = {
  id: number;
  name: string;
  type: string;
  frequency: string;
  dueDay: number | null;
  startDate: string | null;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  matchPattern: string;
  matchAmount: number | null;
  matchAmountMin: number | null;
  matchAmountMax: number | null;
  budgetType: string | null;
  occurrences: number;
  firstDate: string | null;
  confidence: number;
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
};

/** Pending suggestions, most confident first. */
export function listPendingSuggestions(): Promise<SuggestionView[]> {
  return listSuggestions(false);
}

/** The old detector's items that failed the new tests (the migration pass), waiting
 *  for Keep / Remove on Upcoming. */
export function listMigrationReview(): Promise<SuggestionView[]> {
  return listSuggestions(true);
}

async function listSuggestions(wasActive: boolean): Promise<SuggestionView[]> {
  const rows = await db
    .select({ s: recurringSuggestions, icon: merchants.icon, iconColor: merchants.color })
    .from(recurringSuggestions)
    .leftJoin(merchants, eq(merchants.id, recurringSuggestions.merchantId))
    .where(and(eq(recurringSuggestions.status, "pending"), eq(recurringSuggestions.wasActive, wasActive)))
    .orderBy(sql`${recurringSuggestions.confidence} DESC`, recurringSuggestions.name);
  return rows.map(({ s, icon, iconColor }) => {
    // The merchant's own logo when it has one, else whatever the name resolves to.
    const resolved = icon ? null : resolveRecurringIcon({ name: s.name });
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      frequency: s.frequency,
      dueDay: s.dueDay,
      startDate: s.startDate,
      amount: s.amount,
      amountMin: s.amountMin,
      amountMax: s.amountMax,
      matchPattern: s.matchPattern,
      matchAmount: s.matchAmount,
      matchAmountMin: s.matchAmountMin,
      matchAmountMax: s.matchAmountMax,
      budgetType: s.budgetType,
      occurrences: s.occurrences,
      firstDate: s.firstDate,
      confidence: s.confidence,
      icon: icon ?? resolved?.iconKey ?? null,
      iconColor: icon ? iconColor : (resolved?.color ?? null),
      iconBackground: resolved?.background ?? null,
    };
  });
}
