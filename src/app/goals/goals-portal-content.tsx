import { db } from "@/db";
import { goals, categories } from "@/db/schema";
import { asc } from "drizzle-orm";
import Link from "next/link";
import { IconPlus, IconTargetArrow } from "@tabler/icons-react";
import { getExpenseGoalSpend } from "@/lib/goal-spend";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { PageEmptyState } from "@/components/page-empty-state";
import { GoalRow } from "./goals-list";
import { loadDebtsData } from "@/app/debts/load-debts";
import { DebtsMobile } from "@/app/debts/debts-mobile";

// Server-rendered content for the dashboard header's Goals subpage overlay.
// Savings goals intentionally live on the dashboard itself — this subpage is the
// home for budget (expense) goals and debts, opened from the header goals icon.
export async function getGoalsPortalContent() {
  const [allGoals, cats, financialMonth, debtsData] = await Promise.all([
    db.select().from(goals).orderBy(asc(goals.name)),
    db.select().from(categories).orderBy(categories.group, categories.name),
    getFinancialMonthConfig(),
    loadDebtsData(),
  ]);

  const budgetGoals = allGoals.filter((g) => g.active && g.goalType === "expense");
  const spendByGoal = await getExpenseGoalSpend(budgetGoals, financialMonth);
  const catById = new Map(cats.map((c) => [c.id, c]));

  // Expense goals derive their icon/color from the linked category and their spent
  // amount live from that category's transactions (mirrors goals/page.tsx).
  const displayGoals = budgetGoals.map((goal) => {
    const category = goal.categoryId != null ? catById.get(goal.categoryId) : undefined;
    return {
      ...goal,
      currentAmount: spendByGoal.get(goal.id) ?? 0,
      icon: category?.icon ?? goal.icon,
      color: category?.color ?? goal.color,
    };
  });

  return (
    <div className="pb-[calc(6rem+var(--sab))]">
      <div className="px-4 pt-2 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-3xl font-black tracking-tight">Goals</h1>
          <Link
            href="/goals/add?type=expense"
            aria-label="Add budget goal"
            className="h-10 rounded-full bg-primary text-primary-foreground font-semibold text-sm px-4 flex items-center gap-1.5 active:scale-[0.97] transition-transform"
          >
            <IconPlus className="size-4.5" /> Add goal
          </Link>
        </div>

        {displayGoals.length === 0 ? (
          <PageEmptyState
            icon={IconTargetArrow}
            title="No budget goals yet"
            description="Set spending limits per category. Tap Add goal to create your first budget."
          />
        ) : (
          <div className="space-y-2.5">
            {displayGoals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} href={`/goals/${goal.id}/edit`} />
            ))}
          </div>
        )}
      </div>

      {/* Debts — the full debts overview embedded beneath the budget goals. */}
      <div className="mt-2">
        <DebtsMobile {...debtsData} />
      </div>
    </div>
  );
}
