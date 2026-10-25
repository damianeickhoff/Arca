import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, ownAccounts, transactions, type OwnAccount } from "@/db/schema";
import { isInternalTransferExpr, normalizeAccountNumber } from "@/lib/internal-transfers";

// Own accounts found in the transactions that still count as income or spending,
// offered in Settings › Accounts for one tap: an ING savings account ("Oranje
// spaarrekening M58896551"), an investment account ("Beleggingsrek. 15391118"), card
// top-ups ("Revolut**4527*") and a joint account ("Hr X,Mw Y" with money both ways).
// The owner decides; nothing is added on its own.

export type OwnAccountKind = "savings" | "investments" | "shared_account" | "other";

export type OwnAccountSuggestion = {
  /** Stable id for dismissing: the account number or the match text. */
  key: string;
  name: string;
  accountNumber: string | null;
  matchText: string | null;
  transferKind: OwnAccountKind;
  count: number;
  total: number;
};

export type SuggestionRow = {
  description: string | null;
  rawDescription: string | null;
  counterAccount: string | null;
  direction: string;
  amount: number;
};

const SAVINGS = /\b((?:oranje\s+)?spaarrekening)\s+([a-z]?\d{6,})/i;
const INVESTMENT = /\b(beleggingsrek(?:ening)?\.?)\s+(\d{6,})/i;
const TOP_UP = /\b(revolut\*\*\d{4})\*/i;
// The receiving side of a top-up ("Apple Pay Top-Up by *4128") whose card payment is
// not imported, so no pair was found for it.
const TOP_UP_IN = /\btop-up\b/i;
// ING's name for a joint account: "Hr J Jansen,Mw A de Vries" (en/of between banks).
const JOINT = /^((?:hr|mw|dhr|mevr)\.?\s[^,]+,\s*(?:hr|mw|dhr|mevr)\.?\s[^(]+?)\s*(?:\(|via\b|$)/i;

const MIN_JOINT_ROWS = 3;

export function suggestOwnAccounts(rows: SuggestionRow[], existing: Pick<OwnAccount, "accountNumber" | "matchText">[], dismissed: string[] = []): OwnAccountSuggestion[] {
  const found = new Map<string, OwnAccountSuggestion & { directions: Set<string> }>();
  const add = (key: string, base: Omit<OwnAccountSuggestion, "key" | "count" | "total">, row: SuggestionRow) => {
    const s = found.get(key) ?? { key, ...base, count: 0, total: 0, directions: new Set<string>() };
    s.count++;
    s.total += row.amount;
    s.directions.add(row.direction);
    found.set(key, s);
  };

  for (const row of rows) {
    const text = `${row.description ?? ""} ${row.rawDescription ?? ""}`;
    const savings = text.match(SAVINGS);
    if (savings) {
      const number = savings[2].toUpperCase();
      add(number, { name: `${capitalize(savings[1])} ${number}`, accountNumber: number, matchText: null, transferKind: "savings" }, row);
      continue;
    }
    const investment = text.match(INVESTMENT);
    if (investment) {
      add(investment[2], { name: `${capitalize(investment[1])} ${investment[2]}`, accountNumber: investment[2], matchText: null, transferKind: "investments" }, row);
      continue;
    }
    const topUp = text.match(TOP_UP);
    if (topUp) {
      const match = topUp[1].replace(/^./, (c) => c.toUpperCase());
      add(match.toLowerCase(), { name: match, accountNumber: null, matchText: match, transferKind: "other" }, row);
      continue;
    }
    if (row.direction === "income" && TOP_UP_IN.test(text)) {
      add("top-up", { name: "Top-Up", accountNumber: null, matchText: "Top-Up", transferKind: "other" }, row);
      continue;
    }
    const counter = normalizeAccountNumber(row.counterAccount);
    const joint = counter ? (row.description ?? "").trim().match(JOINT) : null;
    if (counter && joint) add(counter, { name: joint[1].trim(), accountNumber: counter, matchText: null, transferKind: "shared_account" }, row);
  }

  const taken = new Set([
    ...existing.map((o) => normalizeAccountNumber(o.accountNumber)).filter((v): v is string => !!v),
    ...existing.map((o) => o.matchText?.toLowerCase().replace(/\s+/g, "")).filter((v): v is string => !!v),
    ...dismissed,
  ]);
  return [...found.values()]
    .filter((s) => !taken.has(s.key) && !taken.has(s.key.toLowerCase().replace(/\s+/g, "")))
    // A joint account is money both ways, often; one payment to a couple is not one.
    .filter((s) => s.transferKind !== "shared_account" || (s.count >= MIN_JOINT_ROWS && s.directions.size === 2))
    .sort((a, b) => b.total - a.total)
    .map((s) => ({
      key: s.key,
      name: s.name,
      accountNumber: s.accountNumber,
      matchText: s.matchText,
      transferKind: s.transferKind,
      count: s.count,
      total: Math.round(s.total * 100) / 100,
    }));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

const DISMISSED_KEY = "own_account_suggestions_dismissed";

async function getDismissed(): Promise<string[]> {
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, DISMISSED_KEY)).limit(1);
    const parsed = JSON.parse(row?.value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** "Not mine": the suggestion stays hidden. */
export async function dismissOwnAccountSuggestion(key: string) {
  const dismissed = await getDismissed();
  if (dismissed.includes(key)) return;
  const value = JSON.stringify([...dismissed, key]);
  await db.insert(appSettings).values({ key: DISMISSED_KEY, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

/** The suggestions for the imported rows that still count as income or spending. */
export async function listOwnAccountSuggestions(): Promise<OwnAccountSuggestion[]> {
  const [rows, existing, dismissed] = await Promise.all([
    db
      .select({
        description: transactions.description,
        rawDescription: transactions.rawDescription,
        counterAccount: transactions.counterAccount,
        direction: transactions.direction,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(and(inArray(transactions.source, ["csv_import", "bank"]), sql`not (${isInternalTransferExpr})`)),
    db.select({ accountNumber: ownAccounts.accountNumber, matchText: ownAccounts.matchText }).from(ownAccounts),
    getDismissed(),
  ]);
  return suggestOwnAccounts(rows, existing, dismissed);
}
