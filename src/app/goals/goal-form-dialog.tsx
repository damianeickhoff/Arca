"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconCalendarEvent, IconCheck, IconHelpCircle, IconPencil, IconTarget } from "@tabler/icons-react";
import type { Category, Goal } from "@/db/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ClearChip } from "@/components/clear/chip";
import { Segmented } from "@/components/clear/segmented";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { DatePicker } from "@/components/date-picker";
import { CategoryPicker } from "@/components/category-picker";
import { IconPicker } from "@/components/icon-picker";
import { ColorPicker } from "@/components/color-picker";
import { isBrandIcon } from "@/components/icon";
import { TipWalkthrough } from "@/components/tip-walkthrough";
import { evaluateExpression } from "@/lib/amount-expression";
import { currencySymbol, formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, differenceInCalendarMonths } from "date-fns";
import { GOAL_COLORS, RECURRENCES, addMonths, goalIconBackground, monthsUntil, type GoalType } from "./goal-shared";
import { GoalIcon, ProjectionChart } from "./goal-visuals";
import { MoneyText } from "@/components/clear/money";

/** What the form opens with: an existing goal to edit, or a new one of a type. */
export type GoalFormTarget =
  | { mode: "edit"; goal: Goal }
  | {
      mode: "new";
      /** "choose" shows the Savings / Budget switch (the old type chooser). */
      type: GoalType | "choose";
      /** A suggestion from the empty state ("Use this"). */
      preset?: { name: string; icon: string; color: string };
    };

// The walkthrough's running order — each entry needs matching copy at
// tips.savingsFormTour.steps.<anchor>.
const SAVING_TOUR_STEPS = [
  "savingIcon",
  "savingTarget",
  "savingBalance",
  "savingMonthly",
  "savingDates",
  "savingCategory",
  "savingHelp",
  "savingSave",
  "savingClose",
] as const;

const AMOUNT_CHARS = /[^0-9.,+\-*/×÷−]/g;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** "1250.5" → "1250,5": the inputs take a comma as the decimal separator. */
function toInput(n: number | null | undefined) {
  return n != null && n !== 0 ? String(n).replace(".", ",") : "";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// A savings goal's recurrence is how often money goes in. "none" (every goal saved
// before this existed) counts as monthly. The amount typed is per that period; what is
// stored stays a monthly figure (monthlyContribution), as the rest of the app reads it.
type Frequency = "weekly" | "monthly" | "yearly";
const FREQUENCIES: readonly Frequency[] = ["weekly", "monthly", "yearly"];
const MONTHS_PER: Record<Frequency, number> = { weekly: 12 / 52, monthly: 1, yearly: 12 };

function frequencyOf(recurrence: string): Frequency {
  return recurrence === "weekly" || recurrence === "yearly" ? recurrence : "monthly";
}

const asDate = (iso: string) => new Date(`${iso}T00:00:00`);

/** Contributions that fit between the start (or today) and the end date, at least one. */
function periodsUntil(endDate: string, startDate: string, freq: Frequency) {
  const months = monthsUntil(endDate, startDate);
  if (freq === "monthly") return months;
  if (freq === "yearly") return Math.max(1, Math.floor(months / 12));
  const today = todayISO();
  const from = startDate && startDate > today ? startDate : today;
  return Math.max(1, Math.floor(differenceInCalendarDays(asDate(endDate), asDate(from)) / 7));
}

/**
 * Where the balance goes from today: the months until the target is reached (0 when it
 * already is, null without a contribution) and the balance month by month (sampled to
 * at most 60 points). Money goes in at the end of each period, from the start date on.
 */
function projectSavings(balance: number, target: number, perPeriod: number, freq: Frequency, startDate: string) {
  if (balance >= target) return { months: 0, future: [] as number[] };
  if (perPeriod <= 0) return { months: null, future: [] as number[] };
  const today = todayISO();
  const delay = startDate > today ? differenceInCalendarMonths(asDate(startDate), asDate(today)) : 0;
  const periods = Math.ceil((target - balance) / perPeriod);
  const months = delay + Math.max(1, Math.ceil(periods * MONTHS_PER[freq] - 1e-9));
  const at = (m: number) => Math.min(target, balance + Math.floor(Math.max(0, m - delay) / MONTHS_PER[freq] + 1e-9) * perPeriod);
  const step = Math.max(1, Math.ceil(months / 60));
  const future: number[] = [];
  for (let m = step; m < months; m += step) future.push(at(m));
  future.push(target);
  return { months, future };
}

/** The balance from the start date up to today, when the goal started in the past. */
function pastBalances(balance: number, startDate: string) {
  const today = todayISO();
  if (!startDate || startDate >= today) return [balance];
  const n = Math.min(60, differenceInCalendarMonths(asDate(today), asDate(startDate)));
  if (n < 1) return [balance];
  return Array.from({ length: n + 1 }, (_, i) => (balance * i) / n);
}

// The pickers' own trigger classes use rounded-lg / rounded-full; tailwind-merge only
// drops those for a radius it recognises, so the 14px row radius is spelled out here.
const PICKER_TRIGGER =
  "mt-0 mb-0 h-12 w-full rounded-[14px] border-[1.5px] border-transparent bg-clear-tile px-4 font-clear text-[15px] font-bold text-clear-ink";

/**
 * The goal form, one dialog for adding and editing both kinds of goal: a savings goal
 * (target, starting balance, monthly amount or an end date that works it out, icon and
 * colour, and a projection of when you get there) and a budget goal (a cap on one
 * category). Amount fields accept a sum ("250*12"). Rendered inside another dialog it
 * becomes a nested sheet, so closing it returns there.
 */
export function GoalFormDialog({
  target,
  open,
  onOpenChange,
  categories,
}: {
  target: GoalFormTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
}) {
  const router = useRouter();
  const t = useTranslations("goals");
  const locale = useLocale();
  const confirm = useConfirm();
  const ids = useId();
  const goal = target.mode === "edit" ? target.goal : null;
  const preset = target.mode === "new" ? target.preset : undefined;
  const chooseType = target.mode === "new" && target.type === "choose";

  const [type, setType] = useState<GoalType>(
    goal ? (goal.goalType === "expense" ? "expense" : "savings") : target.mode === "new" && target.type === "expense" ? "expense" : "savings",
  );
  const [name, setName] = useState(goal?.name ?? preset?.name ?? "");
  const [targetExpr, setTargetExpr] = useState(toInput(goal?.targetAmount));
  const [balanceExpr, setBalanceExpr] = useState(toInput(goal?.currentAmount));
  // Per period of the recurrence (see frequencyOf); stored as a monthly figure.
  const [monthlyExpr, setMonthlyExpr] = useState(() =>
    toInput(goal?.monthlyContribution != null ? round2(goal.monthlyContribution * MONTHS_PER[frequencyOf(goal.recurrence)]) : null),
  );
  // What the form opened with, so an untouched contribution is saved exactly as it was.
  const [initial] = useState(() => ({ monthlyExpr, recurrence: goal?.recurrence ?? "none" }));
  const [startDate, setStartDate] = useState(goal ? (goal.startDate ?? "") : todayISO());
  const [endDate, setEndDate] = useState(goal?.endDate ?? "");
  const [recurrence, setRecurrence] = useState(goal?.recurrence ?? "none");
  const [categoryId, setCategoryId] = useState(goal?.categoryId != null ? String(goal.categoryId) : "");
  const [icon, setIcon] = useState<string | null>(goal?.icon ?? preset?.icon ?? null);
  const [color, setColor] = useState<string>(goal?.color ?? preset?.color ?? GOAL_COLORS[0].hex);
  const [iconOpen, setIconOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Bumped by the help button to replay the walkthrough.
  const [tourToken, setTourToken] = useState(0);

  const isSavings = type === "savings";
  const freq = frequencyOf(recurrence);
  const targetVal = evaluateExpression(targetExpr);
  const balanceVal = evaluateExpression(balanceExpr) ?? 0;
  const perPeriodVal = evaluateExpression(monthlyExpr) ?? 0;
  // When an end date is set, the contribution is derived from it (remaining amount ÷
  // contributions left before the end date) — it takes priority over a typed value.
  const autoMonthly = isSavings && !!endDate && targetVal != null && targetVal > 0;
  const perPeriod = autoMonthly ? round2(Math.max(0, targetVal! - balanceVal) / periodsUntil(endDate, startDate, freq)) : perPeriodVal;
  const untouched = goal != null && !autoMonthly && monthlyExpr === initial.monthlyExpr && recurrence === initial.recurrence;
  const effectiveMonthly = untouched ? (goal.monthlyContribution ?? 0) : round2(perPeriod / MONTHS_PER[freq]);
  const canSave = !loading && name.trim().length > 0 && targetVal != null && targetVal > 0 && (isSavings || categoryId !== "");

  const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const fmtMonth = (d: Date) => d.toLocaleDateString(locale, { month: "short", year: "numeric" });

  const title = goal
    ? isSavings
      ? t("form.editSavings")
      : t("form.editBudget")
    : isSavings
      ? t("form.newSavings")
      : t("form.newBudget");

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSave) return;
    setLoading(true);
    const payload = isSavings
      ? {
          goalType: "savings",
          name: name.trim(),
          targetAmount: targetVal,
          currentAmount: balanceVal,
          monthlyContribution: effectiveMonthly || null,
          categoryId: categoryId ? Number(categoryId) : null,
          recurrence,
          startDate: startDate || null,
          endDate: endDate || null,
          color: color || null,
          icon: icon || null,
        }
      : {
          goalType: "expense",
          name: name.trim(),
          targetAmount: targetVal,
          monthlyContribution: null,
          categoryId: categoryId ? Number(categoryId) : null,
          recurrence,
          startDate: null,
          endDate: null,
          color: null,
          icon: null,
        };
    await fetch("/api/goals", {
      method: goal ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goal ? { id: goal.id, ...payload } : payload),
    });
    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  async function remove() {
    if (!goal) return;
    const ok = await confirm({
      title: t("confirmDelete", { name: goal.name }),
      body: t("confirmDeleteBody"),
      confirmLabel: t("confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
    setLoading(true);
    await fetch("/api/goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goal.id }),
    });
    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  function amountField(id: string, label: string, value: string, onChange: (v: string) => void, opts?: { suffix?: string; anchor?: string; hint?: React.ReactNode; disabled?: boolean }) {
    const computed = evaluateExpression(value);
    const isSum = /[+\-*/×÷−]/.test(value.replace(/^[-−]/, ""));
    return (
      <ClearField
        label={label}
        htmlFor={id}
        hint={<MoneyText>{opts?.hint ?? (isSum && computed != null ? t("form.sum", { amount: formatEur(computed) }) : undefined)}</MoneyText>}
      >
        <div
          data-tip-anchor={opts?.anchor}
          className={cn(
            "flex h-12 items-center gap-1.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 transition-colors focus-within:border-clear-ink",
            opts?.disabled && "opacity-60",
          )}
        >
          <span aria-hidden className="text-[15px] font-bold text-clear-muted">
            {currencySymbol()}
          </span>
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            disabled={opts?.disabled}
            placeholder="0"
            onChange={(e) => onChange(e.target.value.replace(AMOUNT_CHARS, ""))}
            className="h-full w-full min-w-0 flex-1 bg-transparent p-0 text-[15px] font-extrabold tabular-nums text-clear-ink outline-none placeholder:font-semibold placeholder:text-clear-placeholder"
          />
          {opts?.suffix && <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap text-clear-muted">{opts.suffix}</span>}
        </div>
      </ClearField>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideHeaderRow
        title={title}
        className="gap-5 pt-7"
        footer={
          <ClearDialogFooter
            destructive={
              <>
                {!goal && isSavings && (
                  <button
                    type="button"
                    onClick={() => setTourToken((n) => n + 1)}
                    data-tip-anchor="savingHelp"
                    aria-label={t("form.help")}
                    title={t("form.help")}
                    className={clearButtonVariants({ variant: "ghost", size: "icon" })}
                  >
                    <IconHelpCircle aria-hidden />
                  </button>
                )}
                {goal && (
                  <button type="button" onClick={remove} disabled={loading} className={clearButtonVariants({ variant: "danger" })}>
                    {t("delete")}
                  </button>
                )}
              </>
            }
          >
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              data-tip-anchor="savingClose"
              className={clearButtonVariants({ variant: "secondary" })}
            >
              {t("cancel")}
            </button>
            <button type="submit" form={`${ids}-form`} disabled={!canSave} data-tip-anchor="savingSave" className={clearButtonVariants()}>
              {loading ? t("saving") : t("form.save")}
            </button>
          </ClearDialogFooter>
        }
      >
        <ClearDialogHeader
          title={title}
          subtitle={isSavings ? t("form.subtitleSavings") : t("form.subtitleBudget")}
          onClose={() => onOpenChange(false)}
          closeLabel={t("close")}
        />

        <form id={`${ids}-form`} onSubmit={save} className="flex flex-col gap-5 font-clear text-clear-ink">
          {chooseType && (
            <Segmented
              label={t("form.type")}
              surface="tile"
              value={type}
              onChange={setType}
              items={[
                { value: "savings", label: t("form.typeSavings") },
                { value: "expense", label: t("form.typeBudget") },
              ]}
              className="self-start"
            />
          )}

          {isSavings && (
            <div data-tip-anchor="savingIcon" className="flex items-center gap-[18px]">
              {/* The icon itself opens the icon picker; the pencil shows on hover and focus. */}
              <button
                type="button"
                onClick={() => setIconOpen(true)}
                aria-label={t("form.changeIcon")}
                title={t("form.changeIcon")}
                className="group relative shrink-0 cursor-pointer rounded-clear-tile transition-transform outline-none focus-visible:ring-3 focus-visible:ring-clear-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-clear-card active:scale-[0.96]"
              >
                <GoalIcon icon={icon} color={color} size="xxl" />
                <span
                  aria-hidden
                  className="absolute -right-1.5 -bottom-1.5 inline-flex size-6 items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink opacity-0 ring-2 ring-clear-card transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                >
                  <IconPencil size={13} stroke={2.2} />
                </span>
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span id={`${ids}-colour`} className="text-[13px] font-bold text-clear-ink-2">
                  {t("form.iconColour")}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Brand logos keep their own colours, so there is nothing to pick for them. */}
                  {!(icon && isBrandIcon(icon)) && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div role="radiogroup" aria-labelledby={`${ids}-colour`} className="contents">
                        {GOAL_COLORS.map((c) => {
                          const on = color.toLowerCase() === c.hex;
                          return (
                            <button
                              key={c.key}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              aria-label={t(`colors.${c.key}`)}
                              onClick={() => setColor(c.hex)}
                              className={cn(
                                "inline-flex size-[34px] cursor-pointer items-center justify-center rounded-full text-clear-ink",
                                on ? "ring-2 ring-clear-ink ring-offset-2 ring-offset-clear-card" : "ring-1 ring-clear-ink/8 ring-inset",
                              )}
                              style={{ background: goalIconBackground(c.hex) }}
                            >
                              {on ? (
                                <IconCheck size={15} stroke={3} aria-hidden />
                              ) : (
                                <span aria-hidden className="size-3 rounded-full" style={{ background: c.hex }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {/* Any other colour: the full picker; its swatch shows the current colour. */}
                      <span className="inline-flex [&>button]:size-[34px]">
                        <ColorPicker value={color} onChange={setColor} previewIcon={icon} />
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <IconPicker value={icon} onChange={setIcon} previewColor={color} open={iconOpen} onOpenChange={setIconOpen} hideDefaultTrigger />
            </div>
          )}

          <ClearField label={t("name")} htmlFor={`${ids}-name`}>
            <ClearInput
              id={`${ids}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              autoComplete="off"
              className="font-bold"
            />
          </ClearField>

          <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
            {amountField(`${ids}-target`, isSavings ? t("targetAmount") : t("form.budgetAmount"), targetExpr, setTargetExpr, { anchor: "savingTarget" })}
            {isSavings &&
              amountField(`${ids}-balance`, goal ? t("currentBalance") : t("startingBalance"), balanceExpr, setBalanceExpr, { anchor: "savingBalance" })}
            {isSavings &&
              amountField(`${ids}-monthly`, t("form.contribution", { period: freq }), autoMonthly ? toInput(perPeriod) : monthlyExpr, setMonthlyExpr, {
                suffix: t("form.per", { period: freq }),
                anchor: "savingMonthly",
                disabled: autoMonthly,
                hint: autoMonthly ? t("autoCalc") : undefined,
              })}
            <PickerShell label={isSavings ? t("categoryOptional") : t("category")} id={`${ids}-category`} anchor="savingCategory">
              <CategoryPicker
                categories={categories}
                current={categoryId || undefined}
                onChange={(v) => setCategoryId(v === "none" ? "" : v)}
                placeholder={isSavings ? t("form.noCategory") : t("form.chooseCategory")}
                showSelectedIcon
                triggerClassName={cn(PICKER_TRIGGER, "pr-3", !categoryId && "font-semibold text-clear-muted")}
              />
            </PickerShell>
          </div>

          {isSavings && (
            <div data-tip-anchor="savingDates" className="grid gap-3 sm:grid-cols-2">
              <PickerShell label={t("startDate")} id={`${ids}-start`}>
                <DatePicker
                  granularity="day"
                  value={startDate || todayISO()}
                  onChange={setStartDate}
                  label={startDate ? fmtDay(startDate) : undefined}
                  triggerClassName={PICKER_TRIGGER}
                />
              </PickerShell>
              <PickerShell label={t("endDate")} id={`${ids}-end`}>
                <DatePicker
                  granularity="day"
                  value={endDate}
                  onChange={setEndDate}
                  label={endDate ? fmtDay(endDate) : undefined}
                  placeholder={t("form.optional")}
                  onClear={() => setEndDate("")}
                  triggerClassName={cn(PICKER_TRIGGER, !endDate && "font-semibold text-clear-muted")}
                />
              </PickerShell>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span aria-hidden className="text-[13px] font-bold text-clear-ink-2">
              {isSavings ? t("form.frequency") : t("recurrenceLabel")}
            </span>
            {isSavings ? (
              <Segmented
                label={t("form.frequency")}
                surface="tile"
                size="sm"
                value={freq}
                onChange={setRecurrence}
                items={FREQUENCIES.map((r) => ({ value: r, label: t(`recurrence.${r}`) }))}
                className="flex-wrap self-start"
              />
            ) : (
              <Segmented
                label={t("recurrenceLabel")}
                surface="tile"
                size="sm"
                value={recurrence}
                onChange={setRecurrence}
                items={RECURRENCES.map((r) => ({ value: r, label: t(`recurrence.${r}`) }))}
                className="flex-wrap self-start"
              />
            )}
          </div>

          {isSavings && targetVal != null && targetVal > 0 && (
            <Projection
              target={targetVal}
              balance={balanceVal}
              perPeriod={perPeriod}
              freq={freq}
              startDate={startDate || todayISO()}
              color={color}
              fmtMonth={fmtMonth}
            />
          )}
        </form>

        {!goal && isSavings && <TipWalkthrough id="savingsFormTour" steps={SAVING_TOUR_STEPS} active={open && !iconOpen} replayToken={tourToken} />}
      </DialogContent>
    </Dialog>
  );
}

/** A label above a picker trigger (pickers own their buttons, so no <label for>). */
function PickerShell({ label, id, anchor, children }: { label: string; id: string; anchor?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} data-tip-anchor={anchor} className="flex min-w-0 flex-col gap-1.5">
      <span id={id} className="text-[13px] font-bold text-clear-ink-2">
        {label}
      </span>
      <div className="flex min-w-0 [&>button]:min-w-0 [&>button]:flex-1">{children}</div>
    </div>
  );
}

/** "At €250 a month you reach €4.500 in Sep 2027", with the line it follows. */
function Projection({
  target,
  balance,
  perPeriod,
  freq,
  startDate,
  color,
  fmtMonth,
}: {
  target: number;
  balance: number;
  /** The contribution per period of `freq`. */
  perPeriod: number;
  freq: Frequency;
  startDate: string;
  color: string;
  fmtMonth: (d: Date) => string;
}) {
  const t = useTranslations("goals.form.projection");
  const { months, future } = projectSavings(balance, target, perPeriod, freq, startDate);
  const past = pastBalances(balance, startDate);
  const reached = months === 0;
  const end = months != null && months > 0 ? addMonths(months) : null;
  const b = (c: React.ReactNode) => <b className="font-extrabold">{c}</b>;
  const start = past.length > 1 ? fmtMonth(new Date(`${startDate}T12:00:00`)) : t("today");

  return (
    // Tinted with the goal's colour (the mockup's sky for the default blue), as tall
    // as its content needs.
    <div
      className="flex h-auto flex-col gap-3 rounded-clear-tile p-[18px] text-clear-ink"
      style={{ background: `color-mix(in srgb, ${color} 14%, var(--clr-card))` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="min-w-[200px] flex-1 text-[15px] leading-[1.45] font-semibold">
          <MoneyText>{reached
            ? t.rich("reached", { target: formatEurWhole(target), b })
            : end
              ? t.rich("reach", { amount: formatEurWhole(perPeriod), period: freq, target: formatEurWhole(target), date: fmtMonth(end), b })
              : t.rich("none", { target: formatEurWhole(target), b })}</MoneyText>
        </span>
        {months != null && months > 0 && (
          <ClearChip tone="neutral" icon={<IconTarget aria-hidden style={{ color }} />} className="shrink-0 bg-clear-card">
            {t("toGo", { count: months })}
          </ClearChip>
        )}
      </div>
      {end && (
        <ProjectionChart
          past={past}
          future={future}
          target={target}
          color={color}
          height={120}
          targetLabel={t("target", { amount: formatEurWhole(target) })}
          todayLabel={t("today")}
          todayValueLabel={formatEurWhole(balance)}
          startLabel={start}
          endLabel={fmtMonth(end)}
          ariaLabel={t("chartLabel", {
            balance: formatEurWhole(balance),
            amount: formatEurWhole(perPeriod),
            period: freq,
            target: formatEurWhole(target),
            date: fmtMonth(end),
          })}
        />
      )}
      {!end && !reached && (
        <span className="inline-flex items-center gap-2 text-[13px] text-clear-ink-2">
          <IconCalendarEvent size={16} stroke={1.9} aria-hidden className="shrink-0" />
          {t("hint")}
        </span>
      )}
    </div>
  );
}
