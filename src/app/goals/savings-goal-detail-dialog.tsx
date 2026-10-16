"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconPencil } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { Icon } from "@/components/icon";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Goal } from "@/db/schema";
import type { GoalsPageData } from "./load-goals";
import { addMonths, futureBalances, goalColor, goalHistory, goalProgressPct, linkedAccount, monthsLeft } from "./goal-shared";
import { GoalIcon, ProjectionChart } from "./goal-visuals";
import { GoalFormDialog } from "./goal-form-dialog";
import { MoneyText } from "@/components/clear/money";

type DetailData = Pick<GoalsPageData, "categories" | "byGoal" | "months" | "recent">;

/**
 * One savings goal's detail: progress, the key figures, its projection and what feeds
 * it — a centred modal from lg and a bottom sheet on phones (the shared Dialog). Edit
 * opens the goal form nested inside it, so closing that returns here.
 */
export function SavingsGoalDetailDialog({
  goal,
  data,
  onClose,
}: {
  goal: Goal | null;
  data: DetailData;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("goals");
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [edit, setEdit] = useState({ key: 0, open: false });

  // Keep rendering the last-open goal's content while the sheet animates closed — the
  // caller nulls `goal` the instant it starts closing, and without this the body would
  // unmount and collapse the sheet's height before the slide-down finishes.
  const [cached, setCached] = useState(goal);
  if (goal && goal !== cached) setCached(goal);
  const shown = goal ?? cached;

  async function remove() {
    if (!goal) return;
    const ok = await confirm({
      title: t("confirmDelete", { name: goal.name }),
      body: t("confirmDeleteBody"),
      confirmLabel: t("confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
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

  const pct = shown ? Math.round(goalProgressPct(shown)) : 0;

  return (
    <Dialog open={goal != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        hideHeaderRow
        title={shown?.name ?? t("detail.title")}
        className="gap-5 pt-7"
        footer={
          shown ? (
            <ClearDialogFooter
              destructive={
                <button type="button" onClick={remove} disabled={deleting} className={clearButtonVariants({ variant: "danger" })}>
                  {t("delete")}
                </button>
              }
            >
              <button type="button" onClick={() => setEdit((e) => ({ key: e.key + 1, open: true }))} className={clearButtonVariants()}>
                <IconPencil aria-hidden />
                {t("detail.edit")}
              </button>
            </ClearDialogFooter>
          ) : undefined
        }
      >
        {shown && (
          <>
            <ClearDialogHeader
              icon={<GoalIcon icon={shown.icon} color={shown.color} size="xl" />}
              title={shown.name}
              subtitle={<MoneyText>{shown.targetAmount > 0 ? t("detail.savedOf", { saved: formatEur(shown.currentAmount), target: formatEur(shown.targetAmount) }) : formatEur(shown.currentAmount)}</MoneyText>}
              onClose={onClose}
              closeLabel={t("close")}
            />
            <DetailBody key={shown.id} goal={shown} data={data} pct={pct} />
            {/* Nested: closing the form returns to this sheet instead of closing both. */}
            <GoalFormDialog
              key={edit.key}
              target={{ mode: "edit", goal: shown }}
              open={edit.open}
              onOpenChange={(o) => setEdit((e) => ({ ...e, open: o }))}
              categories={data.categories}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ goal, data, pct }: { goal: Goal; data: DetailData; pct: number }) {
  const t = useTranslations("goals");
  const locale = useLocale();
  const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const fmtMonth = (d: Date) => d.toLocaleDateString(locale, { month: "short", year: "numeric" });
  const color = goalColor(goal);
  const left = monthsLeft(goal);
  const done = left === 0;
  const category = data.categories.find((c) => c.id === goal.categoryId);
  const account = linkedAccount(goal, data.recent);
  const { past, firstMonth } = goalHistory(goal, data);
  const future = futureBalances(goal.currentAmount, goal.targetAmount, goal.monthlyContribution ?? 0);
  const end = left != null && left > 0 ? addMonths(left) : null;
  const tile = "flex min-w-0 flex-col gap-0.5 rounded-clear-icon bg-clear-tile px-3 py-2.5";

  type Row = { label: string; value: React.ReactNode };
  const rows = ([
    goal.startDate ? { label: t("startDate"), value: fmtDay(goal.startDate) } : null,
    goal.endDate ? { label: t("endDate"), value: fmtDay(goal.endDate) } : null,
    goal.recurrence && goal.recurrence !== "none" ? { label: t("recurrenceLabel"), value: t(`recurrence.${goal.recurrence}`) } : null,
    category
      ? {
          label: t("category"),
          value: (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Icon iconKey={category.icon} color={category.color} size="xs" round />
              <span className="truncate">{category.name}</span>
            </span>
          ),
        }
      : null,
    account ? { label: t("detail.accountLabel"), value: account } : null,
  ] as (Row | null)[]).filter((r): r is Row => r != null);

  return (
    <div className="flex flex-col gap-5 font-clear text-clear-ink">
      <div className="flex flex-col gap-2">
        <ClearProgress value={pct / 100} fillColor={done ? undefined : color} fillClassName={done ? "bg-clear-positive-fill" : undefined} />
        <div className="flex items-center justify-between gap-3 text-[13px] text-clear-ink-2">
          {done ? (
            <ClearChip tone="mint" icon={<IconCheck stroke={3} aria-hidden />}>
              {t("reached")}
            </ClearChip>
          ) : (
            <span className="font-bold text-clear-ink">{t("savedPct", { pct })}</span>
          )}
          {goal.targetAmount > goal.currentAmount && <span><MoneyText>{t("detail.toGo", { amount: formatEurWhole(goal.targetAmount - goal.currentAmount) })}</MoneyText></span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={tile}>
          <span className="text-xs text-clear-muted">{t("detail.target")}</span>
          <span className="text-base font-extrabold tabular-nums"><MoneyText>{goal.targetAmount > 0 ? formatEurWhole(goal.targetAmount) : "—"}</MoneyText></span>
        </div>
        <div className={tile}>
          <span className="text-xs text-clear-muted">{t("detail.monthly")}</span>
          <span className="text-base font-extrabold tabular-nums"><MoneyText>{goal.monthlyContribution ? formatEurWhole(goal.monthlyContribution) : "—"}</MoneyText></span>
        </div>
        <div className={tile}>
          <span className="text-xs text-clear-muted">{t("detail.started")}</span>
          <span className="text-base font-extrabold">{firstMonth ? fmtMonth(new Date(`${firstMonth}-15T12:00:00`)) : "—"}</span>
        </div>
        <div className={cn(tile, end && "bg-clear-ember text-clear-ember-ink")}>
          <span className={cn("text-xs", end ? "font-semibold" : "text-clear-muted")}>{t("detail.projected")}</span>
          <span className="text-base font-extrabold">{done ? t("reached") : end ? t("detail.reachedOn", { date: fmtMonth(end) }) : "—"}</span>
        </div>
      </div>

      {(past.length > 1 || future.length > 0) && goal.targetAmount > 0 ? (
        <ProjectionChart
          past={past}
          future={future}
          target={goal.targetAmount}
          color={color}
          targetLabel={t("detail.targetLine", { amount: formatEurWhole(goal.targetAmount) })}
          todayLabel={t("detail.today")}
          startLabel={firstMonth ? fmtMonth(new Date(`${firstMonth}-15T12:00:00`)) : null}
          endLabel={end ? fmtMonth(end) : t("detail.today")}
          ariaLabel={
            end
              ? t("detail.chartLabel", { saved: formatEurWhole(goal.currentAmount), target: formatEurWhole(goal.targetAmount), date: fmtMonth(end) })
              : t("detail.chartLabelNoEnd", { saved: formatEurWhole(goal.currentAmount), target: formatEurWhole(goal.targetAmount) })
          }
        />
      ) : (
        !done && <p className="m-0 rounded-clear-tile bg-clear-tile px-4 py-3 text-sm text-clear-muted">{t("detail.noProjection")}</p>
      )}

      {rows.length > 0 && (
        <dl className="m-0 flex flex-col rounded-clear-tile bg-clear-tile px-4">
          {rows.map((r) => (
            <div key={r.label} className="flex min-h-12 items-center justify-between gap-3 border-b border-clear-card py-2 last:border-b-0">
              <dt className="shrink-0 text-sm text-clear-ink-2">{r.label}</dt>
              <dd className="m-0 min-w-0 truncate text-right text-sm font-bold">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
