import type Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { banks, transactions, vermogenAccounts } from "@/db/schema";
import { BANK_CARD_TRANSFER_KIND, HAND_KEPT_TRANSFER_KIND, JOINT_TYPE, MIN_MATCH_NAME_LENGTH, parseMatchNames } from "@/lib/account-names";
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
  matchNames?: string | null;
};

/** An account kept by hand that money can move to (not a joint account, see isHandKeptTransferTarget). */
type HandKeptRef = {
  accountNumber: string | null;
  matchNames: string | null;
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

const compact = (value: string) => value.toLowerCase().replace(/\s+/g, "");
const namesIn = (haystack: string, raw: string | null | undefined) =>
  parseMatchNames(raw).some((name) => compact(name).length >= MIN_MATCH_NAME_LENGTH && haystack.includes(compact(name)));

/** Money to or from a hand-kept account of this type is a transfer (a joint account's is spending). */
export function isHandKeptTransferTarget(type: string) {
  return type !== JOINT_TYPE;
}

/**
 * The import-time version of isInternalTransferExpr's account rules (pairs are found
 * after the rows are in): another imported account, or an account kept by hand.
 */
export function isOwnAccountTransfer(row: ImportedTransferRef, ownBanks: BankRef[], handKept: HandKeptRef[] = []) {
  const account = normalizeAccountNumber(row.account);
  const counterAccount = normalizeAccountNumber(row.counterAccount);
  const haystack = compact(`${row.name ?? ""} ${row.description ?? ""} ${counterAccount ?? ""}`);

  const byBank = ownBanks.some((bank) => {
    const bankAccount = normalizeAccountNumber(bank.accountNumber);
    const bankName = bank.displayName?.trim().toLowerCase();

    if (bankAccount && bankAccount !== account) {
      if (counterAccount === bankAccount) return true;
      if (haystack.includes(bankAccount.toLowerCase())) return true;
      if (namesIn(haystack, bank.matchNames)) return true;
    }

    return !!bankName && haystack.includes(bankName.replace(/\s+/g, ""));
  });
  return byBank || handKept.some((own) => {
    const number = normalizeAccountNumber(own.accountNumber);
    if (number && (counterAccount === number || haystack.includes(number.toLowerCase()))) return true;
    return namesIn(haystack, own.matchNames);
  });
}

const normalizedTransactionAccount = sql<string>`upper(replace(coalesce(${transactions.account}, ''), ' ', ''))`;
const normalizedCounterAccount = sql<string>`upper(replace(coalesce(${transactions.counterAccount}, ''), ' ', ''))`;
const normalizedDescription = sql<string>`lower(replace(coalesce(${transactions.description}, ''), ' ', ''))`;
const normalizedRawDescription = sql<string>`lower(replace(coalesce(${transactions.rawDescription}, ''), ' ', ''))`;
const normalizedBankAccount = sql<string>`upper(replace(coalesce(${banks.accountNumber}, ''), ' ', ''))`;
const normalizedBankName = sql<string>`lower(replace(coalesce(${banks.displayName}, ''), ' ', ''))`;
const normalizedHandKeptNumber = sql<string>`upper(replace(coalesce(${vermogenAccounts.accountNumber}, ''), ' ', ''))`;

// The row's text contains one of the names in a match_names column (a JSON array).
// instr, not like, so a "_" or "%" in a name is just a character.
const namesMatch = (column: typeof banks.matchNames | typeof vermogenAccounts.matchNames) => sql<boolean>`exists (
  select 1
  from json_each(case when json_valid(${column}) then ${column} else '[]' end) as match_name
  where length(replace(match_name.value, ' ', '')) >= ${MIN_MATCH_NAME_LENGTH}
    and (
      instr(${normalizedDescription}, lower(replace(match_name.value, ' ', ''))) > 0
      or instr(${normalizedRawDescription}, lower(replace(match_name.value, ' ', ''))) > 0
    )
)`;

// The row's counter account, number, name or other names point at another imported account.
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
      or ${namesMatch(banks.matchNames)}
    )
  ) or (
    ${normalizedBankName} <> ''
    and (
      instr(${normalizedDescription}, ${normalizedBankName}) > 0
      or instr(${normalizedRawDescription}, ${normalizedBankName}) > 0
    )
  )
)`;

// The hand-kept account the row's counter account, number or other names point at.
const handKeptMatch = sql<boolean>`(
  (
    ${normalizedHandKeptNumber} <> ''
    and (
      ${normalizedCounterAccount} = ${normalizedHandKeptNumber}
      or instr(${normalizedDescription}, lower(${normalizedHandKeptNumber})) > 0
      or instr(${normalizedRawDescription}, lower(${normalizedHandKeptNumber})) > 0
    )
  ) or ${namesMatch(vermogenAccounts.matchNames)}
)`;

// Money to or from an account kept by hand (Settings › Accounts): savings, investments,
// a checking account elsewhere. Not a joint account: money into that is spending.
const handKeptMatchExpr = sql<boolean>`exists (
  select 1
  from ${vermogenAccounts}
  where ${vermogenAccounts.active} = 1
    and ${vermogenAccounts.type} <> ${JOINT_TYPE}
    and ${handKeptMatch}
)`;

/**
 * Money moving between the owner's own accounts — never income or spending. Marked by
 * hand, or (unless the owner said "Not a transfer") an imported row that is half of a
 * pair between two imported accounts (src/lib/transfer-pairs.ts) or points at another
 * imported account or an account kept by hand.
 */
export const isInternalTransferExpr = sql<boolean>`(
  ${transactions.isManualTransfer} = 1
  or (
    ${transactions.notTransfer} = 0
    and ${transactions.source} in ('csv_import', 'bank')
    and (
      ${transactions.transferPairId} is not null
      or ${bankMatchExpr}
      or ${handKeptMatchExpr}
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

// An imported account's transfer kind: the one set on it, else what its card type implies.
const bankKind = sql.raw(
  `coalesce(banks.transfer_kind, case banks.card_type ${Object.entries(BANK_CARD_TRANSFER_KIND)
    .map(([card, kind]) => `when '${card}' then '${kind}'`)
    .join(" ")} end)`,
);
// What a transfer to a hand-kept account counts as, by its type.
const handKeptKind = sql.raw(
  `case vermogen_accounts.type ${Object.entries(HAND_KEPT_TRANSFER_KIND)
    .map(([type, kind]) => `when '${type}' then ${kind ? `'${kind}'` : "null"}`)
    .join(" ")} end`,
);

// The internal-transfer sub-type actually shown/used: a manual per-transaction override
// if set, otherwise inherited live from the account on the other side (so re-tagging an
// account updates every un-overridden transfer, not just future ones) — the counter
// account's bank, a hand-kept account the row points at, or the other leg's bank.
export const effectiveTransferTypeExpr = sql<string | null>`COALESCE(
  ${transactions.transferType},
  (
    select ${bankKind}
    from ${banks}
    where ${normalizedCounterAccount} <> ''
      and ${normalizedBankAccount} = ${normalizedCounterAccount}
      and ${bankKind} is not null
    limit 1
  ),
  (
    select ${handKeptKind}
    from ${vermogenAccounts}
    where ${vermogenAccounts.active} = 1
      and ${vermogenAccounts.type} <> ${JOINT_TYPE}
      and ${handKeptMatch}
    limit 1
  ),
  (
    select ${bankKind}
    from transactions pair_leg
    join ${banks} on ${normalizedBankAccount} = upper(replace(coalesce(pair_leg.account, ''), ' ', ''))
    where pair_leg.id = ${transactions.transferPairId}
      and ${bankKind} is not null
    limit 1
  )
)`;

/**
 * A transfer that puts money aside or takes it back: to or from a savings or investment
 * account, or filed in a savings-kind category. Out of income and spending like every
 * transfer; on Home and in Trends money going out this way counts as saved and money
 * coming back as taken from savings (Saved is net). Only the leg on the everyday
 * account counts, so a pair with an imported savings account isn't counted twice.
 */
export const savedTransferExpr = sql<boolean>`(
  ${transactions.excludeFromReports} = 0
  and ${isInternalTransferExpr}
  and (
    coalesce(${effectiveTransferTypeExpr}, '') in ('savings', 'investments')
    or (select c."group" from categories c where c.id = ${transactions.categoryId}) = 'savings'
  )
  and not exists (
    select 1
    from ${banks}
    where ${normalizedBankAccount} = ${normalizedTransactionAccount}
      and ${bankKind} in ('savings', 'investments')
  )
)`;
