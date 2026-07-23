"use client";

import Link from "next/link";
import { IconPlus, IconPigMoney } from "@tabler/icons-react";
import { DesktopPageHeader } from "@/components/desktop-page-header";
import type { Category, Goal } from "@/db/schema";
import { SavingsGoalRows } from "./savings-goal-rows";
import { SavingsSummaryCard } from "./savings-summary-card";
import { ProgressBarCard } from "./progress-bar-card";
import type { SavingsSummary } from "./goal-shared";
import { formatEur } from "@/lib/format";

// The /goals page is savings-only — budget (expense) goals now live in the
// dashboard header's Goals subpage instead. Adding here always creates a saving.
export function GoalsDesktop({
  goals,
  categories,
  savings,
}: {
  goals: Goal[];
  categories: Category[];
  savings: SavingsSummary;
}) {
  const visible = goals.filter((g) => g.goalType === "savings");

  return (
    <>
      <DesktopPageHeader
        title="Savings"
        subtitle="Track your savings goals and progress"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/goals/add?type=savings"
              className="h-10 rounded-full bg-primary text-primary-foreground font-semibold text-sm px-4 flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <IconPlus className="size-4.5" /> Add saving
            </Link>
          </div>
        }
      />

      <div className="px-8 py-6 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SavingsSummaryCard
            totalSaved={savings.totalSaved}
            totalReachedPct={savings.totalReachedPct}
            totalMonthly={savings.totalMonthly}
            latestTargetLabel={savings.latestTargetLabel}
          />
          <ProgressBarCard
            iconKey="IconPigMoney"
            headline={`${savings.totalReachedPct}% reached`}
            subtitle={`of ${formatEur(savings.totalTargetSavings)} total`}
            spent={savings.totalSaved}
            total={savings.totalTargetSavings}
            pct={Math.min(100, savings.totalReachedPct)}
            rawPct={savings.totalReachedPct}
          />
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="size-20 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-5">
              <IconPigMoney className="size-9" />
            </div>
            <h2 className="text-lg font-bold mb-1.5">Start your first saving</h2>
            <p className="text-sm text-foreground/55 max-w-sm">
              Ready to start saving? Use the button above to set up your first savings goal.
            </p>
          </div>
        ) : (
          <SavingsGoalRows goals={visible} categories={categories} className="grid grid-cols-1 xl:grid-cols-2 gap-3" />
        )}
      </div>
    </>
  );
}
