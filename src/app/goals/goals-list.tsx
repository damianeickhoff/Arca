"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { ProgressRing } from "@/components/progress-ring";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";
import type { Goal } from "@/db/schema";
import { goalProgressPct, goalTypeLabel } from "./goal-shared";

export type GoalFilter = "all" | "expense" | "savings";

export const GOAL_FILTERS: { value: GoalFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "expense", label: "Budget" },
  { value: "savings", label: "Savings" },
];

export function filterGoals(goals: Goal[], filter: GoalFilter): Goal[] {
  if (filter === "all") return goals;
  return goals.filter((g) => g.goalType === filter);
}

// Rounded segmented pill filter shown on top of the page.
export function GoalFilterPills({
  value,
  onChange,
  className,
}: {
  value: GoalFilter;
  onChange: (v: GoalFilter) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 rounded-full bg-card p-1", className)}>
      {GOAL_FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => onChange(f.value)}
          className={cn(
            "flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer",
            value === f.value ? "bg-foreground/8 text-foreground" : "text-foreground/50 hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export function GoalRow({ goal, onClick, href }: { goal: Goal; onClick?: () => void; href?: string }) {
  const pct = goalProgressPct(goal);
  const color = goal.color ?? "var(--chart-3)";
  const verb = goal.goalType === "expense" ? "spent" : "saved";

  const className = "w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-card text-left active:bg-foreground/[0.03] transition-colors";

  const inner = (
    <>
      <ProgressRing pct={pct} color={color} iconSize={40} glow={false}>
        <Icon iconKey={goal.icon ?? null} color={goal.color} size="md" round />
      </ProgressRing>
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium truncate leading-tight">{goal.name}</div>
        <div className="text-sm text-foreground/55 mt-0.5 truncate">
          {goalTypeLabel(goal.goalType)}
          {goal.targetAmount > 0 && ` · ${pct.toFixed(0)}%`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="font-semibold text-base tabular-nums">{formatEur(goal.targetAmount)}</p>
        <p className="text-xs text-foreground/50 tabular-nums">{verb} {formatEur(goal.currentAmount)}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}
