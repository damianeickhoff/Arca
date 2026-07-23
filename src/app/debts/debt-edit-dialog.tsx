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
  IconAdjustments as Adjust,
  IconNote as Note,
  IconRepeat as Repeat,
  IconReceipt2 as Receipt,
} from "@tabler/icons-react";
import { DatePicker } from "@/components/date-picker";
import { AmountKeypad } from "@/components/amount-keypad";
import { RecurringMultiPicker } from "@/components/recurring-multi-picker";
import { IconPicker } from "@/components/icon-picker";
import { ColorPicker } from "@/components/color-picker";
import { PickerField } from "@/components/picker-field";
import { SubSheet } from "@/components/sub-sheet";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { evaluateExpression } from "@/lib/amount-expression";
import { cn } from "@/lib/utils";
import type { Debt, RecurringItem } from "@/db/schema";

const SUB_TITLES: Record<string, string> = {
  amount: "Starting balance",
  direction: "Type",
  period: "Start month",
  payment: "Minimum monthly payment",
  originalAmount: "Original debt amount",
  recurring: "Linked recurring bills",
  name: "Name",
  notes: "Notes",
  iconColor: "Icon & color",
};

const DIRECTION_OPTIONS = [
  { value: "owe", label: "I owe" },
  { value: "owed", label: "I am owed" },
];

function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// Edit dialog for an existing debt — same row-list + slide-in-subpage style as the
// recurring item's edit dialog (RecurringClient), rather than the full-screen calculator
// page used for adding a new debt.
export function DebtEditDialog({
  debt,
  bills,
  currentRecurringIds,
  open,
  onOpenChange,
}: {
  debt: Debt;
  bills: RecurringItem[];
  currentRecurringIds: number[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [subpage, setSubpage] = useState<string | null>(null);
  const [subVisible, setSubVisible] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);

  const [amountExpr, setAmountExpr] = useState(String(debt.startingBalance).replace(".", ","));
  const [calcEnabled, setCalcEnabled] = useState(false);
  const [direction, setDirection] = useState<"owe" | "owed">((debt.direction as "owe" | "owed") ?? "owe");
  const [name, setName] = useState(debt.name);
  const [startMonth, setStartMonth] = useState(debt.startMonth);
  const [paymentExpr, setPaymentExpr] = useState(debt.minimumPayment ? String(debt.minimumPayment).replace(".", ",") : "");
  const [paymentCalcEnabled, setPaymentCalcEnabled] = useState(false);
  const [originalExpr, setOriginalExpr] = useState(debt.originalAmount != null ? String(debt.originalAmount).replace(".", ",") : "");
  const [originalCalcEnabled, setOriginalCalcEnabled] = useState(false);
  const [notes, setNotes] = useState(debt.notes ?? "");
  const [icon, setIcon] = useState<string | null>(debt.icon ?? null);
  const [color, setColor] = useState(debt.color ?? "#ef4444");
  const [recurringIds, setRecurringIds] = useState<number[]>(currentRecurringIds);

  const amountVal = evaluateExpression(amountExpr);
  const paymentVal = evaluateExpression(paymentExpr);
  const originalVal = evaluateExpression(originalExpr);
  const selectedBills = recurringIds.map((id) => bills.find((b) => b.id === id)).filter((b): b is RecurringItem => !!b);

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
    await fetch("/api/debts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: debt.id,
        name: name.trim(),
        direction,
        startingBalance: amountVal,
        originalAmount: originalVal || null,
        minimumPayment: paymentVal || 0,
        startMonth,
        color: color || null,
        icon: icon || null,
        notes: notes.trim() || null,
        recurringIds,
      }),
    });
    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete debt "${debt.name}"?`)) return;
    setLoading(true);
    await fetch("/api/debts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: debt.id }),
    });
    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="px-0"
        title="Edit debt"
        headerAction={
          <button
            type="button"
            onClick={remove}
            disabled={loading}
            aria-label="Delete"
            className="size-11 rounded-full bg-white/7 backdrop-blur-lg flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
          >
            <Trash2 className="size-4.5" />
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
          <Row icon={<Coin className="size-5" />} label="Starting balance" value={amountVal != null ? formatEur(amountVal) : "—"} onClick={() => openSub("amount")} />
          <Row icon={<Adjust className="size-5" />} label="Type" value={direction === "owe" ? "I owe" : "I am owed"} onClick={() => openSub("direction")} />
          <Row icon={<Calendar className="size-5" />} label="Start month" value={formatMonthLabel(startMonth)} onClick={() => openSub("period")} />
          <Row icon={<Coin className="size-5" />} label="Minimum monthly payment" value={paymentVal ? formatEur(paymentVal) : "—"} onClick={() => openSub("payment")} />
          <Row icon={<Receipt className="size-5" />} label="Original debt amount" value={originalVal ? formatEur(originalVal) : "—"} onClick={() => openSub("originalAmount")} />
          <Row
            icon={<Repeat className="size-5" />}
            label="Linked recurring bills"
            value={selectedBills.length === 0 ? "—" : selectedBills.length === 1 ? selectedBills[0].name : `${selectedBills.length} bills`}
            onClick={() => setRecurringOpen(true)}
          />
          <Row icon={<TagIcon className="size-5" />} label="Name" value={name || "—"} onClick={() => openSub("name")} />
          <Row icon={<Note className="size-5" />} label="Notes" value={notes || "—"} onClick={() => openSub("notes")} />
        </div>

        {/* Slide-in subpage — fixed against the (transformed) dialog panel */}
        {subpage && (
          <SubSheet title={SUB_TITLES[subpage]} visible={subVisible} onClose={closeSub}>
              {subpage === "amount" && (
                <AmountKeypad expr={amountExpr} onChange={setAmountExpr} positive={direction === "owed"} calcEnabled={calcEnabled} onToggleCalc={() => setCalcEnabled((c) => !c)} />
              )}

              {subpage === "direction" && (
                <OptionList options={DIRECTION_OPTIONS} value={direction} onSelect={(v) => { setDirection(v as "owe" | "owed"); closeSub(); }} />
              )}

              {subpage === "period" && (
                <div className="pt-2">
                  <DatePicker granularity="month" value={startMonth} onChange={(v) => { setStartMonth(v); closeSub(); }} triggerClassName="w-full justify-between border rounded-xl px-4 h-12 bg-[#292a2d]/35" />
                </div>
              )}

              {subpage === "payment" && (
                <AmountKeypad expr={paymentExpr} onChange={setPaymentExpr} calcEnabled={paymentCalcEnabled} onToggleCalc={() => setPaymentCalcEnabled((c) => !c)} />
              )}

              {subpage === "originalAmount" && (
                <div className="space-y-3">
                  <p className="text-sm text-foreground/50 -mb-2">
                    Optional — only needed if tracking started after some of this debt was already paid off. Leave blank to use the starting balance as the total.
                  </p>
                  <AmountKeypad expr={originalExpr} onChange={setOriginalExpr} calcEnabled={originalCalcEnabled} onToggleCalc={() => setOriginalCalcEnabled((c) => !c)} />
                </div>
              )}

              {subpage === "name" && (
                <div className="pt-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={direction === "owe" ? "e.g. Credit card" : "e.g. Loan to Alex"} data-autofocus data-no-keyboard-scroll className="h-12" />
                </div>
              )}

              {subpage === "notes" && (
                <div className="pt-2">
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" className="h-12" />
                </div>
              )}

              {subpage === "iconColor" && (
                <div className="flex items-center gap-6 pt-2">
                  <div className="flex-1">
                    <PickerField label="Icon">
                      <IconPicker value={icon} onChange={setIcon} previewColor={color} />
                    </PickerField>
                  </div>
                  <div className="flex-1">
                    <PickerField label="Color">
                      <ColorPicker value={color} onChange={setColor} previewIcon={icon} />
                    </PickerField>
                  </div>
                </div>
              )}
          </SubSheet>
        )}

        <RecurringMultiPicker
          bills={bills}
          selected={recurringIds}
          open={recurringOpen}
          onOpenChange={setRecurringOpen}
          onApply={setRecurringIds}
        />
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 rounded-2xl bg-[#292a2d]/35 px-4 py-4 text-left active:bg-foreground/[0.04] transition-colors">
      <span className="text-foreground/40 shrink-0">{icon}</span>
      <span className="flex-1 font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-foreground/60 min-w-0">
        <span className="truncate max-w-[45vw]">{value}</span>
      </span>
      <ChevronRight className="size-5 text-foreground/30 shrink-0" />
    </button>
  );
}

function OptionList({ options, value, onSelect }: { options: { value: string; label: string }[]; value: string; onSelect: (v: string) => void }) {
  return (
    <div className="rounded-2xl bg-[#292a2d]/35 overflow-hidden divide-y divide-border/50">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onSelect(o.value)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-foreground/[0.04] transition-colors">
          <span className="flex-1 font-medium">{o.label}</span>
          {value === o.value && <Check className="size-5 text-primary shrink-0" />}
        </button>
      ))}
    </div>
  );
}
