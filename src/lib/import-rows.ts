import { db } from "@/db";
import { transactions, categories, categoryRules, banks, transactionSplits, type Bank } from "@/db/schema";
import { matchRules, applyAllRules } from "@/lib/apply-rules";
import { detectRecurringTransactions } from "@/lib/detect-recurring";
import { loadRecurringMatchers, matchRecurringItem } from "@/lib/recurring-match";
import { isOwnAccountTransfer, normalizeAccountNumber } from "@/lib/internal-transfers";
import { applyAllBrandRules } from "@/lib/apply-brand-rules";
import { isNotNull, sql, eq, inArray } from "drizzle-orm";
import type { ParsedRow } from "@/lib/bank-parsers";

export interface ImportResult {
  imported: number;
  skipped: number;
  autoCategorised: number;
  total: number;
  newAccounts: Bank[];
}

/**
 * Inserts already-parsed rows (from any bank parser, auto-detected or manually
 * mapped) into the database — categorisation, dedup, recurring/brand-rule matching,
 * and new-account discovery are identical regardless of where the rows came from.
 */
export async function importParsedRows(rows: ParsedRow[]): Promise<ImportResult> {
  // 1. Load all category rules (highest priority).
  const rules = await db.select().from(categoryRules);
  const recurringMatchers = await loadRecurringMatchers();
  const allBanks = await db.select().from(banks);
  const ownBanks = allBanks.map((b) => ({ accountNumber: b.accountNumber, displayName: b.displayName }));

  // Build banksByAccountNumber map for matchRules
  const banksByAccountNumber = new Map(
    allBanks.filter((b) => b.accountNumber).map((b) => [b.accountNumber!, b])
  );

  // 2. Build a "memory" map: description → categoryId from previously categorised transactions.
  const learned = await db
    .select({ id: transactions.id, description: transactions.description, categoryId: transactions.categoryId })
    .from(transactions)
    .where(isNotNull(transactions.categoryId))
    .orderBy(sql`${transactions.date} desc`);
  const splitRows = await db.select({ transactionId: transactionSplits.transactionId }).from(transactionSplits);
  const splitTransactionIds = new Set(splitRows.map((row) => row.transactionId));

  const learnedMap = new Map<string, number>();
  for (const row of learned) {
    if (splitTransactionIds.has(row.id)) continue;
    const key = row.description.toLowerCase();
    if (!learnedMap.has(key)) learnedMap.set(key, row.categoryId!);
  }

  // 3. Keyword fallback: match category names against the description.
  const cats = await db.select().from(categories);
  const catMap = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));

  // Look up the "Tikkies Inkomst" category ID for auto-assigning reimbursements
  const tikkiesInkomstId = catMap.get("tikkies inkomst") ?? null;

  function guessCategory(name: string, rawDescription: string, amount: number, direction: string, account: string | null): number | null {
    // Priority 1: explicit rules
    const ruleMatch = matchRules(name, amount, direction, account, rules, banksByAccountNumber);
    if (ruleMatch !== null) return ruleMatch;

    // Priority 2: learned from past manual categorisations
    if (learnedMap.has(name.toLowerCase())) return learnedMap.get(name.toLowerCase())!;

    // Priority 3: keyword match against category names
    const combined = (name + " " + rawDescription).toLowerCase();
    for (const [catName, id] of catMap) {
      if (combined.includes(catName)) return id;
    }

    return null;
  }

  let imported = 0;
  let skipped = 0;
  let autoCategorised = 0;

  for (const row of rows) {
    // Detect incoming Tikkies (reimbursements) — "Tikkie" in name or description + income direction
    const isTikkie = (row.name + " " + row.description).toLowerCase().includes("tikkie");
    const isReimbursement = row.direction === "income" && isTikkie;
    const isInternalTransfer = isOwnAccountTransfer(
      {
        account: row.account,
        counterAccount: row.counterAccount,
        name: row.name,
        description: row.description,
      },
      ownBanks,
    );

    // A matching recurring item (specific pattern + optional amount) sets both the
    // category and the recurringItemId link, taking priority over generic guessing.
    const recurringMatch = matchRecurringItem(row.name, row.amount, recurringMatchers);
    let categoryId = recurringMatch?.categoryId
      ?? guessCategory(row.name, row.description, row.amount, row.direction, normalizeAccountNumber(row.account));
    if (isInternalTransfer) categoryId = null;
    // Force "Tikkies Inkomst" for auto-detected reimbursements if available
    if (isReimbursement && tikkiesInkomstId) categoryId = tikkiesInkomstId;

    try {
      await db.insert(transactions).values({
        date: row.date,
        direction: row.direction,
        type: row.direction === "income" ? "inkomen" : "variabel",
        amount: row.amount,
        description: row.name,
        rawDescription: row.description,
        categoryId,
        recurringItemId: isInternalTransfer ? null : (recurringMatch?.id ?? null),
        isReimbursement,
        source: "csv_import",
        importHash: row.hash,
        account: normalizeAccountNumber(row.account),
        counterAccount: normalizeAccountNumber(row.counterAccount),
      });
      imported++;
      // Only count categorisations that belong to rows we actually inserted — otherwise
      // duplicates (skipped below) inflate the count past `imported`.
      if (categoryId && !isInternalTransfer) autoCategorised++;
    } catch {
      // Transaction already exists — backfill bank metadata for existing pre-feature imports.
      const account = normalizeAccountNumber(row.account);
      const counterAccount = normalizeAccountNumber(row.counterAccount);
      if (account || counterAccount) {
        const patch: { account?: string; counterAccount?: string } = {};
        if (account) patch.account = account;
        if (counterAccount) patch.counterAccount = counterAccount;
        await db
          .update(transactions)
          .set(patch)
          .where(eq(transactions.importHash, row.hash));
      }
      skipped++;
    }
  }

  // Auto-upsert discovered bank account numbers (never overwrite user-set metadata).
  // Accounts not already present before this import are reported back so the client
  // can prompt for a starting saldo/date on them.
  const existingAccountNumbers = new Set(allBanks.map((b) => b.accountNumber).filter(Boolean));
  const distinctAccounts = [...new Set(rows.map((r) => normalizeAccountNumber(r.account)).filter(Boolean))] as string[];
  const newAccountNumbers: string[] = [];
  for (const acct of distinctAccounts) {
    await db.insert(banks).values({ accountNumber: acct }).onConflictDoNothing();
    if (!existingAccountNumbers.has(acct)) newAccountNumbers.push(acct);
  }
  const newAccounts = newAccountNumbers.length > 0
    ? await db.select().from(banks).where(inArray(banks.accountNumber, newAccountNumbers))
    : [];

  await applyAllBrandRules();

  // Now that the new rows are in, detect any newly-recurring transactions (creates recurring
  // items) and link every transaction to its matching item.
  await detectRecurringTransactions();
  await applyAllRules();

  return { imported, skipped, autoCategorised, total: rows.length, newAccounts };
}
