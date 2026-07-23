"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { OptionDropdown } from "@/components/option-dropdown";
import { DatePicker } from "@/components/date-picker";
import { FormSubpage, FormAmountHero, FormCard, FormField, FormSaveButton } from "@/components/form-subpage";
import { currencySymbol } from "@/lib/format";

const VERMOGEN_TYPE_OPTIONS = [
  { value: "spaarrekening", label: "Savings account" },
  { value: "beleggingen", label: "Investments" },
  { value: "betaalrekening", label: "Checking account" },
  { value: "bezitting", label: "Possession" },
];

// Routed "New asset account" page, built on the shared FormSubpage scaffold (was
// previously the add dialog inside app/settings/banks-client.tsx). Editing an
// existing account still uses that dialog.
export function VermogenAddClient() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    type: "",
    value: "",
    notes: "",
    lastUpdated: new Date().toISOString().slice(0, 10),
  });

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSave = !saving && !!form.name && !!form.type;

  async function save() {
    if (!form.name || !form.type) return;
    setSaving(true);
    await fetch("/api/vermogen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        value: parseFloat(form.value) || 0,
        notes: form.notes || null,
        lastUpdated: form.lastUpdated || null,
      }),
    });
    setSaving(false);
    router.back();
    router.refresh();
  }

  return (
    <FormSubpage title="Add new asset">
      <FormAmountHero
        prefix={<>{currencySymbol()}</>}
        value={form.value}
        onChange={(e) => set("value", e.target.value)}
        autoFocus
      />

      <FormCard>
        <FormField label="Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. ING Savings" />
        </FormField>

        <FormField label="Type">
          <OptionDropdown
            value={form.type}
            onChange={(v) => set("type", v)}
            options={VERMOGEN_TYPE_OPTIONS}
            title="Type"
            triggerClassName="bg-foreground/3 px-3.5"
          />
        </FormField>

        <FormField label="Last updated">
          <DatePicker value={form.lastUpdated} onChange={(v) => set("lastUpdated", v)} />
        </FormField>

        <FormField label="Notes">
          <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional note" />
        </FormField>
      </FormCard>

      <FormSaveButton onClick={save} disabled={!canSave} loading={saving} />
    </FormSubpage>
  );
}
