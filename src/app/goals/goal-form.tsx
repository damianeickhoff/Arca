"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconCoin, IconPigMoney, IconTrash } from "@tabler/icons-react";
import type { Category, Goal } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OptionDropdown } from "@/components/option-dropdown";
import { CategoryPicker } from "@/components/category-picker";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { PickerField } from "@/components/picker-field";
import { isBrandIcon } from "@/components/icon";
import { DatePicker } from "@/components/date-picker";
import { FormSubpage, FormAmountHero, FormCard, FormField, FormSaveButton } from "@/components/form-subpage";
import { currencySymbol } from "@/lib/format";
import { GOAL_COLORS, RECURRENCE_OPTIONS, type GoalType } from "./goal-shared";
import { TypeCard } from "./goal-form-rows";

// The goal add/edit form — one component behind both /goals/add and
// /goals/[id]/edit, wearing the shared FormSubpage chrome used by the recurring
// bills and debt forms (sticky back button, amount hero, FormCard/FormField rows,
// static save). Replaces the old goal-add-client page and goal-creator overlay.
//
// Adding first shows a Budget-vs-Savings type chooser; editing skips straight to
// the form for the goal's existing type.
export function GoalForm({
  categories,
  goal,
  initialType,
}: {
  categories: Category[];
  /** Omit for the add flow. */
  goal?: Goal;
  /** Pre-selects a type and skips the Budget-vs-Savings chooser (add flow only). */
  initialType?: GoalType;
}) {
  const router = useRouter();
  const isEdit = !!goal;
  // The chooser only exists when adding without a pre-selected type.
  const hasChooser = !isEdit && !initialType;

  const [step, setStep] = useState<"type" | "form">(hasChooser ? "type" : "form");
  const [goalType, setGoalType] = useState<GoalType>((goal?.goalType as GoalType) ?? initialType ?? "savings");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: goal?.name ?? "",
    amount: goal?.targetAmount ? String(goal.targetAmount) : "",
    monthly: goal?.monthlyContribution != null ? String(goal.monthlyContribution) : "",
    startingBalance: goal?.currentAmount ? String(goal.currentAmount) : "",
    categoryId: goal?.categoryId != null ? String(goal.categoryId) : "",
    recurrence: goal?.recurrence ?? "none",
    startDate: goal?.startDate ?? "",
    endDate: goal?.endDate ?? "",
    color: goal?.color ?? GOAL_COLORS[0],
    icon: goal?.icon ?? (null as string | null),
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isSavings = goalType === "savings";

  // Step 2's back returns to the type chooser when one exists; otherwise leaves.
  function back() {
    if (step === "form" && hasChooser) setStep("type");
    else router.back();
  }

  function chooseType(type: GoalType) {
    setGoalType(type);
    setStep("form");
  }

  const canSave =
    !loading &&
    form.name.trim().length > 0 &&
    (parseFloat(form.amount) || 0) > 0 &&
    (goalType !== "expense" || form.categoryId !== "");

  async function save() {
    if (!canSave) return;
    setLoading(true);
    const payload = {
      goalType,
      name: form.name.trim() || "Untitled goal",
      targetAmount: parseFloat(form.amount) || 0,
      monthlyContribution: isSavings && form.monthly ? parseFloat(form.monthly) : null,
      ...(isSavings ? { currentAmount: parseFloat(form.startingBalance) || 0 } : {}),
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      recurrence: form.recurrence,
      startDate: isSavings ? form.startDate || null : null,
      endDate: isSavings ? form.endDate || null : null,
      color: isSavings ? form.color : null,
      icon: isSavings ? form.icon : null,
      ...(isEdit ? { id: goal!.id } : {}),
    };
    await fetch("/api/goals", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    router.back();
    router.refresh();
  }

  async function remove() {
    if (!goal) return;
    if (!confirm(`Delete "${goal.name}"?`)) return;
    setLoading(true);
    await fetch("/api/goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goal.id }),
    });
    setLoading(false);
    router.back();
    router.refresh();
  }

  const title = isEdit
    ? goalType === "expense"
      ? "Edit budget"
      : "Edit saving"
    : step === "type"
      ? "Add new goal"
      : goalType === "expense"
        ? "New budget"
        : "New saving";

  return (
    <FormSubpage title={title} onBack={back}>
      {step === "type" ? (
        <div className="px-5 pt-6 space-y-3 lg:max-w-xl lg:mx-auto">
          <TypeCard
            icon={<IconCoin className="size-6" />}
            title="Budget"
            subtitle="Set up a budget and manage your spending wisely"
            onClick={() => chooseType("expense")}
          />
          <TypeCard
            icon={<IconPigMoney className="size-6" />}
            title="Savings"
            subtitle="Ready to start saving? Begin by setting your first goal here"
            onClick={() => chooseType("savings")}
          />
        </div>
      ) : (
        <>
          <FormAmountHero
            prefix={<>{currencySymbol()}</>}
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            autoFocus={!isEdit}
          />

          <FormCard>
            <FormField label="Name">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. New car" />
            </FormField>

            <FormField label={goalType === "expense" ? "Category" : "Category (optional)"}>
              <CategoryPicker
                categories={categories}
                current={form.categoryId || undefined}
                onChange={(v) => set("categoryId", v === "none" ? "" : v)}
                placeholder={goalType === "expense" ? "Required" : "All"}
                showSelectedIcon
                triggerClassName="h-12 w-full rounded-lg bg-foreground/3 px-3.5 mt-1 text-sm font-normal"
              />
            </FormField>

            {isSavings && (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Monthly contribution">
                  <Input
                    inputMode="decimal"
                    value={form.monthly}
                    onChange={(e) => set("monthly", e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
                    placeholder="e.g. 100"
                  />
                </FormField>
                <FormField label="Starting balance">
                  <Input
                    inputMode="decimal"
                    value={form.startingBalance}
                    onChange={(e) => set("startingBalance", e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
                    placeholder="e.g. 0"
                  />
                </FormField>
              </div>
            )}

            <FormField label="Recurrence">
              <OptionDropdown
                value={form.recurrence}
                onChange={(v) => set("recurrence", v)}
                options={RECURRENCE_OPTIONS}
                triggerClassName="bg-foreground/3 px-3.5"
              />
            </FormField>

            {isSavings && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Start date">
                    <DatePicker granularity="day" value={form.startDate} onChange={(v) => set("startDate", v)} />
                  </FormField>
                  <FormField label="End date">
                    <DatePicker granularity="day" value={form.endDate} onChange={(v) => set("endDate", v)} />
                  </FormField>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex-1">
                    <PickerField label="Icon">
                      <IconPicker value={form.icon} onChange={(v) => set("icon", v)} previewColor={form.color} />
                    </PickerField>
                  </div>
                  {!(form.icon && isBrandIcon(form.icon)) && (
                    <div className="flex-1">
                      <PickerField label="Color">
                        <ColorPicker value={form.color} onChange={(c) => set("color", c)} previewIcon={form.icon} />
                      </PickerField>
                    </div>
                  )}
                </div>
              </>
            )}
          </FormCard>

          <FormSaveButton
            onClick={save}
            disabled={!canSave}
            loading={loading}
            destructive={
              isEdit ? (
                <Button variant="destructive" size="icon" className="size-13 rounded-full shrink-0" onClick={remove} disabled={loading}>
                  <IconTrash className="size-5" />
                </Button>
              ) : undefined
            }
          />
        </>
      )}
    </FormSubpage>
  );
}
