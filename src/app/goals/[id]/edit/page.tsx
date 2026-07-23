import { db } from "@/db";
import { goals, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { GoalForm } from "../../goal-form";
import { EditGoalClient } from "./edit-goal-client";

export const dynamic = "force-dynamic";

export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const goalId = Number(id);
  if (!Number.isFinite(goalId)) notFound();

  const [[goal], cats] = await Promise.all([
    db.select().from(goals).where(eq(goals.id, goalId)),
    db.select().from(categories).orderBy(categories.group, categories.name),
  ]);
  if (!goal) notFound();

  // Savings goals edit via the row-list dialog (matches the debts pattern); budget
  // (expense) goals still use the older FormSubpage-based GoalForm.
  if (goal.goalType === "savings") {
    return <EditGoalClient goal={goal} categories={cats} />;
  }
  return <GoalForm categories={cats} goal={goal} />;
}
