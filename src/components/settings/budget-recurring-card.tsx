"use client";

import { useState } from "react";
import { OptionList } from "@/components/option-list";
import { setBudgetRecurringModeAction } from "@/app/actions/budget-settings";
import type { BudgetRecurringMode } from "@/lib/app-settings";

const OPTIONS: { value: BudgetRecurringMode; label: string; description: string }[] = [
  {
    value: "budgeted",
    label: "Only when a budget is set",
    description: "Recurring bills count toward a category only if you've given it a budget.",
  },
  {
    value: "exclude",
    label: "Never count recurring bills",
    description: "Budgets track only variable spending; recurring bills are ignored.",
  },
  {
    value: "always",
    label: "Always count recurring bills",
    description: "Every transaction counts toward its category's budget.",
  },
];

// Controls how transactions matched to a recurring bill count toward category
// budgets — read app-wide by getBudgetOverview (budget page) and getDashboardData
// (dashboard "Spending by category"). See getBudgetRecurringMode in app-settings.ts.
export function BudgetRecurringCard({ initialMode }: { initialMode: BudgetRecurringMode }) {
  const [mode, setMode] = useState<BudgetRecurringMode>(initialMode);
  const [pending, setPending] = useState(false);

  async function change(next: BudgetRecurringMode) {
    if (next === mode || pending) return;
    const previous = mode;
    setPending(true);
    setMode(next); // optimistic — the action's revalidatePath refreshes the dashboard behind the dialog
    const result = await setBudgetRecurringModeAction(next);
    setPending(false);
    if (result?.error) {
      setMode(previous);
    }
  }

  return (
    <div className="px-4 pt-4 space-y-3">
      <OptionList options={OPTIONS} value={mode} onSelect={change} disabled={pending} />
      <p className="px-2 text-sm text-foreground/50">
        Recurring bills (rent, insurance, subscriptions) are already tracked separately.
        This decides whether their spending also counts against your category budgets.
      </p>
    </div>
  );
}
