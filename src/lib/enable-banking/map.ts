import { createHash } from "node:crypto";
import type { ParsedRow } from "@/lib/bank-parsers";
import { normalizeAccountNumber } from "@/lib/internal-transfers";

// Turning Enable Banking transactions into the rows the CSV import already knows how to
// store (src/lib/import-rows.ts), and the two duplicate checks a bank sync needs. Pure,
// so tests/lib/enable-banking.test.ts can pin them.

interface EbAmount {
  amount: string;
  currency?: string;
}

interface EbParty {
  name?: string | null;
}

interface EbAccountRef {
  iban?: string | null;
  other?: { identification?: string | null } | null;
}

/** The fields of an Enable Banking transaction Centje reads (API reference: Transaction). */
export interface EbTransaction {
  entry_reference?: string | null;
  transaction_id?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  transaction_amount: EbAmount;
  credit_debit_indicator: "CRDT" | "DBIT";
  status?: string | null;
  creditor?: EbParty | null;
  creditor_account?: EbAccountRef | null;
  debtor?: EbParty | null;
  debtor_account?: EbAccountRef | null;
  remittance_information?: string[] | null;
  balance_after_transaction?: EbAmount | null;
  bank_transaction_code?: { description?: string | null; code?: string | null; sub_code?: string | null } | null;
  note?: string | null;
}

const roundCents = (n: number) => Math.round(n * 100) / 100;

function amountOf(value: EbAmount | null | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(String(value.amount).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function accountRef(ref: EbAccountRef | null | undefined): string {
  return normalizeAccountNumber(ref?.iban ?? ref?.other?.identification ?? null) ?? "";
}

/** The day the money moved: booked date first, as a bank statement (and its CSV) does. */
export function transactionDate(tx: EbTransaction): string | null {
  const raw = tx.booking_date ?? tx.value_date ?? tx.transaction_date ?? null;
  const m = raw ? /^(\d{4}-\d{2}-\d{2})/.exec(raw) : null;
  return m ? m[1] : null;
}

/**
 * The duplicate key for a bank row, stored in transactions.import_hash like a CSV row's.
 * Keyed on the account's IBAN, never the session's account uid: a reconnect after the
 * consent expires gives every account a new uid, and the same transactions must still
 * be recognised. `transaction_id` is the bank's own immutable id where it sends one
 * (Enable Banking guarantees it across sessions); without it, the bank's entry
 * reference; without either, what the transaction says about itself.
 */
export function bankTransactionHash(tx: EbTransaction, iban: string): string {
  const account = normalizeAccountNumber(iban) ?? "";
  const id = tx.transaction_id?.trim() || (tx.entry_reference?.trim() ? `ref:${tx.entry_reference.trim()}` : null);
  const key = id
    ? `eb|${account}|${id}`
    : [
        "eb",
        account,
        transactionDate(tx) ?? "",
        tx.transaction_amount.amount,
        tx.credit_debit_indicator,
        accountRef(tx.credit_debit_indicator === "DBIT" ? tx.creditor_account : tx.debtor_account),
        (tx.remittance_information ?? []).join(" "),
      ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * One bank transaction as a ParsedRow. `account` is the account number the rows are
 * filed under in Centje (the linked bank's number, normally the IBAN itself). Returns
 * null for a row that can't be stored: no date, or no readable amount.
 */
export function mapEnableBankingTransaction(tx: EbTransaction, link: { iban: string; account: string }): ParsedRow | null {
  const date = transactionDate(tx);
  const signed = amountOf(tx.transaction_amount);
  if (!date || signed == null) return null;

  const direction: ParsedRow["direction"] = tx.credit_debit_indicator === "CRDT" ? "income" : "expense";
  // The other side: who was paid on a debit, who paid on a credit.
  const party = direction === "expense" ? tx.creditor : tx.debtor;
  const partyAccount = direction === "expense" ? tx.creditor_account : tx.debtor_account;
  const remittance = (tx.remittance_information ?? []).map((s) => s.trim()).filter(Boolean);
  const code = tx.bank_transaction_code;

  const name = party?.name?.trim() || remittance[0] || code?.description?.trim() || tx.note?.trim() || "";
  const description = remittance.join(" ") || name;

  return {
    date,
    name,
    account: normalizeAccountNumber(link.account) ?? "",
    counterAccount: accountRef(partyAccount),
    code: code?.code?.trim() ?? "",
    direction,
    amount: Math.abs(roundCents(signed)),
    type: code?.description?.trim() ?? "",
    description,
    hash: bankTransactionHash(tx, link.iban),
    reportedBalance: amountOf(tx.balance_after_transaction),
  };
}

/** A transaction already in Centje, as the cross-source check compares it. */
export interface ExistingRowRef {
  date: string;
  amount: number;
  direction: string;
}

const matchKey = (date: string, amount: number, direction: string) => `${date}|${roundCents(Math.abs(amount)).toFixed(2)}|${direction}`;

/**
 * Splits bank rows into the ones to import and the ones a CSV import (or a manual entry
 * on the same account) already brought in. A CSV row has its own hash, so the exact
 * check can't see it; this matches on day, amount and direction instead, one
 * existing row per bank row — two identical coffees on one day in the CSV cover two in
 * the bank feed, not three. `existing` must be the same account's non-bank rows.
 */
export function splitAlreadyImported<T extends { date: string; amount: number; direction: string }>(
  rows: T[],
  existing: ExistingRowRef[],
): { fresh: T[]; present: T[] } {
  const pool = new Map<string, number>();
  for (const e of existing) {
    const key = matchKey(e.date, e.amount, e.direction);
    pool.set(key, (pool.get(key) ?? 0) + 1);
  }
  const fresh: T[] = [];
  const present: T[] = [];
  for (const row of rows) {
    const key = matchKey(row.date, row.amount, row.direction);
    const left = pool.get(key) ?? 0;
    if (left > 0) {
      pool.set(key, left - 1);
      present.push(row);
    } else {
      fresh.push(row);
    }
  }
  return { fresh, present };
}

/** How far before the last sync a sync looks again: banks book card payments days
 *  after they happen, so a row can turn up dated before the last sync. */
export const SYNC_OVERLAP_DAYS = 7;

/** The `date_from` for a sync: null the first time (as far back as the bank gives). */
export function syncDateFrom(lastSyncedDate: string | null, overlapDays = SYNC_OVERLAP_DAYS): string | null {
  if (!lastSyncedDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastSyncedDate)) return null;
  const d = new Date(`${lastSyncedDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - overlapDays);
  return d.toISOString().slice(0, 10);
}
