import { db } from "@/db";
import { transactions, categories, categoryRules, banks, transactionSplits, type Bank } from "@/db/schema";
import { matchRules, applyAllRules } from "@/lib/apply-rules";
import { detectRecurringTransactions } from "@/lib/detect-recurring";
import { loadRecurringMatchers, matchRecurringItem } from "@/lib/recurring-match";
import { isOwnAccountTransfer, normalizeAccountNumber } from "@/lib/internal-transfers";
import { applyAllBrandRules } from "@/lib/apply-brand-rules";
import { assignMissingMerchants, getOrCreateMerchantId } from "@/lib/merchants";
import { deriveMerchantName } from "@/lib/merchant-name";
import { and, isNotNull, isNull, sql, eq, inArray } from "drizzle-orm";
import type { ParsedRow } from "@/lib/bank-parsers";
import { isValidISODate } from "@/lib/date-valid";

export interface ImportResult {
  imported: number;
  skipped: number;
  autoCategorised: number;
  /** Rows dropped because their date wasn't a real YYYY-MM-DD. Normally 0 — the mapping
   *  dialog rejects such files up front — but the built-in bank parsers pass unmatched
   *  date cells straight through, so this is the last line of defence. */
  invalidDates: number;
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
  let invalidDates = 0;

  for (const row of rows) {
    // transactions.date has no CHECK constraint, and the insert below is wrapped in a
    // catch that treats every failure as "duplicate" — so an unreadable date would be
    // stored silently and then crash every screen that formats it. Drop it here instead.
    if (!isValidISODate(row.date)) {
      invalidDates++;
      continue;
    }

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

    // Merchant profile for this row. Internal transfers are between your own accounts,
    // so they never get one — the counterparty there is you, not a shop.
    const merchantName = isInternalTransfer ? null : deriveMerchantName({ description: row.name, rawDescription: row.description });
    const merchantId = merchantName ? await getOrCreateMerchantId(merchantName) : null;

    try {
      await db.insert(transactions).values({
        date: row.date,
        direction: row.direction,
        type: row.direction === "income" ? "inkomen" : "variabel",
        amount: row.amount,
        description: row.name,
        rawDescription: row.description,
        categoryId,
        merchantId,
        recurringItemId: isInternalTransfer ? null : (recurringMatch?.id ?? null),
        isReimbursement,
        source: "csv_import",
        importHash: row.hash,
        account: normalizeAccountNumber(row.account),
        counterAccount: normalizeAccountNumber(row.counterAccount),
        // Verbatim from the bank when the file had a balance column; null otherwise.
        reportedBalance: row.reportedBalance ?? null,
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
      // Same idea for the bank-reported balance: a row imported before the balance
      // column was mapped can still learn it from a re-import. Guarded by IS NULL so a
      // balance already on record is never overwritten — it's the bank's number, and
      // the first import of it wins.
      if (row.reportedBalance != null) {
        await db
          .update(transactions)
          .set({ reportedBalance: row.reportedBalance })
          .where(and(eq(transactions.importHash, row.hash), isNull(transactions.reportedBalance)));
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

  // Safety net for rows that slipped through without a merchant (e.g. duplicates whose
  // bank metadata was backfilled above). No-op when everything already has one.
  await assignMissingMerchants();

  // Now that the new rows are in, detect any newly-recurring transactions (creates recurring
  // items) and link every transaction to its matching item.
  await detectRecurringTransactions();
  await applyAllRules();

  return { imported, skipped, autoCategorised, invalidDates, total: rows.length, newAccounts };
}
