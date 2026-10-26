// How an account is recognised in the transactions, and what money to or from it
// means. No database access, so the account dialogs (client components) share it with
// the transfer rules in lib/internal-transfers.ts.

/** Types of an account kept by hand (vermogen_accounts.type). */
export const HAND_KEPT_TYPES = ["spaarrekening", "beleggingen", "betaalrekening", "gezamenlijk", "bezitting"] as const;
export type HandKeptType = (typeof HAND_KEPT_TYPES)[number];

/** A joint account kept by hand: money into it is household spending, not a transfer. */
export const JOINT_TYPE = "gezamenlijk";

/**
 * What a transfer to a hand-kept account counts as (src/lib/transfer-types.ts). Savings
 * and investments are money put aside (Saved); a joint account is no transfer at all.
 */
export const HAND_KEPT_TRANSFER_KIND: Record<HandKeptType, string | null> = {
  spaarrekening: "savings",
  beleggingen: "investments",
  betaalrekening: "other",
  bezitting: "other",
  gezamenlijk: null,
};

/** What a transfer to an imported account of this card type counts as, unless the account sets its own. */
export const BANK_CARD_TRANSFER_KIND: Record<string, string> = {
  savings: "savings",
  creditcard: "credit_card_payment",
  cash: "cash_withdrawal",
};

/** What a hand-kept account becomes once it is imported (src/lib/import-rows.ts). */
export const BANK_CARD_FOR_HAND_KEPT: Record<string, { cardType: string; transferKind: string | null }> = {
  spaarrekening: { cardType: "savings", transferKind: null },
  beleggingen: { cardType: "savings", transferKind: "investments" },
  betaalrekening: { cardType: "debitcard", transferKind: null },
  gezamenlijk: { cardType: "debitcard", transferKind: "shared_account" },
  bezitting: { cardType: "debitcard", transferKind: null },
};

/** Shorter names would match half the transactions. */
export const MIN_MATCH_NAME_LENGTH = 4;

/**
 * The other names stored in banks.matchNames / vermogenAccounts.matchNames (a JSON
 * array of strings), trimmed, blanks dropped. Bad JSON reads as no names.
 */
export function parseMatchNames(raw: string | string[] | null | undefined): string[] {
  if (raw == null) return [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean);
}

/** The value to store: names long enough to match, without repeats; null when none are left. */
export function serializeMatchNames(names: unknown): string | null {
  const list = Array.isArray(names) ? names : parseMatchNames(typeof names === "string" ? names : null);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const name of list) {
    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    const key = trimmed.toLowerCase().replace(/\s+/g, "");
    if (key.length < MIN_MATCH_NAME_LENGTH || seen.has(key)) continue;
    seen.add(key);
    kept.push(trimmed);
  }
  return kept.length ? JSON.stringify(kept) : null;
}

/** "No balance yet": a hand-kept account whose value was never entered. */
export function hasNoBalance(account: { value: number; lastUpdated: string | null }) {
  return account.value === 0 && !account.lastUpdated;
}
