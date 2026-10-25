import type Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { banks, ownAccounts, transactions } from "@/db/schema";
import { pairTransfers, unpairTransfer } from "@/lib/transfer-pairs";

const client = () => (db as unknown as { $client: Database.Database }).$client;

/** Pairs the moves between imported accounts that are not paired yet (after an import or sync). */
export function pairNewTransfers() {
  return pairTransfers(client());
}

/** Breaks the pair a transaction is in, both legs ("Not a transfer"). */
export function breakTransferPair(id: number) {
  unpairTransfer(client(), id);
}

type BankRef = {
  accountNumber: string | null;
  displayName: string | null;
};

type OwnAccountRef = {
  accountNumber: string | null;
  matchText: string | null;
};

type ImportedTransferRef = {
  account?: string | null;
  counterAccount?: string | null;
  name?: string | null;
  description?: string | null;
};

export function normalizeAccountNumber(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, "").trim().toUpperCase() ?? "";
  return normalized || null;
}

/**
 * The import-time version of isInternalTransferExpr's account rules (pairs are found
 * after the rows are in): an imported account or an own account that is not imported.
 */
export function isOwnAccountTransfer(row: ImportedTransferRef, ownBanks: BankRef[], others: OwnAccountRef[] = []) {
  const account = normalizeAccountNumber(row.account);
  const counterAccount = normalizeAccountNumber(row.counterAccount);
  const haystack = `${row.name ?? ""} ${row.description ?? ""} ${counterAccount ?? ""}`.toLowerCase().replace(/\s+/g, "");

  const byBank = ownBanks.some((bank) => {
    const bankAccount = normalizeAccountNumber(bank.accountNumber);
    const bankName = bank.displayName?.trim().toLowerCase();

    if (bankAccount && bankAccount !== account) {
      if (counterAccount === bankAccount) return true;
      if (haystack.includes(bankAccount.toLowerCase())) return true;
    }

    return !!bankName && haystack.includes(bankName.replace(/\s+/g, ""));
  });
  return byBank || others.some((own) => {
    const number = normalizeAccountNumber(own.accountNumber);
    const text = own.matchText?.toLowerCase().replace(/\s+/g, "");
    if (number && (counterAccount === number || haystack.includes(number.toLowerCase()))) return true;
    return !!text && haystack.includes(text);
  });
}

const normalizedTransactionAccount = sql<string>`upper(replace(coalesce(${transactions.account}, ''), ' ', ''))`;
const normalizedCounterAccount = sql<string>`upper(replace(coalesce(${transactions.counterAccount}, ''), ' ', ''))`;
const normalizedDescription = sql<string>`lower(replace(coalesce(${transactions.description}, ''), ' ', ''))`;
const normalizedRawDescription = sql<string>`lower(replace(coalesce(${transactions.rawDescription}, ''), ' ', ''))`;
const normalizedBankAccount = sql<string>`upper(replace(coalesce(${banks.accountNumber}, ''), ' ', ''))`;
const normalizedBankName = sql<string>`lower(replace(coalesce(${banks.displayName}, ''), ' ', ''))`;
const normalizedOwnNumber = sql<string>`upper(replace(coalesce(${ownAccounts.accountNumber}, ''), ' ', ''))`;
const normalizedOwnText = sql<string>`lower(replace(coalesce(${ownAccounts.matchText}, ''), ' ', ''))`;

// The row's counter account or text names another imported account.
const bankMatchExpr = sql<boolean>`exists (
  select 1
  from ${banks}
  where (
    ${normalizedBankAccount} <> ''
    and ${normalizedBankAccount} <> ${normalizedTransactionAccount}
    and (
      ${normalizedCounterAccount} = ${normalizedBankAccount}
      or instr(${normalizedDescription}, lower(${normalizedBankAccount})) > 0
      or instr(${normalizedRawDescription}, lower(${normalizedBankAccount})) > 0
    )
  ) or (
    ${normalizedBankName} <> ''
    and (
      instr(${normalizedDescription}, ${normalizedBankName}) > 0
      or instr(${normalizedRawDescription}, ${normalizedBankName}) > 0
    )
  )
)`;

// The row's counter account or text names an own account that is not imported
// (Settings › Accounts › Own accounts): a savings or investment account, a joint account,
// a card top-up. instr, not like, so a "_" or "%" in the match text is just a character.
const ownAccountMatchExpr = sql<boolean>`exists (
  select 1
  from ${ownAccounts}
  where (
    ${normalizedOwnNumber} <> ''
    and (
      ${normalizedCounterAccount} = ${normalizedOwnNumber}
      or instr(${normalizedDescription}, lower(${normalizedOwnNumber})) > 0
      or instr(${normalizedRawDescription}, lower(${normalizedOwnNumber})) > 0
    )
  ) or (
    ${normalizedOwnText} <> ''
    and (
      instr(${normalizedDescription}, ${normalizedOwnText}) > 0
      or instr(${normalizedRawDescription}, ${normalizedOwnText}) > 0
    )
  )
)`;

/**
 * Money moving between the owner's own accounts — never income or spending. Marked by
 * hand, or (unless the owner said "Not a transfer") an imported row that is half of a
 * pair between two imported accounts (src/lib/transfer-pairs.ts) or names another
 * imported account or an own account that is not imported.
 */
export const isInternalTransferExpr = sql<boolean>`(
  ${transactions.isManualTransfer} = 1
  or (
    ${transactions.notTransfer} = 0
    and ${transactions.source} in ('csv_import', 'bank')
    and (
      ${transactions.transferPairId} is not null
      or ${bankMatchExpr}
      or ${ownAccountMatchExpr}
    )
  )
)`;

export const notInternalTransferCondition = sql<boolean>`not (${isInternalTransferExpr})`;

/**
 * The one test for "left out of every total" (Home, Activity totals, Budget, Insights,
 * Merchants): an internal transfer, or a row the owner excluded from reports.
 */
export const outOfReportsExpr = sql<boolean>`(${transactions.excludeFromReports} = 1 or ${isInternalTransferExpr})`;

/** Rows that count in reports: the opposite of outOfReportsExpr, for a WHERE. */
export const countsInReportsCondition = sql<boolean>`not (${outOfReportsExpr})`;

// The internal-transfer sub-type actually shown/used: a manual per-transaction override
// if set, otherwise inherited live from the opposite account's tagged kind (so re-tagging
// an account updates every un-overridden transfer transaction, not just future ones) —
// the counter account's bank, an own account the row matches, or the other leg's bank.
export const effectiveTransferTypeExpr = sql<string | null>`COALESCE(
  ${transactions.transferType},
  (
    select ${banks.transferKind}
    from ${banks}
    where ${normalizedCounterAccount} <> ''
      and ${normalizedBankAccount} = ${normalizedCounterAccount}
      and ${banks.transferKind} is not null
    limit 1
  ),
  (
    select ${ownAccounts.transferKind}
    from ${ownAccounts}
    where (
      ${normalizedOwnNumber} <> ''
      and (
        ${normalizedCounterAccount} = ${normalizedOwnNumber}
        or instr(${normalizedDescription}, lower(${normalizedOwnNumber})) > 0
        or instr(${normalizedRawDescription}, lower(${normalizedOwnNumber})) > 0
      )
    ) or (
      ${normalizedOwnText} <> ''
      and (
        instr(${normalizedDescription}, ${normalizedOwnText}) > 0
        or instr(${normalizedRawDescription}, ${normalizedOwnText}) > 0
      )
    )
    limit 1
  ),
  (
    select ${banks.transferKind}
    from transactions pair_leg
    join ${banks} on ${normalizedBankAccount} = upper(replace(coalesce(pair_leg.account, ''), ' ', ''))
    where pair_leg.id = ${transactions.transferPairId}
      and ${banks.transferKind} is not null
    limit 1
  )
)`;

/**
 * A transfer that puts money aside: to an own savings or investment account, or filed in
 * a savings-kind category. Out of income and spending like every transfer, but money
 * going out this way still counts as saved (Home's Saved, Trends' "saved").
 */
export const savedTransferExpr = sql<boolean>`(
  ${transactions.excludeFromReports} = 0
  and ${isInternalTransferExpr}
  and (
    coalesce(${effectiveTransferTypeExpr}, '') in ('savings', 'investments')
    or (select c."group" from categories c where c.id = ${transactions.categoryId}) = 'savings'
  )
)`;
