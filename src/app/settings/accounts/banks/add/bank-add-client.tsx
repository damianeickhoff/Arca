"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { OptionDropdown } from "@/components/option-dropdown";
import { DatePicker } from "@/components/date-picker";
import { TRANSFER_TYPES } from "@/lib/transfer-types";
import { FormSubpage, FormCard, FormField, FormSaveButton } from "@/components/form-subpage";

const CARD_TYPE_OPTIONS = [
  { value: "debitcard", label: "Debit card" },
  { value: "creditcard", label: "Credit card" },
  { value: "savings", label: "Savings account" },
  { value: "cash", label: "Cash" },
];

const TRANSFER_KIND_OPTIONS = [
  { value: "", label: "None" },
  ...TRANSFER_TYPES.filter((t) => t.value !== "other").map((t) => ({ value: t.value, label: t.label })),
];

// Routed "New bank" page, built on the shared FormSubpage scaffold (was previously
// the add dialog inside app/settings/banks-client.tsx). Editing an existing bank
// still uses that dialog.
export function BankAddClient() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    accountNumber: "",
    displayName: "",
    cardType: "",
    expiration: "",
    startingBalance: "",
    startingDate: new Date().toISOString().slice(0, 10),
    transferKind: "",
  });

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSave = !saving && (!!form.displayName || !!form.accountNumber);

  async function save() {
    if (!form.displayName && !form.accountNumber) return;
    setSaving(true);
    await fetch("/api/banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountNumber: form.accountNumber || null,
        displayName: form.displayName || null,
        cardType: form.cardType || null,
        expirationDate: form.expiration || null,
        startingBalance: form.startingBalance !== "" ? parseFloat(form.startingBalance) : null,
        startingDate: form.startingDate || null,
        transferKind: form.transferKind || null,
      }),
    });
    setSaving(false);
    router.back();
    router.refresh();
  }

  return (
    // No amount hero here: a bank's starting balance is optional and secondary, so
    // putting it in the hero read as if it were the point of the form.
    <FormSubpage title="Add new account">
      <div className="pt-4">
      <FormCard>
        <FormField label="Name / Bank">
          <Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="e.g. ING Checking" />
        </FormField>

        <FormField label="Account number (optional)">
          <Input
            value={form.accountNumber}
            onChange={(e) => set("accountNumber", e.target.value)}
            placeholder="NL00 INGB 0000 0000 00"
            className="font-mono"
          />
        </FormField>

        <FormField label="Card type">
          <OptionDropdown
            value={form.cardType}
            onChange={(v) => set("cardType", v)}
            options={CARD_TYPE_OPTIONS}
            title="Card type"
            triggerClassName="bg-foreground/3 px-3.5"
          />
        </FormField>

        <FormField label="Expiry date">
          <DatePicker value={form.expiration} onChange={(v) => set("expiration", v)} />
        </FormField>

        <FormField label="Starting balance (optional)">
          <AmountInput
            value={form.startingBalance}
            onChange={(e) => set("startingBalance", e.target.value)}
            placeholder="0"
          />
          <p className="text-xs text-foreground/50 mt-1">
            Added to this account&apos;s balance, but never affects reports.
          </p>
        </FormField>

        <FormField label="Starting date (optional)">
          <DatePicker value={form.startingDate} onChange={(v) => set("startingDate", v)} />
        </FormField>

        <FormField label="Transfer type (optional)">
          <OptionDropdown
            value={form.transferKind}
            onChange={(v) => set("transferKind", v)}
            options={TRANSFER_KIND_OPTIONS}
            title="Transfer type"
            triggerClassName="bg-foreground/3 px-3.5"
          />
          <p className="text-xs text-foreground/50 mt-1">
            Transfers to/from this account auto-tag with this type in transaction lists.
          </p>
        </FormField>
      </FormCard>
      </div>

      <FormSaveButton onClick={save} disabled={!canSave} loading={saving} />
    </FormSubpage>
  );
}
