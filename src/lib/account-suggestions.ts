import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, banks, transactions, vermogenAccounts } from "@/db/schema";
import { parseMatchNames, type HandKeptType } from "@/lib/account-names";
import { isInternalTransferExpr, normalizeAccountNumber } from "@/lib/internal-transfers";

// Accounts found in the transactions that still count as income or spending, offered
// in Settings › Accounts: an ING savings account ("Oranje spaarrekening M58896551"), an
// investment account ("Beleggingsrek. 15391118"), a joint account ("Hr X,Mw Y" with
// money both ways) — each with its type already chosen — and the card payments that
// top up an imported account ("Revolut**4527*" → another name for Revolut). The owner
// decides; nothing is added on its own.

type Found = { key: string; name: string; count: number; total: number };

export type AccountSuggestion = Found &
  (
    | { target: "new"; type: HandKeptType; accountNumber: string | null; matchNames: string[] }
    | { target: "bank"; bankId: number; bankName: string; matchName: string }
  );

export type SuggestionRow = {
  description: string | null;
  rawDescription: string | null;
  counterAccount: string | null;
  direction: string;
  amount: number;
};

export type KnownAccount = { id?: number; kind: "bank" | "handKept"; name: string | null; accountNumber: string | null; matchNames: string | null };

const SAVINGS = /\b((?:oranje\s+)?spaarrekening)\s+([a-z]?\d{6,})/i;
const INVESTMENT = /\b(beleggingsrek(?:ening)?\.?)\s+(\d{6,})/i;
// A card payment that tops up an account elsewhere: "Revolut**4527* Dublin".
const TOP_UP = /\b((revolut|bunq|n26|wise)\*\*\d{4})\*/i;
// ING's name for a joint account: "Hr J Jansen,Mw A de Vries" (en/of between banks).
const JOINT = /^((?:hr|mw|dhr|mevr)\.?\s[^,]+,\s*(?:hr|mw|dhr|mevr)\.?\s[^(]+?)\s*(?:\(|via\b|$)/i;

const MIN_JOINT_ROWS = 3;

const compact = (value: string) => value.toLowerCase().replace(/\s+/g, "");
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

export function suggestAccounts(rows: SuggestionRow[], known: KnownAccount[], dismissed: string[] = []): AccountSuggestion[] {
  const found = new Map<string, AccountSuggestion & { directions: Set<string> }>();
  const add = (suggestion: AccountSuggestion, row: SuggestionRow) => {
    const s = found.get(suggestion.key) ?? { ...suggestion, directions: new Set<string>() };
    s.count++;
    s.total += row.amount;
    s.directions.add(row.direction);
    found.set(suggestion.key, s);
  };
  const base = (key: string, name: string) => ({ key, name, count: 0, total: 0 });
  const banksByBrand = (brand: string) => known.find((k) => k.kind === "bank" && k.id != null && compact(k.name ?? "").includes(brand.toLowerCase()));

  for (const row of rows) {
    const text = `${row.description ?? ""} ${row.rawDescription ?? ""}`;
    const savings = text.match(SAVINGS);
    if (savings) {
      const number = savings[2].toUpperCase();
      add({ ...base(number, `${capitalize(savings[1])} ${number}`), target: "new", type: "spaarrekening", accountNumber: number, matchNames: [] }, row);
      continue;
    }
    const investment = text.match(INVESTMENT);
    if (investment) {
      add({ ...base(investment[2], `${capitalize(investment[1])} ${investment[2]}`), target: "new", type: "beleggingen", accountNumber: investment[2], matchNames: [] }, row);
      continue;
    }
    const topUp = text.match(TOP_UP);
    if (topUp) {
      const name = capitalize(topUp[2]) + topUp[1].slice(topUp[2].length);
      const bank = banksByBrand(topUp[2]);
      add(
        bank
          ? { ...base(compact(name), name), target: "bank", bankId: bank.id!, bankName: bank.name ?? name, matchName: name }
          : { ...base(compact(name), capitalize(topUp[2])), target: "new", type: "betaalrekening", accountNumber: null, matchNames: [name] },
        row,
      );
      continue;
    }
    const counter = normalizeAccountNumber(row.counterAccount);
    const joint = counter ? (row.description ?? "").trim().match(JOINT) : null;
    if (counter && joint) {
      add({ ...base(counter, joint[1].trim()), target: "new", type: "gezamenlijk", accountNumber: counter, matchNames: [] }, row);
    }
  }

  const taken = new Set([
    ...known.map((k) => normalizeAccountNumber(k.accountNumber)).filter((v): v is string => !!v),
    ...known.flatMap((k) => parseMatchNames(k.matchNames).map(compact)),
    ...dismissed,
  ]);
  return [...found.values()]
    .filter((s) => !taken.has(s.key) && !taken.has(compact(s.key)))
    // A joint account is money both ways, often; one payment to a couple is not one.
    .filter((s) => s.target !== "new" || s.type !== "gezamenlijk" || (s.count >= MIN_JOINT_ROWS && s.directions.size === 2))
    .sort((a, b) => b.total - a.total)
    .map((s) => {
      const out: Partial<typeof s> = { ...s, total: Math.round(s.total * 100) / 100 };
      delete out.directions;
      return out as AccountSuggestion;
    });
}

const DISMISSED_KEY = "account_suggestions_dismissed";

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
export async function dismissAccountSuggestion(key: string) {
  const dismissed = await getDismissed();
  if (dismissed.includes(key)) return;
  const value = JSON.stringify([...dismissed, key]);
  await db.insert(appSettings).values({ key: DISMISSED_KEY, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

/** The suggestions for the imported rows that still count as income or spending. */
export async function listAccountSuggestions(): Promise<AccountSuggestion[]> {
  const [rows, bankRows, handKept, dismissed] = await Promise.all([
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
    db.select({ id: banks.id, name: banks.displayName, accountNumber: banks.accountNumber, matchNames: banks.matchNames }).from(banks),
    db
      .select({ name: vermogenAccounts.name, accountNumber: vermogenAccounts.accountNumber, matchNames: vermogenAccounts.matchNames })
      .from(vermogenAccounts)
      .where(eq(vermogenAccounts.active, true)),
    getDismissed(),
  ]);
  const known: KnownAccount[] = [
    ...bankRows.map((b) => ({ ...b, kind: "bank" as const })),
    ...handKept.map((v) => ({ ...v, kind: "handKept" as const })),
  ];
  return suggestAccounts(rows, known, dismissed);
}
