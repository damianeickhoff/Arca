import { sql } from "drizzle-orm";
import { banks, transactions } from "@/db/schema";

type BankRef = {
  accountNumber: string | null;
  displayName: string | null;
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

export function isOwnAccountTransfer(row: ImportedTransferRef, ownBanks: BankRef[]) {
  const account = normalizeAccountNumber(row.account);
  const counterAccount = normalizeAccountNumber(row.counterAccount);
  const haystack = `${row.name ?? ""} ${row.description ?? ""} ${counterAccount ?? ""}`.toLowerCase().replace(/\s+/g, "");

  return ownBanks.some((bank) => {
    const bankAccount = normalizeAccountNumber(bank.accountNumber);
    const bankName = bank.displayName?.trim().toLowerCase();

    if (bankAccount && bankAccount !== account) {
      if (counterAccount === bankAccount) return true;
      if (haystack.includes(bankAccount.toLowerCase())) return true;
    }

    return !!bankName && haystack.includes(bankName.replace(/\s+/g, ""));
  });
}

const normalizedTransactionAccount = sql<string>`upper(replace(coalesce(${transactions.account}, ''), ' ', ''))`;
const normalizedCounterAccount = sql<string>`upper(replace(coalesce(${transactions.counterAccount}, ''), ' ', ''))`;
const normalizedDescription = sql<string>`lower(replace(coalesce(${transactions.description}, ''), ' ', ''))`;
const normalizedRawDescription = sql<string>`lower(replace(coalesce(${transactions.rawDescription}, ''), ' ', ''))`;
const normalizedBankAccount = sql<string>`upper(replace(coalesce(${banks.accountNumber}, ''), ' ', ''))`;
const normalizedBankName = sql<string>`lower(replace(coalesce(${banks.displayName}, ''), ' ', ''))`;

export const isInternalTransferExpr = sql<boolean>`(
  ${transactions.isManualTransfer} = 1
  or (
    ${transactions.source} = 'csv_import'
    and exists (
      select 1
      from ${banks}
      where (
        ${normalizedBankAccount} <> ''
        and ${normalizedBankAccount} <> ${normalizedTransactionAccount}
        and (
          ${normalizedCounterAccount} = ${normalizedBankAccount}
          or ${normalizedDescription} like '%' || lower(${normalizedBankAccount}) || '%'
          or ${normalizedRawDescription} like '%' || lower(${normalizedBankAccount}) || '%'
        )
      ) or (
        ${normalizedBankName} <> ''
        and (
          ${normalizedDescription} like '%' || ${normalizedBankName} || '%'
          or ${normalizedRawDescription} like '%' || ${normalizedBankName} || '%'
        )
      )
    )
  )
)`;

export const notInternalTransferCondition = sql<boolean>`not (${isInternalTransferExpr})`;

// The internal-transfer sub-type actually shown/used: a manual per-transaction override
// if set, otherwise inherited live from the opposite account's tagged kind (so re-tagging
// an account updates every un-overridden transfer transaction, not just future ones).
export const effectiveTransferTypeExpr = sql<string | null>`COALESCE(
  ${transactions.transferType},
  (
    select ${banks.transferKind}
    from ${banks}
    where ${normalizedCounterAccount} <> ''
      and ${normalizedBankAccount} = ${normalizedCounterAccount}
      and ${banks.transferKind} is not null
    limit 1
  )
)`;
