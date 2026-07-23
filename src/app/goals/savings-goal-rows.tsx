"use client";

import { useState } from "react";
import type { Category, Goal } from "@/db/schema";
import { GoalRow } from "./goals-list";
import { SavingsGoalDetailDialog } from "./savings-goal-detail-dialog";

// Owns the tap-to-open-detail state for the savings goal list, so a single
// SavingsGoalDetailDialog instance can serve every row — mirrors DebtsInteractive.
export function SavingsGoalRows({
  goals,
  categories,
  className,
}: {
  goals: Goal[];
  categories: Category[];
  className?: string;
}) {
  const [selected, setSelected] = useState<Goal | null>(null);

  return (
    <>
      <div className={className}>
        {goals.map((goal) => (
          <GoalRow key={goal.id} goal={goal} onClick={() => setSelected(goal)} />
        ))}
      </div>

      <SavingsGoalDetailDialog goal={selected} categories={categories} onClose={() => setSelected(null)} />
    </>
  );
}
