"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { CategoryIcon } from "@/components/ui/category-icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  IconPencilFilled as Pencil,
  IconTrashFilled as Trash2,
} from "@tabler/icons-react";
import type { Category, Goal } from "@/db/schema";
import { goalProgressPct } from "./goal-shared";
import { SavingsGoalEditDialog } from "./savings-goal-edit-dialog";

function fmtDay(iso: string, dateLocale: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
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
  const t = useTranslations("goals");
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Keep rendering the last-open goal's content while the sheet animates closed —
  // the caller nulls `goal` the instant it starts closing (see onClose), and without
  // this the body unmounts synchronously, collapsing the sheet's height before the
  // slide-down transition finishes.
  const [cached, setCached] = useState(goal);
  if (goal && goal !== cached) setCached(goal);
  const displayGoal = goal ?? cached;

  async function remove() {
    if (!goal) return;
    if (!confirm(t("confirmDelete", { name: goal.name }))) return;
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
                aria-label={t("edit")}
                className="size-10 rounded-full border border-line bg-surface flex items-center justify-center text-ink hover:bg-surface-2 active:scale-[0.95] transition-transform"
              >
                <Pencil className="size-4.5" />
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                aria-label={t("delete")}
                className="size-10 rounded-full border border-line bg-surface flex items-center justify-center text-ink hover:bg-surface-2 active:scale-[0.95] transition-transform"
              >
                <Trash2 className="size-4.5" />
              </button>
            </div>
          ) : undefined
        }
      >
        <DialogTitle className="sr-only">{t("detailsTitle")}</DialogTitle>
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
  const t = useTranslations("goals");
  const locale = useLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const pct = Math.round(goalProgressPct(goal));
  const isDone = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount;
  const category = categories.find((c) => c.id === goal.categoryId);

  const remaining = goal.targetAmount - goal.currentAmount;
  const monthsLeft = goal.monthlyContribution && goal.monthlyContribution > 0 && remaining > 0 ? Math.ceil(remaining / goal.monthlyContribution) : null;
  const targetDate = monthsLeft != null ? (() => { const d = new Date(); d.setMonth(d.getMonth() + monthsLeft); return d; })() : null;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="pt-2">
        <div className="flex flex-col items-center text-center gap-1 pb-1">
          <CategoryIcon icon={goal.icon} color={goal.color} size="lg" />
          <p className="amount mt-3 text-[32px] leading-none tabular-nums text-ink">{formatEur(goal.currentAmount)}</p>
          <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
            <span>{t("ofAmount", { amount: formatEur(goal.targetAmount) })}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", isDone ? "bg-positive" : "bg-ink-3")} />
              {isDone ? t("reached") : t("savedPct", { pct })}
            </span>
          </div>
        </div>
      </div>

      {/* Key figures */}
      <div className="divide-y divide-line rounded-card border border-line bg-surface">
        <DetailRow label={t("targetAmount")} value={formatEur(goal.targetAmount)} />
        <DetailRow label={t("monthlyContribution")} value={goal.monthlyContribution != null ? formatEur(goal.monthlyContribution) : "—"} />
        {goal.startDate && <DetailRow label={t("startDate")} value={fmtDay(goal.startDate, dateLocale)} />}
        {goal.endDate && <DetailRow label={t("endDate")} value={fmtDay(goal.endDate, dateLocale)} />}
        {goal.recurrence !== "none" && <DetailRow label={t("recurrenceLabel")} value={t(`recurrence.${goal.recurrence}`)} />}
        {targetDate && !isDone && <DetailRow label={t("reachedBy")} value={targetDate.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })} />}
      </div>

      {category && (
        <div className="rounded-card border border-line bg-surface">
          <DetailRow label={t("category")} valueIcon={<Icon iconKey={category.icon} color={category.color} size="xs" round />} value={category.name} />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, valueIcon }: { label: string; value: string; valueIcon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-sm text-ink-2">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-right">
        {valueIcon}
        <span className="truncate text-sm font-semibold text-ink">{value}</span>
      </span>
    </div>
  );
}
