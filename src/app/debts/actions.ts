"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, debtPayments, debts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth, financialMonthRangeByMonth, todayStr } from "@/lib/date-range";
import { parseDebtSort, type DebtSort } from "./debt-shared";

// Plan › Debts' writes. Server actions with revalidatePath (not fetch + router.refresh):
// the balances they change are read server-side by Home, Insights and the forecast too.

/** Saves the simulator's Order switch (quickest win first · highest interest first · spread over all debts). */
export async function setDebtPayoffOrderAction(order: DebtSort): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "signedOut" };
  const value = parseDebtSort(order);
  await db
    .insert(appSettings)
    .values({ key: "debt_payoff_order", value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  revalidatePath("/debts");
  return {};
}

/**
 * "Log a payment": an extra or lump-sum payment on a debt you owe. It comes off the
 * balance on its date (see debtBalance), so the payoff dates move with it.
 */
export async function logDebtPaymentAction(input: {
  debtId: number;
  amount: number;
  date: string;
  note?: string | null;
}): Promise<{ error?: "signedOut" | "invalid" | "notFound" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "signedOut" };

  const amount = Math.round(Number(input.amount) * 100) / 100;
  const date = String(input.date ?? "");
  if (!Number.isInteger(input.debtId) || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayStr()) {
    return { error: "invalid" };
  }
  const [debt] = await db.select({ id: debts.id }).from(debts).where(eq(debts.id, input.debtId));
  if (!debt) return { error: "notFound" };

  const note = input.note?.trim() || null;
  await db.insert(debtPayments).values({ debtId: debt.id, kind: "extra", date, amount, note });
  revalidatePath("/", "layout");
  return {};
}

/**
 * "This month's payments" for a debt no recurring bill pays: mark this financial
 * month's minimum as paid, or take the mark off again. A status only; the unlinked
 * payoff model already counts every scheduled minimum.
 */
export async function setDebtMinimumPaidAction(debtId: number, paid: boolean): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "signedOut" };
  if (!Number.isInteger(debtId)) return { error: "invalid" };

  const [debt] = await db.select().from(debts).where(eq(debts.id, debtId));
  if (!debt) return { error: "notFound" };

  const config = await getFinancialMonthConfig();
  const { from, to } = financialMonthRangeByMonth(currentFinancialMonth(config), config);
  const inMonth = and(eq(debtPayments.debtId, debtId), eq(debtPayments.kind, "minimum"), gte(debtPayments.date, from), lte(debtPayments.date, to));
  await db.delete(debtPayments).where(inMonth);
  if (paid) {
    await db.insert(debtPayments).values({ debtId, kind: "minimum", date: todayStr(), amount: debt.minimumPayment });
  }
  revalidatePath("/debts");
  return {};
}
