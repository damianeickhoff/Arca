import { db } from "@/db";
import { categories } from "@/db/schema";
import { GoalForm } from "../goal-form";
import { SavingsGoalForm } from "../savings-goal-form";
import type { GoalType } from "../goal-shared";

export const dynamic = "force-dynamic";

export default async function AddGoalPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const initialType: GoalType | undefined = type === "savings" || type === "expense" ? type : undefined;
  const cats = await db.select().from(categories).orderBy(categories.group, categories.name);

  // Savings goals use the full-screen calculator-style form; budget (expense) goals
  // still use the older FormSubpage-based GoalForm (and its Budget-vs-Savings chooser
  // when no type is pre-selected).
  if (initialType === "savings") {
    return <SavingsGoalForm categories={cats} />;
  }
  return <GoalForm categories={cats} initialType={initialType} />;
}
