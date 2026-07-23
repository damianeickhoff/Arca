import { db } from "@/db";
import { transactions, banks, vermogenAccounts } from "@/db/schema";
import type { Bank } from "@/db/schema";
import { and, eq, getTableColumns, gte, lt, sql } from "drizzle-orm";

// Live account balances + a best-effort balance-over-time series for the Accounts
// overview. There is no stored per-account balance history, so everything here is
// derived from transactions the same way the rest of the app defines an account's
// balance: banks.startingBalance + Σ(signed transaction amount), matched on
// transactions.account = banks.accountNumber (see api/search/overview/route.ts).

// The full bank record plus its live transaction-derived balance, so the overview
// can seed the edit dialog with real starting-balance / transfer-kind values.
export type BankBalance = Bank & { balance: number };

export interface BalancePoint {
  date: string; // YYYY-MM-DD
  balance: number;
}

// Signed transaction flow: income adds, everything else subtracts. Transactions on
// or before banks.startingDate are the ones the starting balance was recorded from
// (e.g. the first CSV import), so they're excluded to avoid double-counting them on
// top of startingBalance.
const signedFlow = sql<number>`CASE
  WHEN ${banks.startingDate} IS NOT NULL AND ${transactions.date} <= ${banks.startingDate} THEN 0
  WHEN ${transactions.direction} = 'income' THEN ${transactions.amount}
  ELSE -${transactions.amount}
END`;

/** A single bank account's live transaction-derived balance (for balance-correction UI). */
export async function getBankBalance(bankId: number): Promise<number | null> {
  const [row] = await db
    .select({
      balance: sql<number>`COALESCE(${banks.startingBalance}, 0) + COALESCE(SUM(${signedFlow}), 0)`,
    })
    .from(banks)
    .leftJoin(transactions, eq(transactions.account, banks.accountNumber))
    .where(eq(banks.id, bankId))
    .groupBy(banks.id);
  return row ? Number(row.balance) : null;
}

/** Every linked bank account with its live transaction-derived balance. */
export async function getBankBalances(): Promise<BankBalance[]> {
  return db
    .select({
      ...getTableColumns(banks),
      balance: sql<number>`COALESCE(${banks.startingBalance}, 0) + COALESCE(SUM(${signedFlow}), 0)`,
    })
    .from(banks)
    .leftJoin(transactions, eq(transactions.account, banks.accountNumber))
    .groupBy(banks.id)
    .orderBy(banks.displayName);
}

/**
 * Best-effort daily total-balance series for the last `days` days. Bank accounts
 * contribute their transaction-derived running balance; asset (vermogen) accounts
 * have no history, so their current total is added as a constant offset. The final
 * point equals Σ bank balances + Σ active asset values (the overview's current total).
 */
export async function getAccountBalanceHistory(days = 365): Promise<BalancePoint[]> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  const startIso = start.toISOString().slice(0, 10);

  const [{ startingSum }] = await db
    .select({ startingSum: sql<number>`COALESCE(SUM(${banks.startingBalance}), 0)` })
    .from(banks);

  const [{ vermogenSum }] = await db
    .select({ vermogenSum: sql<number>`COALESCE(SUM(${vermogenAccounts.value}), 0)` })
    .from(vermogenAccounts)
    .where(eq(vermogenAccounts.active, true));

  // Net flow of bank-matched transactions strictly before the window start.
  // (signedFlow itself zeroes out transactions on/before each bank's startingDate.)
  const [{ priorNet }] = await db
    .select({ priorNet: sql<number>`COALESCE(SUM(${signedFlow}), 0)` })
    .from(transactions)
    .innerJoin(banks, eq(transactions.account, banks.accountNumber))
    .where(lt(transactions.date, startIso));

  // Per-day net flow within the window.
  const daily = await db
    .select({ date: transactions.date, net: sql<number>`SUM(${signedFlow})` })
    .from(transactions)
    .innerJoin(banks, eq(transactions.account, banks.accountNumber))
    .where(and(gte(transactions.date, startIso), lt(transactions.date, tomorrowIso(today))))
    .groupBy(transactions.date)
    .orderBy(transactions.date);

  const netByDate = new Map(daily.map((d) => [d.date, Number(d.net) || 0]));
  const base = Number(startingSum) + Number(vermogenSum) + Number(priorNet);

  const points: BalancePoint[] = [];
  let running = base;
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    running += netByDate.get(iso) ?? 0;
    points.push({ date: iso, balance: running });
  }
  return points;
}

function tomorrowIso(from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
