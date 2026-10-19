"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconBuildingBank, IconInfoCircle } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogFooterDock, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { DatePicker } from "@/components/date-picker";
import { DATE_TRIGGER, FIELD_LABEL, MoneyInput, parseMoney, useAccountTypeLabels } from "@/app/settings/account-edit-dialogs";
import { cn } from "@/lib/utils";
import type { Bank } from "@/db/schema";

/**
 * Shown right after a CSV import (or the onboarding import step) introduces one or more
 * brand-new bank accounts. Lets the user name each and backfill a starting balance and
 * date — added to the account's displayed balance but never to reports, since import
 * history rarely reaches back to when the account was opened.
 */
export function NewAccountsPrompt({ accounts, onDone }: { accounts: Bank[]; onDone: () => void }) {
  const t = useTranslations("newAccounts");
  const title = t("title", { count: accounts.length });

  return (
    <Dialog open={accounts.length > 0} onOpenChange={(v) => !v && onDone()}>
      <DialogContent
        hideHeaderRow
        title={title}
        className="gap-5 pt-6 font-clear text-clear-ink"
        sheetClassName="lg:max-w-[560px]"
      >
        <PromptBody accounts={accounts} title={title} onDone={onDone} />
      </DialogContent>
    </Dialog>
  );
}

function PromptBody({ accounts, title, onDone }: { accounts: Bank[]; title: string; onDone: () => void }) {
  const t = useTranslations("newAccounts");
  const labels = useAccountTypeLabels();
  const ids = useId();
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState<Record<number, { name: string; balance: string; date: string }>>({});
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  function fieldsFor(a: Bank) {
    return values[a.id] ?? { name: a.displayName ?? "", balance: "", date: today };
  }
  function setField(a: Bank, key: "name" | "balance" | "date", value: string) {
    setValues((v) => ({ ...v, [a.id]: { ...fieldsFor(a), [key]: value } }));
  }

  async function save() {
    setSaving(true);
    await Promise.all(
      accounts
        .filter((a) => {
          const f = fieldsFor(a);
          return parseMoney(f.balance) != null || f.name.trim() !== (a.displayName ?? "");
        })
        .map((a) => {
          const f = fieldsFor(a);
          const body: Record<string, unknown> = { id: a.id };
          const balance = parseMoney(f.balance);
          if (balance != null) {
            body.startingBalance = balance;
            body.startingDate = f.date || null;
          }
          if (f.name.trim() !== (a.displayName ?? "")) body.displayName = f.name.trim() || null;
          return fetch("/api/banks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        }),
    );
    setSaving(false);
    onDone();
  }

  return (
    <>
      <ClearDialogHeader
        title={title}
        subtitle={t("subtitle", { count: accounts.length })}
        icon={
          <IconTile tone="sky" className="size-12">
            <IconBuildingBank stroke={1.9} />
          </IconTile>
        }
        onClose={onDone}
        closeLabel={t("close")}
      />

      <div className="flex flex-col gap-3">
        {accounts.map((a) => {
          const f = fieldsFor(a);
          const heading = a.displayName ?? a.accountNumber ?? "";
          const typeLabel = a.cardType ? labels.bankType(a.cardType) : null;
          return (
            <section key={a.id} aria-labelledby={`${ids}-${a.id}`} className="flex flex-col gap-4 rounded-clear-tile bg-clear-tile p-4">
              <div className="flex items-center gap-3">
                <IconTile tone="lilac">
                  <IconBuildingBank stroke={2} />
                </IconTile>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span id={`${ids}-${a.id}`} className="truncate text-[15px] font-bold">{heading}</span>
                  <span className="truncate text-[13px] text-clear-muted">{typeLabel ? `${typeLabel} · ${t("foundHere")}` : t("foundHere")}</span>
                </span>
                <ClearChip tone="peach">{t("new")}</ClearChip>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <ClearField label={t("name")} htmlFor={`${ids}-${a.id}-name`} className="col-span-2">
                  <ClearInput
                    id={`${ids}-${a.id}-name`}
                    value={f.name}
                    onChange={(e) => setField(a, "name", e.target.value)}
                    placeholder={a.accountNumber ?? ""}
                    className="bg-clear-card"
                  />
                </ClearField>
                <ClearField label={t("startingBalance")} htmlFor={`${ids}-${a.id}-balance`} className="col-span-2 min-[420px]:col-span-1">
                  <MoneyInput id={`${ids}-${a.id}-balance`} value={f.balance} onChange={(v) => setField(a, "balance", v)} className="bg-clear-card" />
                </ClearField>
                <div role="group" aria-labelledby={`${ids}-${a.id}-date`} className="col-span-2 flex flex-col gap-1.5 min-[420px]:col-span-1">
                  <span id={`${ids}-${a.id}-date`} className={FIELD_LABEL}>{t("asOf")}</span>
                  <DatePicker
                    value={f.date}
                    onChange={(v) => setField(a, "date", v)}
                    label={f.date === today ? t("today") : dateFmt.format(new Date(`${f.date}T12:00:00`))}
                    triggerClassName={cn(DATE_TRIGGER, "bg-clear-card")}
                  />
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <p className="m-0 flex items-start gap-2.5 text-[13px] leading-[1.5] text-clear-ink-2">
        <IconInfoCircle aria-hidden size={16} stroke={2} className="mt-0.5 shrink-0" />
        <span>{t("hint")}</span>
      </p>

      <ClearDialogFooterDock className="pb-1">
        <ClearDialogFooter>
          <button type="button" onClick={onDone} disabled={saving} className={clearButtonVariants({ variant: "secondary" })}>
            {t("later")}
          </button>
          <button type="button" onClick={save} disabled={saving} className={clearButtonVariants()}>
            {saving ? t("saving") : t("save", { count: accounts.length })}
          </button>
        </ClearDialogFooter>
      </ClearDialogFooterDock>
    </>
  );
}
