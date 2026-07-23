"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import {
  IconPlusFilled as Plus,
  IconDotsVerticalFilled as EllipsisVertical,
  IconTrashFilled as Trash2,
  IconCheckFilled as Check
} from "@tabler/icons-react";
import type { RecurringItem } from "@/db/schema";
import { IconPicker } from "@/components/icon-picker";
import { ColorPicker } from "@/components/color-picker";
import { PickerField } from "@/components/picker-field";
import { isBrandIcon } from "@/components/icon";
import { OptionDropdown } from "@/components/option-dropdown";

interface AddProps { action: "add"; variant?: "default" | "icon" }
interface EditProps { action: "edit"; item: RecurringItem }
type Props = AddProps | EditProps;

const TYPE_OPTIONS = [
  { value: "income",       label: "Inkomen" },
  { value: "bill",         label: "Rekening" },
  { value: "subscription", label: "Abonnement" },
  { value: "debt",         label: "Schuld" },
  { value: "savings",      label: "Sparen" },
];

const BUDGET_TYPE_OPTIONS = [
  { value: "nodig",  label: "Nodig" },
  { value: "willen", label: "Willen" },
  { value: "sparen", label: "Sparen" },
];

const FREQUENCY_OPTIONS = [
  { value: "monthly",   label: "Maandelijks" },
  { value: "quarterly", label: "Per kwartaal" },
  { value: "yearly",    label: "Jaarlijks" },
  { value: "weekly",    label: "Wekelijks" },
];

export function RecurringClient(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isEdit = props.action === "edit";
  const item = isEdit ? props.item : null;

  const [form, setForm] = useState({
    name: item?.name ?? "",
    type: item?.type ?? "bill",
    amount: item?.amount?.toString() ?? "",
    frequency: item?.frequency ?? "monthly",
    budgetType: item?.budgetType ?? "nodig",
    active: item?.active ?? true,
    notes: item?.notes ?? "",
    dueDay: item?.dueDay?.toString() ?? "",
    icon: item?.icon ?? null as string | null,
    iconColor: item?.iconColor ?? null as string | null,
    matchPattern: item?.matchPattern ?? "",
    matchAmount: item?.matchAmount?.toString() ?? "",
  });

  function set(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name.trim() || !form.amount) return;
    setLoading(true);
    const payload = {
      ...form,
      budgetType: form.type === "income" ? null : form.budgetType,
      amount: form.amount ? parseFloat(form.amount) : null,
      dueDay: form.dueDay ? parseInt(form.dueDay) : null,
      matchAmount: form.matchAmount ? parseFloat(form.matchAmount) : null,
      ...(isEdit ? { id: item!.id } : {}),
    };
    await fetch("/api/recurring", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Verwijder "${item?.name}"?`)) return;
    setLoading(true);
    await fetch("/api/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item!.id }),
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {isEdit ? (
        <button className="flex items-center justify-center p-1.5 hover:bg-foreground/10 text-foreground rounded-sm bg-foreground/3 hover:text-foreground shrink-0 size-9" onClick={() => setOpen(true)}>
          <EllipsisVertical className="size-4" />
        </button>
      ) : props.variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          className="glass-icon-btn size-12"
          aria-label="Vaste kost toevoegen"
        >
          <Plus className="size-5 text-foreground dark:text-gray-300" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity shrink-0"
          title="Vaste kost toevoegen"
        >
          <Plus className="size-5" />
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
        <DialogHeader
          actions={
            isEdit && (
              <div className="flex items-center gap-2">
                {!form.active && <span className="text-xs text-destructive">Uitgeschakeld</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => set("active", !form.active)}
                  title={form.active ? "Actief" : "Uitgeschakeld"}
                  className={
                    form.active
                      ? "shrink-0 bg-foreground/3 text-foreground hover:bg-foreground/10 size-9"
                      : "shrink-0 bg-destructive/10 border border-destructive/50 text-destructive hover:bg-destructive/25 size-9"
                  }
                >
                  {form.active && <Check className="size-4" />}
                </Button>
              </div>
            )
          }
        >
          <DialogTitle>{isEdit ? "Bewerken" : "Vaste Last Toevoegen"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Naam *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <OptionDropdown value={form.type} onChange={(v) => set("type", v)} options={TYPE_OPTIONS} />
            </Field>
            <Field label="Budget type">
              <OptionDropdown
                value={form.type === "income" ? "" : form.budgetType}
                onChange={(v) => set("budgetType", v)}
                options={BUDGET_TYPE_OPTIONS}
                disabled={form.type === "income"}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bedrag (EUR) *">
              <AmountInput value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Frequentie">
              <OptionDropdown value={form.frequency} onChange={(v) => set("frequency", v)} options={FREQUENCY_OPTIONS} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Betaaldag (1–31)">
              <Input type="number" inputMode="numeric" min="1" max="31" value={form.dueDay} onChange={(e) => set("dueDay", e.target.value)} placeholder="bv. 28" />
            </Field>
            <Field label="Notities">
              <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 border-b border-foreground/5 pb-5">
            <Field label="Match patroon">
              <Input
                value={form.matchPattern}
                onChange={(e) => set("matchPattern", e.target.value)}
                placeholder="bijv. Allianz, Netflix"
              />
              <p className="text-xs text-foreground/60 mt-1">Tekst in omschrijving</p>
            </Field>
            <Field label="Match bedrag (optioneel)">
              <AmountInput
                value={form.matchAmount}
                onChange={(e) => set("matchAmount", e.target.value)}
                placeholder="bijv. 12.99"
              />
              <p className="text-xs text-foreground/60 mt-1 ">Exact bedrag</p>
            </Field>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <PickerField label="Icoon">
                <IconPicker value={form.icon} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} previewColor={form.iconColor} />
              </PickerField>
            </div>
            {!(form.icon && isBrandIcon(form.icon)) && (
              <div className="flex-1">
                <PickerField label="Icoon kleur">
                  <ColorPicker value={form.iconColor ?? "#6366f1"} onChange={(v) => setForm((f) => ({ ...f, iconColor: v }))} previewIcon={form.icon} />
                </PickerField>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={loading || !form.name.trim() || !form.amount} className="flex-1">
              {loading ? "Opslaan..." : "Opslaan"}
            </Button>
            {isEdit && (
              <Button variant="destructive" size="icon" className="size-12" onClick={remove} disabled={loading}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
