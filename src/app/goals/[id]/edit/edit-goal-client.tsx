"use client";

import { useRouter } from "next/navigation";
import { SavingsGoalEditDialog } from "../../savings-goal-edit-dialog";
import type { Category, Goal } from "@/db/schema";

// Thin wrapper so /goals/[id]/edit (a direct link target, e.g. from a bookmark or the
// old routed edit flow) opens the same SavingsGoalEditDialog used as a nested sheet
// from the savings-goal detail dialog — closing it navigates back.
export function EditGoalClient({ goal, categories }: { goal: Goal; categories: Category[] }) {
  const router = useRouter();

  return (
    <SavingsGoalEditDialog
      goal={goal}
      categories={categories}
      open
      onOpenChange={(v) => { if (!v) router.back(); }}
    />
  );
}
