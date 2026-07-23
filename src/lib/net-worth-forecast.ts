import { db } from "@/db";
import { recurringItems, savingsGoals, goals, debts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { toMonthly } from "@/lib/format";
import { debtMonthsElapsed } from "@/lib/debt-calculations";

export type ForecastPoint = { date: string; netWorth: number };

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00`);
  const next = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/** Simple, intentionally-optimistic forward projection off the current net worth —
 * driven only by the factors the user cares about seeing on the chart: active
 * recurring income, active savings-goal contributions, and repayments still expected
 * on debts *owed to* the user (direction "owed"). It does not net out the user's own
 * bills/subscriptions/debt payments, so it reads as "where this is headed if income
 * and collections keep flowing", not a full cashflow model. */
export async function getNetWorthForecast(
  currentNetWorth: number,
  lastActualDate: string,
  monthsAhead = 6,
): Promise<ForecastPoint[]> {
  const [incomeItems, savingsGoalRows, savingsTypeGoalRows, owedDebts] = await Promise.all([
    db.select().from(recurringItems).where(and(eq(recurringItems.active, true), eq(recurringItems.type, "income"))),
    db.select().from(savingsGoals).where(eq(savingsGoals.active, true)),
    db.select().from(goals).where(and(eq(goals.active, true), eq(goals.goalType, "savings"))),
    db.select().from(debts).where(eq(debts.direction, "owed")),
  ]);

  const monthlyIncome = incomeItems.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
  const monthlySavings = savingsGoalRows.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0)
    + savingsTypeGoalRows.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);

  // Remaining balance still owed to the user on each "owed" debt, so repayment
  // credit stops once a debt is fully collected instead of forecasting past it.
  const owedRemaining = owedDebts.map((d) => ({
    monthlyPayment: d.minimumPayment,
    remaining: Math.max(0, d.startingBalance - Math.min(debtMonthsElapsed(d.startMonth) * d.minimumPayment, d.startingBalance)),
  }));

  if (monthlyIncome <= 0 && monthlySavings <= 0 && owedRemaining.every((d) => d.remaining <= 0)) return [];

  const points: ForecastPoint[] = [];
  let netWorth = currentNetWorth;
  const remaining = owedRemaining.map((d) => d.remaining);

  for (let i = 1; i <= monthsAhead; i++) {
    let owedCollected = 0;
    owedDebts.forEach((d, idx) => {
      const pay = Math.min(d.minimumPayment, remaining[idx]);
      remaining[idx] -= pay;
      owedCollected += pay;
    });
    netWorth += monthlyIncome + monthlySavings + owedCollected;
    points.push({ date: addMonths(lastActualDate, i), netWorth: Math.round(netWorth) });
  }

  return points;
}
