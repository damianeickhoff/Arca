import { db } from "@/db";
import { netWorthSnapshots, savingsGoals, vermogenAccounts, goals } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getDebtSummary } from "@/lib/debt-calculations";
import { getBankBalances } from "@/lib/account-balances";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Records today's net worth once per day. No-op if today already has a snapshot. */
export async function recordNetWorthSnapshot(netWorth: number, totalAssets: number, totalDebt: number) {
  const date = todayISO();
  const existing = await db.select({ id: netWorthSnapshots.id }).from(netWorthSnapshots).where(eq(netWorthSnapshots.date, date));
  if (existing.length > 0) return;
  await db.insert(netWorthSnapshots).values({ date, netWorth, totalAssets, totalDebt });
}

// Shared calc, extracted so it isn't duplicated between the Reports page and the
// daily-snapshot trigger — savings goals + active vermogen accounts minus outstanding debt.
export async function computeNetWorth() {
  const [savingsGoalRows, savingsGoalTypeRows, accounts, bankBalances, debtSummary] = await Promise.all([
    db.select().from(savingsGoals).where(eq(savingsGoals.active, true)),
    db.select().from(goals).where(and(eq(goals.active, true), eq(goals.goalType, "savings"))),
    db.select().from(vermogenAccounts).where(and(eq(vermogenAccounts.active, true), eq(vermogenAccounts.includeInNetWorth, true))),
    getBankBalances(),
    getDebtSummary(),
  ]);
  const totalSavings = savingsGoalRows.reduce((s, g) => s + g.currentAmount, 0)
    + savingsGoalTypeRows.reduce((s, g) => s + g.currentAmount, 0);
  const totalAccounts = accounts.reduce((s, a) => s + a.value, 0)
    + bankBalances.filter((b) => b.includeInNetWorth).reduce((s, b) => s + b.balance, 0);
  // Money owed to the user (direction 'owed') is a receivable asset, so it adds to net worth.
  const owedToUser = debtSummary?.totalOwed ?? 0;
  const totalAssets = totalSavings + totalAccounts + owedToUser;
  const totalDebt = debtSummary?.totalBalance ?? 0;
  const netWorth = totalAssets - totalDebt;
  return { totalSavings, totalAccounts, totalAssets, totalDebt, netWorth };
}

// Cheap select-first check before doing the full computeNetWorth() work, and wrapped in
// try/catch so a snapshot failure can never break the page (e.g. root layout) calling it.
export async function maybeRecordDailyNetWorthSnapshot() {
  try {
    const date = todayISO();
    const existing = await db.select({ id: netWorthSnapshots.id }).from(netWorthSnapshots).where(eq(netWorthSnapshots.date, date));
    if (existing.length > 0) return;
    const { netWorth, totalAssets, totalDebt } = await computeNetWorth();
    await db.insert(netWorthSnapshots).values({ date, netWorth, totalAssets, totalDebt });
  } catch {
    // Best-effort — never let a snapshot failure surface to the user.
  }
}

export async function getNetWorthHistory(limit = 30) {
  const rows = await db.select().from(netWorthSnapshots).orderBy(asc(netWorthSnapshots.date));
  return rows.slice(-limit);
}
