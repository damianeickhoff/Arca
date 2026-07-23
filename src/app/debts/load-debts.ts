import { db } from "@/db";
import { debts, recurringItems } from "@/db/schema";
import { asc } from "drizzle-orm";
import type { RecurringItem } from "@/db/schema";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getDebtRecurringLinks } from "@/lib/debt-recurring-paid";
import { computeDebt, monthsElapsed, fmtShortMonth, debtEffectiveTotal, debtEffectivePaid } from "./debt-shared";
import type { DebtsPageData } from "./debt-shared";

// Loads + computes everything the debts UI needs. Extracted from the /debts page so
// the settings dialog's Debts panel can reuse the exact same data + <DebtsMobile />
// without duplicating the (fairly involved) payoff/history/projection maths.
export async function loadDebtsData(): Promise<DebtsPageData> {
  const [rows, bills, financialMonth] = await Promise.all([
    db.select().from(debts).orderBy(asc(debts.name)),
    db.select().from(recurringItems).orderBy(asc(recurringItems.name)),
    getFinancialMonthConfig(),
  ]);

  // Payoff progress comes from the paid-months history of each debt's linked
  // recurring bills (see lib/debt-recurring-paid.ts).
  const { linkMap, paidFor } = await getDebtRecurringLinks(financialMonth);
  const billMap = new Map(bills.map((b) => [b.id, b]));

  const computedAll = rows.map((debt) => {
    const linkedBillIds = linkMap.get(debt.id) ?? [];
    const linkedBills = linkedBillIds.map((id) => billMap.get(id)).filter((b): b is RecurringItem => !!b);
    return { debt, linkedBills, linkedBillIds, ...computeDebt(debt, paidFor(debt.id, debt.startMonth)) };
  }).sort((a, b) => b.currentBalance - a.currentBalance);

  // Split by direction. The payoff model (progress, snowball, projection chart,
  // history) is scoped to "owe" debts only; "owed" (money coming in) is shown as a
  // separate section and netted against the total below.
  const computed = computedAll.filter((c) => (c.debt.direction ?? "owe") === "owe");
  const computedOwed = computedAll.filter((c) => c.debt.direction === "owed");
  const oweRows = computed.map((c) => c.debt);
  const owedRows = computedOwed.map((c) => c.debt);

  const totalDebt = computed.reduce((s, c) => s + c.currentBalance, 0);
  const totalOwed = computedOwed.reduce((s, c) => s + c.currentBalance, 0);
  const netDebt = totalDebt - totalOwed;
  const totalStarting = computed.reduce((s, c) => s + debtEffectiveTotal(c.debt), 0);
  const totalPaid = computed.reduce((s, c) => s + debtEffectivePaid(c.debt, c.amountPaid, c.currentBalance), 0);
  const totalPaidPct = totalStarting > 0 ? Math.round((totalPaid / totalStarting) * 100) : 0;
  const totalMonthly = oweRows.reduce((s, d) => s + d.minimumPayment, 0);
  const latestFreeDate = computed.reduce<Date | null>((latest, c) => {
    if (!c.debtFreeDate) return latest;
    if (!latest || c.debtFreeDate > latest) return c.debtFreeDate;
    return latest;
  }, null);

  // Same rollups as above, mirrored for the "owed" direction (money coming in) —
  // the standalone /debts page shows a second, swipeable gauge for this side.
  const totalOwedStarting = computedOwed.reduce((s, c) => s + debtEffectiveTotal(c.debt), 0);
  const totalOwedPaid = computedOwed.reduce((s, c) => s + debtEffectivePaid(c.debt, c.amountPaid, c.currentBalance), 0);
  const totalOwedPaidPct = totalOwedStarting > 0 ? Math.round((totalOwedPaid / totalOwedStarting) * 100) : 0;
  const totalOwedMonthly = owedRows.reduce((s, d) => s + d.minimumPayment, 0);
  const latestOwedFreeDate = computedOwed.reduce<Date | null>((latest, c) => {
    if (!c.debtFreeDate) return latest;
    if (!latest || c.debtFreeDate > latest) return c.debtFreeDate;
    return latest;
  }, null);

  // "Snowball" tip — smallest outstanding balance is conventionally the most motivating one to
  // pay off first, since it frees up that minimum payment soonest to roll into the next debt.
  const snowballTarget = computed
    .filter((c) => c.currentBalance > 0)
    .sort((a, b) => a.currentBalance - b.currentBalance)[0] ?? null;

  // ─── Last-6-months total-debt history (for the small sparkline on the summary card) ────────
  const debtHistory = Array.from({ length: 6 }, (_, i) => {
    const monthEnd = new Date();
    monthEnd.setMonth(monthEnd.getMonth() - (5 - i) + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    const endMonth = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}`;

    return oweRows.reduce((sum, debt) => {
      const billPaid = paidFor(debt.id, debt.startMonth, endMonth);
      const paid = billPaid ?? monthsElapsed(debt.startMonth, monthEnd) * debt.minimumPayment;
      const balance = Math.max(debt.startingBalance - Math.min(paid, debt.startingBalance), 0);
      return sum + balance;
    }, 0);
  });

  // ─── Payoff projection chart data ──────────────────────────────────────────
  const maxMonths = Math.min(
    computed.reduce((m, c) => Math.max(m, c.monthsRemaining ?? 0), 0),
    180,
  );
  const hasChart = maxMonths > 0;
  const debtPoints = computed.map(({ debt, currentBalance, monthsRemaining }) => {
    const pts: number[] = [];
    let bal = currentBalance;
    for (let m = 0; m <= maxMonths; m++) {
      pts.push(bal);
      if (monthsRemaining !== null && m < monthsRemaining) {
        bal = Math.max(bal - debt.minimumPayment, 0);
      }
    }
    return { debt, pts };
  });
  const chartData = Array.from({ length: maxMonths + 1 }, (_, m) => {
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    const row: { name: string; Total: number; [key: string]: number | string } = { name: fmtShortMonth(d), Total: 0 };
    let total = 0;
    for (const { debt, pts } of debtPoints) {
      row[debt.name] = pts[m];
      total += pts[m];
    }
    row.Total = total;
    return row;
  });
  const chartSeries = computed.map(({ debt }) => ({
    key: String(debt.id),
    label: debt.name,
    color: debt.color ?? "var(--chart-3)",
  }));

  return {
    rows, bills, computed, computedOwed, totalDebt, totalOwed, netDebt,
    totalStarting, totalPaid, totalPaidPct,
    totalMonthly, latestFreeDate, snowballTarget, debtHistory, hasChart,
    chartData, chartSeries,
    totalOwedStarting, totalOwedPaid, totalOwedPaidPct, totalOwedMonthly, latestOwedFreeDate,
  };
}
