import { db } from "@/db";
import { goals, categories } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageShell } from "@/components/page-shell";
import { GoalsMobile } from "./goals-mobile";
import { GoalsDesktop } from "./goals-desktop";
import { getCurrentUser } from "@/lib/auth";
import { getSettingsPanelContent } from "@/app/settings-panel-content";
import { getFinancialMonthConfig, getBudgetRecurringMode } from "@/lib/app-settings";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [allGoals, cats, financialMonth, budgetRecurringMode] = await Promise.all([
    db.select().from(goals).orderBy(asc(goals.name)),
    db.select().from(categories).orderBy(categories.group, categories.name),
    getFinancialMonthConfig(),
    getBudgetRecurringMode(),
  ]);
  const settingsPanels = getSettingsPanelContent(user);

  // The /goals page is savings-only now; budget (expense) goals moved to the
  // dashboard header's Goals subpage.
  const savingsGoalsList = allGoals.filter((g) => g.active && g.goalType === "savings");
  const displayGoals = savingsGoalsList;
  const totalSaved = savingsGoalsList.reduce((s, g) => s + g.currentAmount, 0);
  const totalTargetSavings = savingsGoalsList.filter((g) => g.targetAmount > 0).reduce((s, g) => s + g.targetAmount, 0);
  const totalReachedPct = totalTargetSavings > 0 ? Math.round((totalSaved / totalTargetSavings) * 100) : 0;
  const totalMonthly = savingsGoalsList.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);

  const targetDates = savingsGoalsList
    .map((g) => {
      const monthly = g.monthlyContribution ?? 0;
      const remaining = g.targetAmount - g.currentAmount;
      const monthsLeft = monthly > 0 && remaining > 0 ? Math.ceil(remaining / monthly) : null;
      if (monthsLeft == null) return null;
      const d = new Date();
      d.setMonth(d.getMonth() + monthsLeft);
      return d;
    })
    .filter((d): d is Date => d != null);
  const latestTargetDate = targetDates.length > 0 ? new Date(Math.max(...targetDates.map((d) => d.getTime()))) : null;
  const latestTargetLabel = latestTargetDate
    ? latestTargetDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : null;

  const savings = { totalSaved, totalTargetSavings, totalReachedPct, totalMonthly, latestTargetLabel, totalCount: savingsGoalsList.length };

  return (
    <PageShell
      mobile={<GoalsMobile goals={displayGoals} categories={cats} savings={savings} user={user} settingsPanels={settingsPanels} financialMonth={financialMonth} budgetRecurringMode={budgetRecurringMode} />}
      desktop={<GoalsDesktop goals={displayGoals} categories={cats} savings={savings} />}
    />
  );
}
