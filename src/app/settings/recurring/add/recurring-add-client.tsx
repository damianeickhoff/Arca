"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { OptionDropdown } from "@/components/option-dropdown";
import { CategoryPicker } from "@/components/category-picker";
import { FormSubpage, FormAmountHero, FormCard, FormField, FormSaveButton } from "@/components/form-subpage";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/format";

const TYPE_OPTIONS = [
  { value: "income", label: "Income" },
  { value: "bill", label: "Bill" },
  { value: "subscription", label: "Subscription" },
  { value: "debt", label: "Debt" },
  { value: "savings", label: "Savings" },
];

const BUDGET_TYPE_OPTIONS = [
  { value: "nodig", label: "Needs" },
  { value: "willen", label: "Wants" },
  { value: "sparen", label: "Savings" },
];

const FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Per quarter" },
  { value: "yearly", label: "Yearly" },
  { value: "weekly", label: "Weekly" },
];

// Routed "Add fixed cost" page, built on the shared FormSubpage scaffold (was
// previously a dialog inside components/settings/recurring/recurring-client.tsx).
// Editing an existing item still uses that dialog.
export function RecurringAddClient({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    type: "bill",
    amount: "",
    frequency: "monthly",
    budgetType: "nodig",
    notes: "",
    dueDay: "",
    matchPattern: "",
    matchMode: "exact" as "exact" | "range",
    matchAmount: "",
    matchAmountMin: "",
    matchAmountMax: "",
    categoryId: "",
    friendlyName: "",
  });

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSave = !loading && !!form.name.trim() && !!form.amount;

  async function save() {
    if (!form.name.trim() || !form.amount) return;
    setLoading(true);
    await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        frequency: form.frequency,
        notes: form.notes,
        matchPattern: form.matchPattern,
        active: true,
        budgetType: form.type === "income" ? null : form.budgetType,
        amount: form.amount ? parseFloat(form.amount) : null,
        dueDay: form.dueDay ? parseInt(form.dueDay) : null,
        matchAmount: form.matchMode === "exact" && form.matchAmount ? parseFloat(form.matchAmount) : null,
        matchAmountMin: form.matchMode === "range" && form.matchAmountMin ? parseFloat(form.matchAmountMin) : null,
        matchAmountMax: form.matchMode === "range" && form.matchAmountMax ? parseFloat(form.matchAmountMax) : null,
        categoryId: form.categoryId ? parseInt(form.categoryId) : null,
        friendlyName: form.friendlyName.trim() || null,
      }),
    });
    setLoading(false);
    router.back();
    router.refresh();
  }

  return (
    <FormSubpage title="Add fixed cost">
      <FormAmountHero
        prefix={<>{currencySymbol()}</>}
        value={form.amount}
        onChange={(e) => set("amount", e.target.value)}
        autoFocus
      />

      <FormCard>
        <FormField label="Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Netflix" />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type">
            <OptionDropdown value={form.type} onChange={(v) => set("type", v)} options={TYPE_OPTIONS} triggerClassName="bg-foreground/3 px-3.5" />
          </FormField>
          <FormField label="Budget type">
            <OptionDropdown
              value={form.type === "income" ? "" : form.budgetType}
              onChange={(v) => set("budgetType", v)}
              options={BUDGET_TYPE_OPTIONS}
              disabled={form.type === "income"}
              triggerClassName="bg-foreground/3 px-3.5"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Frequency">
            <OptionDropdown value={form.frequency} onChange={(v) => set("frequency", v)} options={FREQUENCY_OPTIONS} triggerClassName="bg-foreground/3 px-3.5" />
          </FormField>
          <FormField label="Due day (1–31)">
            <Input inputMode="numeric" value={form.dueDay} onChange={(e) => set("dueDay", e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 28" />
          </FormField>
        </div>

        <FormField label="Notes">
          <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional note" />
        </FormField>

        <FormField label="Match pattern">
          <Input value={form.matchPattern} onChange={(e) => set("matchPattern", e.target.value)} placeholder="e.g. Allianz, Netflix" />
          <p className="text-xs text-foreground/60 mt-1">Text within the description</p>
        </FormField>

        <FormField label="Match amount (optional)">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-foreground/5 p-1 mb-2 mt-1">
            {(["exact", "range"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("matchMode", m)}
                className={cn(
                  "rounded-md py-1.5 text-sm transition-colors",
                  form.matchMode === m ? "bg-background shadow-sm font-medium" : "text-foreground/60",
                )}
              >
                {m === "exact" ? "Exact amount" : "Between amounts"}
              </button>
            ))}
          </div>
          {form.matchMode === "exact" ? (
            <Input inputMode="decimal" value={form.matchAmount} onChange={(e) => set("matchAmount", e.target.value)} placeholder="e.g. 12.99" />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input inputMode="decimal" value={form.matchAmountMin} onChange={(e) => set("matchAmountMin", e.target.value)} placeholder="Min, e.g. 40.00" />
              <Input inputMode="decimal" value={form.matchAmountMax} onChange={(e) => set("matchAmountMax", e.target.value)} placeholder="Max, e.g. 80.00" />
            </div>
          )}
        </FormField>

        <FormField label="Category">
          <CategoryPicker
            categories={categories}
            current={form.categoryId || undefined}
            onChange={(v) => set("categoryId", v)}
            triggerClassName="h-12 w-full rounded-lg bg-foreground/3 px-3.5 mt-1 text-sm font-normal"
          />
          <p className="text-xs text-foreground/60 mt-1">Auto-assigned to matches</p>
        </FormField>

        <FormField label="Friendly name">
          <Input value={form.friendlyName} onChange={(e) => set("friendlyName", e.target.value)} placeholder="e.g. Amazon Prime" />
          <p className="text-xs text-foreground/60 mt-1">Overrides name cleanup</p>
        </FormField>
      </FormCard>

      <FormSaveButton onClick={save} disabled={!canSave} loading={loading} />
    </FormSubpage>
  );
}
