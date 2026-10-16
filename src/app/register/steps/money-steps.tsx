"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAlertCircle,
  IconBarbell,
  IconBolt,
  IconCalendarRepeat,
  IconCheck,
  IconDeviceMobile,
  IconDeviceTv,
  IconFileSpreadsheet,
  IconHome,
  IconPlus,
  IconUmbrella,
  IconUpload,
  IconWifi,
} from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { ClearField, ClearInput } from "@/components/clear/field";
import { IconTile } from "@/components/clear/icon-tile";
import { Segmented } from "@/components/clear/segmented";
import { Amount } from "@/components/clear/amount";
import { BudgetStrategyEditor, strategyTotal, type BudgetStrategyDraft } from "@/app/budget/budget-strategy-editor";
import { MoneyInput, parseMoney } from "@/app/settings/account-edit-dialogs";
import { NewAccountsPrompt } from "@/components/new-accounts-prompt";
import { ImportColumnMapping, type NeedsMappingResponse } from "@/components/import-column-mapping";
import type { Bank } from "@/db/schema";
import { cn } from "@/lib/utils";
import { StepFooter, StepHeading, StepNotice } from "../onboarding-ui";

// ── 8 · Budget strategy (Onboard-08) ──────────────────────────────────────────

const PRESETS: BudgetStrategyDraft[] = [
  { nodig: 50, willen: 30, sparen: 20 },
  { nodig: 60, willen: 20, sparen: 20 },
  { nodig: 70, willen: 20, sparen: 10 },
];

const same = (a: BudgetStrategyDraft, b: BudgetStrategyDraft) => a.nodig === b.nodig && a.willen === b.willen && a.sparen === b.sparen;
const splitLabel = (s: BudgetStrategyDraft) => `${s.nodig} / ${s.willen} / ${s.sparen}`;

export function StrategyStep({
  value,
  onChange,
  pending,
  onBack,
  onNext,
}: {
  value: BudgetStrategyDraft;
  onChange: (v: BudgetStrategyDraft) => void;
  pending: boolean;
  onBack?: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.strategy");
  const tApp = useTranslations("onboarding");
  const presetIndex = PRESETS.findIndex((p) => same(p, value));
  const ok = strategyTotal(value) === 100;

  const chip = (on: boolean) =>
    cn(
      "inline-flex h-9 cursor-pointer items-center rounded-full px-3.5 text-[13px] font-bold tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50",
      on ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-ground text-clear-ink hover:bg-clear-line",
    );

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />

      <div className="flex flex-col gap-[22px]">
        <div role="group" aria-labelledby="ob-presets" className="flex flex-wrap items-center gap-2">
          <span id="ob-presets" className="mr-1 text-[13px] font-bold text-clear-ink-2">{t("presets")}</span>
          {PRESETS.map((p, i) => (
            <button key={splitLabel(p)} type="button" aria-pressed={presetIndex === i} onClick={() => onChange(p)} className={chip(presetIndex === i)}>
              {splitLabel(p)}
            </button>
          ))}
          <span aria-hidden={presetIndex !== -1} className={cn(chip(presetIndex === -1), "cursor-default")}>
            {t("custom")}
          </span>
        </div>

        <BudgetStrategyEditor value={value} onChange={onChange} income={0} />

        <span className="text-[13px] text-clear-muted">{ok ? t("later") : t("mustTotal")}</span>
      </div>

      <StepFooter onBack={onBack} primaryLabel={pending ? tApp("saving") : tApp("continue")} onPrimary={onNext} primaryDisabled={!ok || pending} />
    </>
  );
}

// ── 9 · Your first bill (Onboard-09) ──────────────────────────────────────────

const BILL_TYPES = ["bill", "subscription", "debt"] as const;
type BillType = (typeof BILL_TYPES)[number];

const QUICK_PICKS = [
  { key: "rent", type: "bill", icon: IconHome },
  { key: "energy", type: "bill", icon: IconBolt },
  { key: "internet", type: "subscription", icon: IconWifi },
  { key: "phone", type: "subscription", icon: IconDeviceMobile },
  { key: "insurance", type: "bill", icon: IconUmbrella },
  { key: "streaming", type: "subscription", icon: IconDeviceTv },
  { key: "gym", type: "subscription", icon: IconBarbell },
] as const;

/** The next date a bill on `day` falls, clamped to short months. */
function nextDueDate(day: number) {
  const now = new Date();
  const at = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  const thisMonth = at(now.getFullYear(), now.getMonth());
  return thisMonth.getDate() >= now.getDate() ? thisMonth : at(now.getFullYear(), now.getMonth() + 1);
}

export function BillStep({
  savedCount,
  onSaved,
  onBack,
  onSkip,
  onNext,
}: {
  savedCount: number;
  onSaved: () => void;
  onBack?: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.bill");
  const tApp = useTranslations("onboarding");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [type, setType] = useState<BillType>("bill");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const parsedAmount = parseMoney(amount);
  const day = /^\d+$/.test(dueDay) ? Number(dueDay) : null;
  const dayValid = day == null ? dueDay === "" : day >= 1 && day <= 31;
  const filled = name.trim() !== "" && parsedAmount != null && parsedAmount > 0 && dayValid;
  const PickIcon = QUICK_PICKS.find((p) => p.key === pick)?.icon ?? IconCalendarRepeat;

  async function save() {
    if (!filled) return false;
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          amount: parsedAmount,
          frequency: "monthly",
          budgetType: "nodig",
          dueDay: day,
          matchPattern: name.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      onSaved();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setName("");
    setType("bill");
    setAmount("");
    setDueDay("");
    setPick(null);
  }

  async function addAnother() {
    if (await save()) reset();
  }

  async function next() {
    if (!filled) return onNext();
    if (await save()) onNext();
  }

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle", { app: tApp("appName") })} />

      <div className="flex flex-col gap-5">
        <div role="group" aria-labelledby="ob-quick-pick" className="flex flex-col gap-2.5">
          <span id="ob-quick-pick" className="text-[13px] font-bold text-clear-ink-2">{t("quickPick")}</span>
          <div className="flex flex-wrap gap-2">
            {QUICK_PICKS.map((p) => {
              const on = pick === p.key;
              const Icon = p.icon;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setPick(p.key);
                    setName(t(`picks.${p.key}`));
                    setType(p.type);
                  }}
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center gap-[7px] rounded-full pr-3.5 pl-[11px] text-[13px] font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                    on ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-ground text-clear-ink hover:bg-clear-line",
                  )}
                >
                  <Icon size={16} stroke={1.9} aria-hidden />
                  {t(`picks.${p.key}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <ClearField label={t("name")} htmlFor="ob-bill-name" className="col-span-2 sm:col-span-1">
              <ClearInput
                id="ob-bill-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setPick(null);
                }}
                placeholder={t("namePlaceholder")}
              />
            </ClearField>
            <ClearField label={t("amount")} htmlFor="ob-bill-amount">
              <MoneyInput id="ob-bill-amount" value={amount} onChange={setAmount} />
            </ClearField>
            <ClearField label={t("dueDay")} htmlFor="ob-bill-due" error={dayValid ? undefined : t("dueDayInvalid")}>
              <ClearInput
                id="ob-bill-due"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder={t("dueDayPlaceholder")}
                aria-invalid={!dayValid || undefined}
              />
            </ClearField>
          </div>
          <div className="flex flex-col gap-1.5">
            <span id="ob-bill-type" className="text-[13px] font-bold text-clear-ink-2">{t("type")}</span>
            <Segmented
              label={t("type")}
              surface="tile"
              value={type}
              onChange={setType}
              items={BILL_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
              className="self-start"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile px-4 pt-3.5 pb-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[13px] font-bold text-clear-ink-2">{t("preview")}</span>
            <span className="flex-1" />
            {savedCount > 0 && <span className="text-[13px] font-semibold text-clear-positive">{t("saved", { count: savedCount })}</span>}
            <ClearButton variant="surface" size="sm" onClick={addAnother} disabled={!filled || pending}>
              <IconPlus stroke={2} aria-hidden />
              {t("addAnother")}
            </ClearButton>
          </div>
          {filled ? (
            <div className="flex items-center gap-3.5 rounded-clear-row bg-clear-card py-2.5 pr-4 pl-2.5">
              <IconTile tone="stone">
                <PickIcon stroke={1.9} />
              </IconTile>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{name.trim()}</span>
                <span className="truncate text-[13px] text-clear-muted">
                  {day != null
                    ? `${nextDueDate(day).toLocaleDateString(locale, { day: "numeric", month: "short" })} · ${t(`types.${type}`)}`
                    : t(`types.${type}`)}
                </span>
              </span>
              <span className="hidden items-center gap-1.5 text-[13px] font-semibold text-clear-ink-2 sm:inline-flex">
                <span aria-hidden className="size-2 rounded-full bg-clear-info-fill" />
                {t("everyMonth")}
              </span>
              <Amount value={parsedAmount ?? 0} splitCents={false} className="ml-2.5 text-[15px]" />
            </div>
          ) : (
            <div className="rounded-clear-row border-[1.5px] border-dashed border-clear-line px-4 py-3.5 text-[13px] text-clear-muted">{t("previewEmpty")}</div>
          )}
        </div>
        {failed && <StepNotice>{t("saveFailed")}</StepNotice>}
      </div>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        primaryLabel={pending ? tApp("saving") : tApp("continue")}
        onPrimary={next}
        primaryDisabled={pending || (!filled && savedCount === 0)}
      />
    </>
  );
}

// ── 10 · Import transactions (Onboard-10) ─────────────────────────────────────

export interface ImportedFile {
  name: string;
  imported: number;
  skipped: number;
  autoCategorised: number;
}

export function ImportStep({
  files,
  onImported,
  onBack,
  onSkip,
  onNext,
}: {
  files: ImportedFile[];
  onImported: (file: ImportedFile) => void;
  onBack?: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.import");
  const tApp = useTranslations("onboarding");
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [newAccounts, setNewAccounts] = useState<Bank[]>([]);
  const [mapping, setMapping] = useState<NeedsMappingResponse | null>(null);

  function done(name: string, data: { imported: number; skipped: number; autoCategorised: number; newAccounts?: Bank[] }) {
    setStatus("idle");
    onImported({ name, imported: data.imported, skipped: data.skipped, autoCategorised: data.autoCategorised });
    if (data.newAccounts?.length) setNewAccounts(data.newAccounts);
  }

  async function upload(file: File) {
    setStatus("loading");
    setFileName(file.name);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error();
      if (data.needsMapping) {
        // An unknown bank: collect the column mapping once, then it imports from there.
        setStatus("idle");
        setMapping(data);
        return;
      }
      done(file.name, data);
    } catch {
      setStatus("error");
    }
  }

  const empty = files.length === 0;

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />

      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} role="status" className="flex items-center gap-3.5 rounded-clear-tile bg-clear-mint px-4 py-3.5">
          <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-positive-fill text-clear-card">
            <IconCheck size={20} stroke={2.6} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15px] font-bold">{f.name}</span>
            <span className="text-[13px] font-semibold text-clear-mint-ink">
              {t("resultLine", { imported: f.imported, auto: f.autoCategorised })}
              {f.skipped > 0 && ` · ${t("skipped", { count: f.skipped })}`}
            </span>
          </span>
        </div>
      ))}

      {status === "error" && (
        <div role="alert" className="flex items-start gap-3.5 rounded-clear-tile bg-clear-rose px-4 py-3.5">
          <IconAlertCircle size={22} stroke={2} aria-hidden className="mt-0.5 shrink-0 text-clear-negative" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-bold text-clear-negative">{t("failed")}</span>
            <span className="text-[13px] text-clear-ink-2">{t("failedBody", { file: fileName })}</span>
          </span>
        </div>
      )}

      <button
        type="button"
        disabled={status === "loading"}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void upload(f);
        }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-center rounded-clear-tile border-[1.5px] border-dashed text-clear-ink outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50 disabled:cursor-progress",
          dragOver ? "border-clear-ember bg-clear-peach/40" : "border-clear-line hover:border-clear-placeholder hover:bg-clear-tile",
          empty && status !== "loading" ? "flex-col gap-3 px-6 py-9 text-center" : "h-13 gap-2.5 px-4",
        )}
      >
        {status === "loading" ? (
          <>
            <IconFileSpreadsheet size={20} stroke={1.9} aria-hidden className="animate-pulse" />
            <span role="status" className="text-sm font-bold">{t("importing", { file: fileName })}</span>
          </>
        ) : empty ? (
          <>
            <IconTile tone="mint" size="lg">
              <IconUpload stroke={1.9} />
            </IconTile>
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-bold">{t("choose")}</span>
              <span className="text-[13px] leading-[1.45] text-clear-muted">{t("chooseHint")}</span>
            </span>
          </>
        ) : (
          <>
            <IconUpload size={18} stroke={1.9} aria-hidden />
            <span className="text-sm font-bold">{t("another")}</span>
            <span className="hidden text-[13px] font-medium text-clear-muted min-[420px]:inline">{t("anotherHint")}</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />

      <StepFooter
        onBack={onBack}
        onSkip={empty ? onSkip : undefined}
        primaryLabel={tApp("continue")}
        onPrimary={onNext}
        primaryDisabled={empty || status === "loading"}
      />

      <NewAccountsPrompt accounts={newAccounts} onDone={() => setNewAccounts([])} />
      <ImportColumnMapping
        data={mapping}
        onCancel={() => setMapping(null)}
        onImported={(data) => {
          setMapping(null);
          done(fileName, data);
        }}
      />
    </>
  );
}
