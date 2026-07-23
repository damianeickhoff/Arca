"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  IconChevronRight as ChevronRight,
  IconCheck as Check,
  IconTrashFilled as Trash2,
  IconCoinEuro as Coin,
  IconCalendarEvent as Calendar,
  IconTag as TagIcon,
  IconCategory2 as CategoryIcon,
  IconRepeat as Repeat,
  IconWallet,
} from "@tabler/icons-react";
import { DatePicker } from "@/components/date-picker";
import { AmountKeypad } from "@/components/amount-keypad";
import { CategoryPicker } from "@/components/category-picker";
import { IconPicker } from "@/components/icon-picker";
import { ColorPicker } from "@/components/color-picker";
import { PickerField } from "@/components/picker-field";
import { SubSheet } from "@/components/sub-sheet";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { evaluateExpression } from "@/lib/amount-expression";
import { RECURRENCE_OPTIONS, monthsUntil } from "./goal-shared";
import type { Category, Goal } from "@/db/schema";

const SUB_TITLES: Record<string, string> = {
  amount: "Target amount",
  balance: "Current balance",
  monthly: "Monthly contribution",
  dates: "Dates",
  recurrence: "Recurrence",
  category: "Category",
  name: "Name",
  iconColor: "Icon & color",
};

function fmtDay(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Edit dialog for an existing savings goal — same row-list + slide-in-subpage style as
// the debt edit dialog / recurring item's edit dialog, rather than the full-screen
// calculator page used for adding a new goal.
export function SavingsGoalEditDialog({
  goal,
  categories,
  open,
  onOpenChange,
}: {
  goal: Goal;
  categories: Category[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [subpage, setSubpage] = useState<string | null>(null);
  const [subVisible, setSubVisible] = useState(false);

  const [amountExpr, setAmountExpr] = useState(String(goal.targetAmount).replace(".", ","));
  const [calcEnabled, setCalcEnabled] = useState(false);
  const [name, setName] = useState(goal.name);
  const [balanceExpr, setBalanceExpr] = useState(String(goal.currentAmount).replace(".", ","));
  const [balanceCalcEnabled, setBalanceCalcEnabled] = useState(false);
  const [monthlyExpr, setMonthlyExpr] = useState(goal.monthlyContribution != null ? String(goal.monthlyContribution).replace(".", ",") : "");
  const [monthlyCalcEnabled, setMonthlyCalcEnabled] = useState(false);
  const [startDate, setStartDate] = useState(goal.startDate ?? "");
  const [endDate, setEndDate] = useState(goal.endDate ?? "");
  const [recurrence, setRecurrence] = useState(goal.recurrence ?? "none");
  const [categoryId, setCategoryId] = useState(goal.categoryId != null ? String(goal.categoryId) : "");
  const [icon, setIcon] = useState<string | null>(goal.icon ?? null);
  const [color, setColor] = useState(goal.color ?? "#3b82f6");

  const amountVal = evaluateExpression(amountExpr);
  const balanceVal = evaluateExpression(balanceExpr) ?? 0;
  const monthlyVal = evaluateExpression(monthlyExpr) ?? 0;
  const category = categories.find((c) => String(c.id) === categoryId);

  // When an end date is set, the monthly contribution is derived from it
  // (remaining amount ÷ months remaining) — takes priority over a manually entered value.
  const effectiveMonthlyContribution =
    endDate && amountVal != null && amountVal > 0
      ? Math.round((Math.max(0, amountVal - balanceVal) / monthsUntil(endDate, startDate)) * 100) / 100
      : monthlyVal;

  function openSub(k: string) {
    setSubpage(k);
    requestAnimationFrame(() => setSubVisible(true));
  }
  function closeSub() {
    setSubVisible(false);
    setTimeout(() => setSubpage(null), 300);
  }

  async function save() {
    if (!name.trim() || amountVal == null) return;
    setLoading(true);
    await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: goal.id,
        goalType: "savings",
        name: name.trim(),
        targetAmount: amountVal,
        currentAmount: balanceVal,
        monthlyContribution: effectiveMonthlyContribution || null,
        categoryId: categoryId ? Number(categoryId) : null,
        recurrence,
        startDate: startDate || null,
        endDate: endDate || null,
        color: color || null,
        icon: icon || null,
      }),
    });
    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete "${goal.name}"?`)) return;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="px-0 mt-5"
        title="Edit saving"
        headerAction={
          <button
            type="button"
            onClick={remove}
            disabled={loading}
            aria-label="Delete"
            className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
          >
            <Trash2 className="size-5" />
          </button>
        }
        footer={
          <Button
            onClick={save}
            disabled={loading || !name.trim() || amountVal == null}
            className="w-full h-13 rounded-full bg-foreground text-background hover:bg-foreground/90 text-base font-semibold"
          >
            {loading ? "Saving..." : "Save"}
          </Button>
        }
      >
        <div className="space-y-3 px-5 pb-2">
          <Row
            icon={<span className="flex items-center justify-center size-5"><Icon iconKey={icon} color={color} size="xs" round /></span>}
            label="Icon & color"
            value=""
            onClick={() => openSub("iconColor")}
          />
          <Row icon={<Coin className="size-5" />} label="Target amount" value={amountVal != null ? formatEur(amountVal) : "—"} onClick={() => openSub("amount")} />
          <Row icon={<IconWallet className="size-5" />} label="Current balance" value={formatEur(balanceVal)} onClick={() => openSub("balance")} />
          <Row icon={<Coin className="size-5" />} label="Monthly contribution" value={effectiveMonthlyContribution ? formatEur(effectiveMonthlyContribution) : "—"} onClick={() => openSub("monthly")} />
          <Row
            icon={<Calendar className="size-5" />}
            label="Dates"
            value={startDate ? `${fmtDay(startDate)}${endDate ? ` – ${fmtDay(endDate)}` : ""}` : "—"}
            onClick={() => openSub("dates")}
          />
          <Row icon={<Repeat className="size-5" />} label="Recurrence" value={RECURRENCE_OPTIONS.find((o) => o.value === recurrence)?.label ?? "None"} onClick={() => openSub("recurrence")} />
          <Row
            icon={<CategoryIcon className="size-5" />}
            label="Category"
            value={category?.name ?? "—"}
            valueIcon={category ? <Icon iconKey={category.icon} color={category.color} size="xs" round /> : null}
            onClick={() => openSub("category")}
          />
          <Row icon={<TagIcon className="size-5" />} label="Name" value={name || "—"} onClick={() => openSub("name")} />
        </div>

        {/* Slide-in subpage — fixed against the (transformed) dialog panel */}
        {subpage && (
          <SubSheet title={SUB_TITLES[subpage]} visible={subVisible} onClose={closeSub}>
              {subpage === "amount" && (
                <AmountKeypad expr={amountExpr} onChange={setAmountExpr} calcEnabled={calcEnabled} onToggleCalc={() => setCalcEnabled((c) => !c)} />
              )}

              {subpage === "balance" && (
                <AmountKeypad expr={balanceExpr} onChange={setBalanceExpr} calcEnabled={balanceCalcEnabled} onToggleCalc={() => setBalanceCalcEnabled((c) => !c)} />
              )}

              {subpage === "monthly" && (
                <div className="space-y-2">
                  {endDate && (
                    <p className="text-sm text-foreground/50">
                      Auto-calculated from the end date ({formatEur(effectiveMonthlyContribution)}) — clear the end date to set this manually.
                    </p>
                  )}
                  {endDate ? (
                    <p className="text-center text-3xl font-bold tabular-nums py-8 opacity-50">{formatEur(effectiveMonthlyContribution)}</p>
                  ) : (
                    <AmountKeypad expr={monthlyExpr} onChange={setMonthlyExpr} calcEnabled={monthlyCalcEnabled} onToggleCalc={() => setMonthlyCalcEnabled((c) => !c)} />
                  )}
                </div>
              )}

              {subpage === "dates" && (
                <div className="pt-2 space-y-4">
                  <div>
                    <p className="text-sm text-foreground/60 mb-1.5">Start date</p>
                    <DatePicker 
                      granularity="day" 
                      value={startDate || todayISO()} 
                      onChange={setStartDate} 
                      triggerClassName="w-full justify-between rounded-xl px-4 h-12 bg-[var(--dialog-content-background)] mt-0 mb-0" />
                  </div>
                  <div>
                    <p className="text-sm  text-foreground/60 mb-1.5">End date (optional)</p>
                    <DatePicker
                      granularity="day"
                      value={endDate}
                      onChange={setEndDate}
                      placeholder="No end date"
                      onClear={() => setEndDate("")}
                      triggerClassName="w-full justify-between rounded-xl px-4 h-12 bg-[var(--dialog-content-background)] mt-0 mb-0"
                    />
                  </div>
                </div>
              )}

              {subpage === "recurrence" && (
                <OptionList options={RECURRENCE_OPTIONS} value={recurrence} onSelect={(v) => { setRecurrence(v); closeSub(); }} />
              )}

              {subpage === "category" && (
                <div className="pt-2">
                  <CategoryPicker
                    categories={categories}
                    current={categoryId}
                    onChange={(v) => { setCategoryId(v); closeSub(); }}
                    placeholder="Choose a category"
                    showSelectedIcon
                    triggerClassName="h-12 w-full rounded-xl bg-[var(--dialog-content-background)] px-3.5 text-sm font-normal"
                  />
                </div>
              )}

              {subpage === "name" && (
                <div className="pt-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New car" data-autofocus data-no-keyboard-scroll className="h-12" />
                </div>
              )}

              {subpage === "iconColor" && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-[var(--dialog-content-background)] px-4 py-3">
                  <PickerField label="Icon">
                    <IconPicker
                      value={icon}
                      onChange={setIcon}
                      previewColor={color}
                    />
                  </PickerField>
                </div>

                <div className="rounded-2xl bg-[var(--dialog-content-background)] px-4 py-3">
                  <PickerField label="Color">
                    <ColorPicker
                      value={color}
                      onChange={setColor}
                      previewIcon={icon}
                    />
                  </PickerField>
                </div>
              </div>
              )}
          </SubSheet>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon,
  label,
  value,
  valueIcon,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueIcon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 rounded-2xl bg-[var(--dialog-content-background)] px-4 py-4 text-left active:bg-foreground/[0.04] transition-colors">
      <span className="text-foreground/40 shrink-0">{icon}</span>
      <span className="flex-1 font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-foreground/60 min-w-0">
        {valueIcon}
        <span className="truncate max-w-[45vw]">{value}</span>
      </span>
      <ChevronRight className="size-5 text-foreground/30 shrink-0" />
    </button>
  );
}

function OptionList({ options, value, onSelect }: { options: { value: string; label: string }[]; value: string; onSelect: (v: string) => void }) {
  return (
    <div className="rounded-2xl bg-[var(--dialog-content-background)] overflow-hidden divide-y divide-border/50">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onSelect(o.value)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-foreground/[0.04] transition-colors">
          <span className="flex-1 font-medium">{o.label}</span>
          {value === o.value && <Check className="size-5 text-white/70 shrink-0" />}
        </button>
      ))}
    </div>
  );
}
