"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAlertTriangle,
  IconCheck,
  IconFileText,
  IconFileUpload,
  IconListCheck,
  IconLoader2,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { refreshLayoutAction } from "@/app/actions/refresh-layout";
import type { ImportPreview, PreviewRowStatus } from "@/lib/import-preview";
import { NewAccountsPrompt } from "@/components/new-accounts-prompt";
import { ImportColumnMapping, type ManualImportResult, type NeedsMappingResponse } from "@/components/import-column-mapping";
import { AnchoredTip } from "@/components/anchored-tip";
import { Amount } from "@/components/clear/amount";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { StatTile } from "@/components/clear/stat-tile";
import { MoneyText } from "@/components/clear/money";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { TONE_FILL, type ClearTone } from "@/components/clear/tones";
import type { Bank } from "@/db/schema";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

// The CSV import flow — Upload → Check → Done. Picking a file only reads it
// (/api/import/preview): the Check step shows how it was recognised, its first rows
// and which of them are new or duplicates, and nothing is written until the user
// confirms (/api/import/confirm). A file nothing recognises goes to the column
// mapping dialog, which imports on its own once the mapping reads.
//
// The state lives in useCsvImport() so the Import page can drive its step indicator
// and its "Map columns" card from it; <ImportCsvCard> is the self-contained version
// for the Settings › Import CSV panel.

export type ImportStep = "upload" | "check" | "done";

type Phase =
  | { step: "upload" }
  | { step: "reading" }
  | { step: "check"; preview: ImportPreview; fileName: string; importing: boolean }
  | { step: "done"; result: ManualImportResult }
  | { step: "error"; message: string };

/** Error codes the preview/confirm routes answer with (see app/api/import). */
const ERROR_CODES = ["noFile", "emptyFile", "noRows", "parseFailed", "expired"] as const;

export function useCsvImport() {
  const t = useTranslations("importPage.errors");
  const [phase, setPhase] = useState<Phase>({ step: "upload" });
  const [mapping, setMapping] = useState<NeedsMappingResponse | null>(null);
  const [newAccounts, setNewAccounts] = useState<Bank[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Set by "Map columns": the next file picked skips recognition. */
  const mapNext = useRef(false);

  const fail = useCallback(
    (code: unknown) => {
      const known = ERROR_CODES.find((c) => c === code);
      setPhase({ step: "error", message: known ? t(known) : t("generic") });
    },
    [t],
  );

  const finish = useCallback((result: ManualImportResult) => {
    setPhase({ step: "done", result });
    if (result.newAccounts.length > 0) setNewAccounts(result.newAccounts);
  }, []);

  const check = useCallback(
    async (file: File) => {
      const map = mapNext.current;
      mapNext.current = false;
      setPhase({ step: "reading" });
      const fd = new FormData();
      fd.append("file", file);
      if (map) fd.append("map", "1");
      try {
        const res = await fetch("/api/import/preview", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) return fail(data.error);
        if (data.needsMapping) {
          setPhase({ step: "upload" });
          setMapping(data as NeedsMappingResponse);
          return;
        }
        setPhase({ step: "check", preview: data as ImportPreview, fileName: file.name, importing: false });
      } catch {
        fail(null);
      }
    },
    [fail],
  );

  const confirm = useCallback(async () => {
    if (phase.step !== "check" || phase.importing) return;
    setPhase({ ...phase, importing: true });
    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawId: phase.preview.rawId }),
      });
      const data = await res.json();
      if (!res.ok) return fail(data.error);
      if (data.needsMapping) {
        setPhase({ step: "upload" });
        setMapping(data as NeedsMappingResponse);
        return;
      }
      // New rows move the sidebar's account balances and this page's recent imports.
      void refreshLayoutAction();
      finish(data as ManualImportResult);
    } catch {
      fail(null);
    }
  }, [phase, fail, finish]);

  /** Open the file picker; `map` sends the chosen file straight to the mapping dialog. */
  const choose = useCallback((options?: { map?: boolean }) => {
    mapNext.current = options?.map === true;
    inputRef.current?.click();
  }, []);

  const reset = useCallback(() => setPhase({ step: "upload" }), []);

  const step: ImportStep = phase.step === "check" ? "check" : phase.step === "done" ? "done" : "upload";

  return {
    phase,
    step,
    mapping,
    newAccounts,
    inputRef,
    check,
    confirm,
    choose,
    reset,
    finish,
    closeMapping: () => setMapping(null),
    clearNewAccounts: () => setNewAccounts([]),
  };
}

export type CsvImporter = ReturnType<typeof useCsvImport>;

/** Settings › Import CSV: the whole flow on its own, inside the settings panel. */
export function ImportCsvCard() {
  const importer = useCsvImport();
  const t = useTranslations("importPage.unrecognised");
  return (
    <div className="flex flex-col gap-4 pb-6 font-clear text-clear-ink">
      <ImportFlow importer={importer} variant="panel" />
      {importer.step === "upload" && (
        <div className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
          <span className="text-[15px] font-bold">{t("title")}</span>
          <p className="m-0 text-sm leading-normal text-clear-ink-2">{t("body")}</p>
          <button
            type="button"
            data-tip-anchor="importMapColumns"
            onClick={() => importer.choose({ map: true })}
            className={cn(clearButtonVariants({ variant: "surface" }), "self-start")}
          >
            {t("action")}
          </button>
          <AnchoredTip id="importMapColumns" anchor="importMapColumns" />
        </div>
      )}
    </div>
  );
}

/**
 * The drop zone and whatever the current step shows under it. `page` puts the steps on
 * white cards on the grey ground (the Import page); `panel` sits inside a card already.
 */
export function ImportFlow({ importer, variant = "page" }: { importer: CsvImporter; variant?: "page" | "panel" }) {
  const router = useRouter();
  const { phase, inputRef } = importer;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again (after Cancel) still fires a change.
    e.target.value = "";
    if (file) void importer.check(file);
  }

  return (
    <div className="flex flex-col gap-5">
      <input ref={inputRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={onFileChange} />

      <DropZone importer={importer} variant={variant} />

      {phase.step === "check" && <CheckCard importer={importer} phase={phase} variant={variant} />}
      {phase.step === "done" && <DoneCard importer={importer} result={phase.result} variant={variant} />}
      {phase.step === "error" && <ErrorCard importer={importer} message={phase.message} variant={variant} />}

      <NewAccountsPrompt
        accounts={importer.newAccounts}
        onDone={() => { importer.clearNewAccounts(); router.refresh(); }}
      />

      <ImportColumnMapping
        data={importer.mapping}
        onCancel={importer.closeMapping}
        onImported={(data) => {
          importer.closeMapping();
          importer.finish(data);
        }}
      />
    </div>
  );
}

/** A section of the flow: a white card on the page, plain inside the settings panel. */
function FlowSection({ variant, className, ...props }: React.ComponentProps<"section"> & { variant: "page" | "panel" }) {
  return (
    <section
      className={cn("flex min-w-0 flex-col gap-5 font-clear text-clear-ink", variant === "page" && "rounded-clear-card bg-clear-card p-5 lg:p-6", className)}
      {...props}
    />
  );
}

function DropZone({ importer, variant }: { importer: CsvImporter; variant: "page" | "panel" }) {
  const t = useTranslations("importPage.drop");
  const [dragOver, setDragOver] = useState(false);
  const { phase } = importer;
  // Busy reading a file, or importing the checked one: a new file has to wait.
  const reading = phase.step === "reading";
  const busy = reading || (phase.step === "check" && phase.importing);
  // Big while it is the only thing to do; a slim row once a file is being checked.
  const compact = phase.step === "check" || phase.step === "done";

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && !busy) void importer.check(file);
  }

  return (
    <div
      onClick={() => !busy && importer.choose()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      aria-busy={busy}
      className={cn(
        "flex cursor-pointer flex-wrap items-center gap-4 rounded-clear-card border-2 border-dashed font-clear text-clear-ink transition-colors",
        compact ? "px-5 py-[18px]" : "flex-col justify-center px-6 py-10 text-center lg:py-14",
        dragOver ? "border-clear-ink bg-clear-card" : "border-clear-line hover:border-clear-placeholder",
        busy && "cursor-progress",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full",
          variant === "page" ? "bg-clear-card" : "bg-clear-tile",
          compact ? "size-12 [&_svg]:size-[22px]" : "size-14 [&_svg]:size-6",
        )}
      >
        {reading ? <IconLoader2 className="animate-spin" stroke={1.9} /> : <IconUpload stroke={1.9} />}
      </span>
      <span className={cn("flex min-w-0 flex-col gap-0.5", compact && "flex-[1_1_240px]")}>
        <span className="text-[15px] font-bold">
          {reading ? t("reading") : dragOver ? t("release") : compact ? t("titleAnother") : t("title")}
        </span>
        <span className="text-[13px] text-clear-muted">{t("hint")}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); importer.choose(); }}
        className={clearButtonVariants({ variant: variant === "page" ? "surface" : "secondary" })}
      >
        <IconFileUpload aria-hidden />
        {t("choose")}
      </button>
    </div>
  );
}

const STATUS_TONE: Record<PreviewRowStatus, ClearTone> = {
  new: "mint",
  duplicate: "butter",
  invalidDate: "rose",
};

const PREVIEW_COLUMNS = "grid grid-cols-[104px_minmax(200px,2fr)_96px_100px_minmax(150px,1fr)] items-center gap-3 px-3.5";

function CheckCard({
  importer,
  phase,
  variant,
}: {
  importer: CsvImporter;
  phase: Extract<Phase, { step: "check" }>;
  variant: "page" | "panel";
}) {
  const t = useTranslations("importPage.check");
  const locale = useLocale();
  const { preview, fileName, importing } = phase;
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const shortFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const asDate = (iso: string) => new Date(`${iso}T12:00:00`);
  const formatDate = (iso: string) => {
    const d = asDate(iso);
    return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
  };

  const meta = [
    t("previewMeta", { shown: preview.rows.length, total: preview.total }),
    preview.from && preview.to
      ? preview.from === preview.to
        ? formatDate(preview.from)
        : `${(preview.from.slice(0, 4) === preview.to.slice(0, 4) ? shortFmt : dateFmt).format(asDate(preview.from))} – ${formatDate(preview.to)}`
      : null,
    ...preview.accounts.slice(0, 2),
  ].filter(Boolean).join(" · ");

  return (
    <FlowSection variant={variant} aria-label={t("label")}>
      <div className="flex flex-wrap items-center gap-3.5 rounded-clear-tile bg-clear-tile px-4 py-3.5">
        <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-clear-icon bg-clear-card [&_svg]:size-5">
          <IconFileText stroke={1.9} />
        </span>
        <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="min-w-0 truncate text-[15px] font-bold">{fileName}</span>
            <ClearChip tone="mint" icon={<IconCheck stroke={3} aria-hidden />}>{t("recognised")}</ClearChip>
          </span>
          <span className="text-[13px] text-clear-ink-2">
            {preview.source.kind === "bank"
              ? t("bankSource", { rows: preview.total, bank: preview.source.label })
              : t("profileSource", { rows: preview.total, profile: preview.source.label })}
          </span>
        </span>
        <button type="button" onClick={() => importer.choose()} disabled={importing} className={clearButtonVariants({ variant: "surface", size: "sm" })}>
          {t("chooseAnother")}
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-lg font-bold">{t("preview")}</h2>
          <span className="text-[13px] text-clear-muted">{meta}</span>
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <div role="table" aria-label={t("previewTable", { count: preview.rows.length })} className="flex min-w-[660px] flex-col">
            <div role="row" className={cn(PREVIEW_COLUMNS, "h-11 rounded-clear-row bg-clear-tile text-[13px] font-bold text-clear-ink-2")}>
              <span role="columnheader">{t("columns.date")}</span>
              <span role="columnheader">{t("columns.description")}</span>
              <span role="columnheader" className="text-right">{t("columns.amount")}</span>
              <span role="columnheader" className="text-right">{t("columns.balance")}</span>
              <span role="columnheader">{t("columns.result")}</span>
            </div>
            {preview.rows.map((row, i) => (
              <div key={i} role="row" className={cn(PREVIEW_COLUMNS, "min-h-[52px] border-b border-clear-line text-sm last:border-b-0")}>
                <span role="cell" className="whitespace-nowrap text-clear-ink-2 tabular-nums">{formatDate(row.date)}</span>
                <span role="cell" className="truncate font-bold" title={row.name}>{row.name}</span>
                <span role="cell" className="text-right">
                  <Amount value={row.amount} sign="always" splitCents={false} className={cn("text-sm", row.amount > 0 && "text-clear-positive")} />
                </span>
                <span role="cell" className="whitespace-nowrap text-right text-clear-ink-2 tabular-nums">
                  {row.balance != null ? <MoneyText>{formatEur(row.balance)}</MoneyText> : "–"}
                </span>
                <span role="cell">
                  <ClearChip tone={STATUS_TONE[row.status]} className="h-[26px] px-2.5 text-xs">{t(`status.${row.status}`)}</ClearChip>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div data-tip-anchor="importCheck" className="grid gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        <Notice
          tone="mint"
          icon={<IconCheck stroke={2.8} />}
          title={t("newTitle", { count: preview.newCount })}
          body={preview.newCount > 0 ? t("newBody") : t("newBodyNone")}
        />
        {preview.duplicateCount > 0 && (
          <Notice
            tone="butter"
            icon={<IconAlertTriangle stroke={2.2} />}
            title={t("duplicatesTitle", { count: preview.duplicateCount })}
            body={t("duplicatesBody")}
          />
        )}
        {preview.invalidDates > 0 && (
          <Notice
            tone="rose"
            icon={<IconX stroke={2.6} />}
            title={t("invalidTitle", { count: preview.invalidDates })}
            body={t("invalidBody")}
          />
        )}
      </div>
      <AnchoredTip id="importCheck" anchor="importCheck" />

      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
        <button type="button" onClick={importer.reset} disabled={importing} className={clearButtonVariants({ variant: "secondary" })}>
          {t("cancel")}
        </button>
        <button type="button" onClick={() => void importer.confirm()} disabled={importing} className={clearButtonVariants()}>
          {importing ? <IconLoader2 className="animate-spin" aria-hidden /> : <IconFileUpload aria-hidden />}
          {importing ? t("importing") : preview.newCount > 0 ? t("confirm", { count: preview.newCount }) : t("confirmNone")}
        </button>
      </div>
    </FlowSection>
  );
}

/** A pastel notice tile: round white icon, bold line, one line of detail. */
function Notice({ tone, icon, title, body }: { tone: ClearTone; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-clear-tile p-4", TONE_FILL[tone])}>
      <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-card [&_svg]:size-4">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-extrabold">{title}</span>
        <span className="text-[13px] opacity-80">{body}</span>
      </span>
    </div>
  );
}

function DoneCard({ importer, result, variant }: { importer: CsvImporter; result: ManualImportResult; variant: "page" | "panel" }) {
  const t = useTranslations("importPage.done");
  const tMapping = useTranslations("importMapping");
  const uncategorised = Math.max(0, result.imported - result.autoCategorised);
  const figure = (n: number) => <span className="clear-amount">{n}</span>;

  return (
    <FlowSection variant={variant} aria-label={t("title", { count: result.imported })}>
      <div className="flex items-center gap-3.5">
        <IconTile tone="mint" size="md"><IconCheck stroke={2.6} /></IconTile>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-lg font-bold">{t("title", { count: result.imported })}</h2>
          <span className="text-sm text-clear-muted">{t("body", { total: result.total })}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatTile label={t("imported")} value={figure(result.imported)} />
        <StatTile label={t("categorised")} value={figure(result.autoCategorised)} />
        <StatTile label={t("skipped")} value={figure(result.skipped)} className="col-span-2 sm:col-span-1" />
      </div>

      {/* Only a built-in bank parser can get this far with an unreadable date; the
          mapping dialog rejects such files before anything is written. */}
      {result.invalidDates > 0 && (
        <div className="flex items-start gap-3 rounded-clear-tile bg-clear-rose p-4 text-clear-rose-ink">
          <IconAlertTriangle className="mt-0.5 size-[18px] shrink-0" stroke={2.2} aria-hidden />
          <span className="text-sm font-semibold">{tMapping("rowsSkippedBadDate", { count: result.invalidDates })}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <button type="button" onClick={() => importer.choose()} className={clearButtonVariants({ variant: "secondary" })}>
          {t("importAnother")}
        </button>
        {uncategorised > 0 ? (
          <Link href="/transactions/needs-review" className={clearButtonVariants()}>
            <IconListCheck aria-hidden />
            {t("review", { count: uncategorised })}
          </Link>
        ) : (
          <Link href="/transactions" className={clearButtonVariants()}>
            {t("openActivity")}
          </Link>
        )}
      </div>
    </FlowSection>
  );
}

function ErrorCard({ importer, message, variant }: { importer: CsvImporter; message: string; variant: "page" | "panel" }) {
  const t = useTranslations("importPage.errors");
  return (
    <FlowSection variant={variant} role="alert" className="gap-4">
      <div className="flex items-center gap-3.5">
        <IconTile tone="rose" size="md"><IconAlertTriangle stroke={2.2} /></IconTile>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-lg font-bold">{t("title")}</h2>
          <span className="text-sm text-clear-ink-2">{message}</span>
        </div>
      </div>
      <button type="button" onClick={() => importer.choose()} className={cn(clearButtonVariants({ variant: "secondary" }), "self-end")}>
        {t("tryAgain")}
      </button>
    </FlowSection>
  );
}
