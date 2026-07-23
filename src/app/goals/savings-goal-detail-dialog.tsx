"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  IconPencil as Pencil,
  IconTrashFilled as Trash2,
} from "@tabler/icons-react";
import type { Category, Goal } from "@/db/schema";
import { goalProgressPct, recurrenceLabel } from "./goal-shared";
import { SavingsGoalEditDialog } from "./savings-goal-edit-dialog";

function fmtDay(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Detail view for a single savings goal — same visual language as the debt detail
// dialog (accent wash, pencil/trash header actions, rounded-2xl info rows). The pencil
// button opens SavingsGoalEditDialog nested inside this one.
export function SavingsGoalDetailDialog({
  goal,
  categories,
  onClose,
}: {
  goal: Goal | null;
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Keep rendering the last-open goal's content while the sheet animates closed —
  // the caller nulls `goal` the instant it starts closing (see onClose), and without
  // this the body unmounts synchronously, collapsing the sheet's height before the
  // slide-down transition finishes.
  const [cached, setCached] = useState(goal);
  useEffect(() => {
    if (goal) setCached(goal);
  }, [goal]);
  const displayGoal = goal ?? cached;

  async function remove() {
    if (!goal) return;
    if (!confirm(`Delete "${goal.name}"?`)) return;
    setDeleting(true);
    await fetch("/api/goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goal.id }),
    });
    setDeleting(false);
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={goal != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        accentColor={displayGoal?.color ?? null}
        scrollBlur
        headerAction={
          displayGoal ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Edit"
                className="size-11 rounded-full bg-white/7 backdrop-blur-lg flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
              >
                <Pencil className="size-4.5" />
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                aria-label="Delete"
                className="size-11 rounded-full bg-white/7 backdrop-blur-lg flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
              >
                <Trash2 className="size-4.5" />
              </button>
            </div>
          ) : undefined
        }
      >
        <DialogTitle className="sr-only">Savings goal details</DialogTitle>
        {displayGoal && <DetailBody key={displayGoal.id} goal={displayGoal} categories={categories} />}

        {/* Edit dialog — controlled by the pencil button. Rendered INSIDE this dialog's
            content so it's a nested sheet: closing it returns here instead of tearing
            down the detail dialog too. */}
        {displayGoal && (
          <SavingsGoalEditDialog goal={displayGoal} categories={categories} open={editOpen} onOpenChange={setEditOpen} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ goal, categories }: { goal: Goal; categories: Category[] }) {
  const pct = Math.round(goalProgressPct(goal));
  const isDone = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount;
  const category = categories.find((c) => c.id === goal.categoryId);

  const remaining = goal.targetAmount - goal.currentAmount;
  const monthsLeft = goal.monthlyContribution && goal.monthlyContribution > 0 && remaining > 0 ? Math.ceil(remaining / goal.monthlyContribution) : null;
  const targetDate = monthsLeft != null ? (() => { const d = new Date(); d.setMonth(d.getMonth() + monthsLeft); return d; })() : null;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="relative -mx-6 mt-15 mb-15 lg:-mx-7 lg:-mt-7 px-6 lg:px-7 pt-2 lg:pt-7">
        <div className="flex flex-col items-center text-center gap-1 pb-1">
          <Icon iconKey={goal.icon} color={goal.color} round size="xxl" />
          <p className="text-3xl font-bold tabular-nums mt-3">{formatEur(goal.currentAmount)}</p>
          <div className="flex items-center gap-2 mt-1.5 text-sm text-foreground/55">
            <span>of {formatEur(goal.targetAmount)}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", isDone ? "bg-emerald-500" : "bg-foreground/30")} />
              {isDone ? "Reached" : `${pct}% saved`}
            </span>
          </div>
        </div>
      </div>

      {/* Key figures */}
      <div className="rounded-2xl p-2 bg-[var(--dialog-content-background)]">
        <DetailRow label="Target amount" value={formatEur(goal.targetAmount)} />
        <DetailRow label="Monthly contribution" value={goal.monthlyContribution != null ? formatEur(goal.monthlyContribution) : "—"} />
        {goal.startDate && <DetailRow label="Start date" value={fmtDay(goal.startDate)} />}
        {goal.endDate && <DetailRow label="End date" value={fmtDay(goal.endDate)} />}
        {goal.recurrence !== "none" && <DetailRow label="Recurrence" value={recurrenceLabel(goal.recurrence)} />}
        {targetDate && !isDone && <DetailRow label="Reached by" value={targetDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} />}
      </div>

      {category && (
        <div className="rounded-2xl bg-[var(--dialog-content-background)]">
          <DetailRow label="Category" valueIcon={<Icon iconKey={category.icon} color={category.color} size="xs" round />} value={category.name} />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, valueIcon }: { label: string; value: string; valueIcon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <span className="flex items-center gap-1.5 font-light text-right min-w-0">
        {valueIcon}
        <span className="truncate text-sm">{value}</span>
      </span>
    </div>
  );
}
