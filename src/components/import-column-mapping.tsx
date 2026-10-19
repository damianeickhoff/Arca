"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconBookmark, IconBuildingBank, IconCalendarEvent, IconCoinEuro, IconFileImport } from "@tabler/icons-react";
import { refreshLayoutAction } from "@/app/actions/refresh-layout";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogFooterDock, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import type { ClearTone } from "@/components/clear/tones";
import { ClearSelect, type ClearSelectOption } from "@/components/settings/accounts/clear-select";
import { ContextualTip } from "@/components/contextual-tip";
import { AnchoredTip } from "@/components/anchored-tip";
import { guessBalanceColumn } from "@/lib/import-columns";
import { parseAmount, parseDate, type ColumnMapping } from "@/lib/import-parse";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Bank } from "@/db/schema";
import { MoneyText } from "@/components/clear/money";

export interface NeedsMappingResponse {
  needsMapping: true;
  rawId: string;
  delimiter: string;
  headers: string[];
  previewRows: string[][];
  /** A mapping we already have but couldn't trust — a saved profile that stopped
   *  producing readable dates. Seeds the form so the user corrects it rather than
   *  rebuilding it from scratch. */
  prefill?: ColumnMapping | null;
}

export interface ManualImportResult {
  imported: number;
  skipped: number;
  autoCategorised: number;
  invalidDates: number;
  total: number;
  newAccounts: Bank[];
}

interface Props {
  data: NeedsMappingResponse | null;
  onImported: (result: ManualImportResult) => void;
  onCancel: () => void;
}

// Each mapped role has a colour: a chip on its column in the preview and a dot in
// its field, so "which column did I pick" can be read at a glance.
type Role = "date" | "description" | "amount" | "direction" | "account" | "counterAccount" | "balance";

const ROLE_TONE: Record<Role, ClearTone> = {
  date: "sky",
  description: "lilac",
  amount: "mint",
  direction: "butter",
  account: "stone",
  counterAccount: "rose",
  balance: "peach",
};

const ROLE_DOT: Record<Role, string> = {
  date: "bg-clear-sky-ink",
  description: "bg-clear-lilac-ink",
  amount: "bg-clear-mint-ink",
  direction: "bg-clear-butter-ink",
  account: "bg-clear-stone-ink",
  counterAccount: "bg-clear-rose-ink",
  balance: "bg-clear-peach-ink",
};

const PREVIEW_ROWS = 4;
const SAMPLE_ROWS = 3;

/** One column picker, labelled, with its role's dot. */
function ColumnField({
  label,
  optional,
  role,
  options,
  value,
  onChange,
  hint,
  className,
}: {
  label: string;
  optional?: string;
  role?: Role;
  options: ClearSelectOption<number | null>[];
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={id} className="text-[13px] font-bold text-clear-ink-2">
        {label}
        {optional && <span className="font-semibold text-clear-muted"> {optional}</span>}
      </span>
      <ClearSelect value={value} options={options} onChange={onChange} ariaLabelledBy={id} dot={role && value !== null ? ROLE_DOT[role] : undefined} />
      {hint && <span className="text-[13px] text-clear-muted">{hint}</span>}
    </div>
  );
}

/**
 * What the current mapping actually makes of the file's first rows:
 * "21-06-2024 → Friday 21 June 2024", or the raw cell flagged as unreadable.
 *
 * This is the whole point of the preview — picking the wrong column is invisible until
 * you see the result, and an unreadable date used to be written to the database verbatim.
 */
function ParsePreview({
  title,
  icon,
  status,
  samples,
  invalidLabel,
}: {
  title: string;
  icon: React.ReactNode;
  status?: React.ReactNode;
  samples: { raw: string; parsed: string | null }[];
  invalidLabel: string;
}) {
  if (samples.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-clear-tile bg-clear-tile px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-bold">
          {icon}
          {title}
        </span>
        {status}
      </div>
      {samples.map((s, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <span className="min-w-[92px] max-w-[45%] truncate text-clear-ink-2 tabular-nums">{s.raw || "—"}</span>
          <span aria-hidden className="text-clear-muted">→</span>
          {s.parsed === null ? (
            <span className="font-bold text-clear-negative">✗ {invalidLabel}</span>
          ) : (
            <span className="truncate font-bold"><MoneyText>{s.parsed}</MoneyText></span>
          )}
        </div>
      ))}
    </div>
  );
}

// Shown when an uploaded CSV doesn't match any built-in bank format (ING, Rabobank,
// ABN AMRO, bunq, Revolut, KNAB). Lets the user tell us which column is which; the
// mapping is saved so future imports from this same bank apply it automatically.
export function ImportColumnMapping({ data, onImported, onCancel }: Props) {
  const t = useTranslations("importMapping");
  return (
    <Dialog open={!!data} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent hideHeaderRow title={t("title")} className="gap-4 pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[760px]">
        {data && <MappingBody data={data} onImported={onImported} onCancel={onCancel} />}
      </DialogContent>
    </Dialog>
  );
}

function MappingBody({ data, onImported, onCancel }: { data: NeedsMappingResponse; onImported: Props["onImported"]; onCancel: () => void }) {
  const t = useTranslations("importMapping");
  const locale = useLocale();
  const ids = useId();
  const [label, setLabel] = useState("");
  const [dateColumn, setDateColumn] = useState<number | null>(0);
  const [dateFormat, setDateFormat] = useState<ColumnMapping["dateFormat"]>("dmy");
  const [customDateFormat, setCustomDateFormat] = useState("");
  const [descriptionColumn, setDescriptionColumn] = useState<number | null>(null);
  const [amountColumn, setAmountColumn] = useState<number | null>(null);
  const [decimalSeparator, setDecimalSeparator] = useState<"," | ".">(",");
  const [directionColumn, setDirectionColumn] = useState<number | null>(null);
  const [directionExpenseValue, setDirectionExpenseValue] = useState("");
  const [accountColumn, setAccountColumn] = useState<number | null>(null);
  const [counterAccountColumn, setCounterAccountColumn] = useState<number | null>(null);
  const [balanceColumn, setBalanceColumn] = useState<number | null>(null);
  const [guessedFor, setGuessedFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form the first time we see this upload: either from a saved mapping the
  // server handed back for correction, or — failing that — by guessing the balance column
  // from the file's own headers ("Saldo", "Resulting balance", …). Adjusted during render
  // rather than in an effect so the selects never flash a wrong value first; the user
  // stays free to change anything, and a later re-render won't undo that.
  if (guessedFor !== data.rawId) {
    setGuessedFor(data.rawId);
    const p = data.prefill;
    if (p) {
      setDateColumn(p.dateColumn);
      setDateFormat(p.dateFormat);
      setCustomDateFormat(p.customDateFormat ?? "");
      setDescriptionColumn(p.descriptionColumn);
      setAmountColumn(p.amountColumn);
      setDecimalSeparator(p.decimalSeparator);
      setDirectionColumn(p.directionColumn);
      setDirectionExpenseValue(p.directionExpenseValue ?? "");
      setAccountColumn(p.accountColumn);
      setCounterAccountColumn(p.counterAccountColumn);
      setBalanceColumn(p.balanceColumn ?? null);
    } else {
      setBalanceColumn(guessBalanceColumn(data.headers));
    }
  }

  const columnName = (i: number) => data.headers[i] || t("column", { index: i + 1 });
  const columns: ClearSelectOption<number | null>[] = data.headers.map((_, i) => ({ value: i, label: columnName(i) }));
  const withNone: ClearSelectOption<number | null>[] = [{ value: null, label: t("none") }, ...columns];
  const directionOptions: ClearSelectOption<number | null>[] = [{ value: null, label: t("useAmountSign") }, ...columns];

  const DATE_FORMATS: ClearSelectOption<ColumnMapping["dateFormat"]>[] = [
    { value: "dmy", label: t("dateFormatDmy") },
    { value: "iso", label: t("dateFormatIso") },
    { value: "mdy", label: t("dateFormatMdy") },
    { value: "custom", label: t("dateFormatCustom") },
  ];

  const roles: [Role, number | null][] = [
    ["date", dateColumn],
    ["description", descriptionColumn],
    ["amount", amountColumn],
    ["direction", directionColumn],
    ["account", accountColumn],
    ["counterAccount", counterAccountColumn],
    ["balance", balanceColumn],
  ];
  const rolesOf = (col: number) => roles.filter(([, c]) => c === col).map(([r]) => r);

  const sampleRows = data.previewRows.slice(0, SAMPLE_ROWS);
  const longDate = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const datePreview = dateColumn === null
    ? []
    : sampleRows.map((row) => {
        const raw = row[dateColumn] ?? "";
        const iso = parseDate(raw, dateFormat, dateFormat === "custom" ? customDateFormat.trim() : null);
        return { raw, parsed: iso === null ? null : longDate.format(new Date(`${iso}T12:00:00`)) };
      });

  const amountPreview = amountColumn === null
    ? []
    : sampleRows.map((row) => {
        const raw = row[amountColumn] ?? "";
        const n = parseAmount(raw, decimalSeparator);
        return { raw, parsed: Number.isFinite(n) ? formatEur(n) : null };
      });

  // The server rejects a file with any unreadable date, so refusing to submit here just
  // saves the round trip — and makes the reason visible right next to the date preview.
  // A file with no data rows at all has nothing to judge; let the server say so.
  const datesOk = datePreview.every((s) => s.parsed !== null);

  const canSubmit =
    descriptionColumn !== null &&
    amountColumn !== null &&
    dateColumn !== null &&
    datesOk &&
    (dateFormat !== "custom" || customDateFormat.trim() !== "");

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const mapping: ColumnMapping = {
      delimiter: data.delimiter,
      dateColumn: dateColumn!,
      dateFormat,
      customDateFormat: dateFormat === "custom" ? customDateFormat.trim() : null,
      descriptionColumn: descriptionColumn!,
      amountColumn: amountColumn!,
      decimalSeparator,
      directionColumn,
      directionExpenseValue: directionColumn !== null ? directionExpenseValue : null,
      accountColumn,
      counterAccountColumn,
      balanceColumn,
    };

    try {
      const res = await fetch("/api/import/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawId: data.rawId, label: label.trim(), mapping }),
      });
      const json = await res.json();
      if (!res.ok) {
        // The server re-checks every row, not just the three previewed here, so it can
        // reject a file the preview looked fine on. Name the values that failed.
        setError(
          json.error === "invalidDates"
            ? t("importBlockedInvalidDates", {
                count: json.invalidCount,
                samples: (json.samples ?? []).join(", "),
              })
            : (json.error ?? t("genericError")),
        );
        setSubmitting(false);
        return;
      }
      void refreshLayoutAction();
      onImported(json);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  return (
    <>
      <ClearDialogHeader
        title={t("title")}
        subtitle={t("description")}
        icon={
          <IconTile tone="peach" className="size-12">
            <IconBuildingBank stroke={1.9} />
          </IconTile>
        }
        onClose={onCancel}
        closeLabel={t("close")}
      />

      {/* ── The file's first rows, each column tagged with what it's mapped to ── */}
      <div className="clear-scrollbar overflow-x-auto rounded-clear-tile border border-clear-line p-2">
        <table className="w-full border-collapse font-clear text-[13px] tabular-nums" aria-label={t("previewTable", { count: Math.min(PREVIEW_ROWS, data.previewRows.length) })}>
          <thead>
            <tr>
              {data.headers.map((_, i) => (
                <th
                  key={i}
                  scope="col"
                  className="bg-clear-tile px-3 py-2.5 text-left align-top font-normal whitespace-nowrap first:rounded-l-clear-icon last:rounded-r-clear-icon"
                >
                  <span className="flex flex-col items-start gap-1.5">
                    <span className="text-xs font-bold text-clear-muted">{columnName(i)}</span>
                    <span className="flex gap-1">
                      {rolesOf(i).map((r) => (
                        <ClearChip key={r} tone={ROLE_TONE[r]} className="h-6 px-2 text-xs font-bold">
                          {t(`roles.${r}`)}
                        </ClearChip>
                      ))}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.previewRows.slice(0, PREVIEW_ROWS).map((row, ri) => (
              <tr key={ri} className="border-b border-clear-ground last:border-b-0">
                {row.map((cell, ci) => (
                  <td key={ci} className={cn("max-w-[220px] truncate px-3 py-2.5 whitespace-nowrap", ci === descriptionColumn ? "font-semibold" : ci === amountColumn ? "font-bold" : "text-clear-ink-2")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── The mapping ── */}
      <div className="grid gap-x-3.5 gap-y-3 sm:grid-cols-2">
        <ClearField
          label={
            <>
              {t("bankName")} <span className="font-semibold text-clear-muted">{t("optional")}</span>
            </>
          }
          htmlFor={`${ids}-label`}
        >
          <ClearInput id={`${ids}-label`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("bankNamePlaceholder")} className="font-semibold" />
        </ClearField>

        <ColumnField label={t("dateColumn")} role="date" options={columns} value={dateColumn} onChange={setDateColumn} />

        <div className="flex flex-col gap-1.5">
          <span id={`${ids}-fmt`} className="text-[13px] font-bold text-clear-ink-2">{t("dateFormat")}</span>
          <ClearSelect value={dateFormat} options={DATE_FORMATS} onChange={setDateFormat} ariaLabelledBy={`${ids}-fmt`} />
        </div>

        <ColumnField label={t("descriptionColumn")} role="description" options={columns} value={descriptionColumn} onChange={setDescriptionColumn} />

        {dateFormat === "custom" && (
          <ClearField label={t("customDateFormat")} htmlFor={`${ids}-custom`} hint={t("customDateFormatHint")} className="sm:col-span-2">
            <ClearInput
              id={`${ids}-custom`}
              value={customDateFormat}
              onChange={(e) => setCustomDateFormat(e.target.value)}
              placeholder={t("customDateFormatPlaceholder")}
              className="font-semibold"
            />
          </ClearField>
        )}

        <ColumnField label={t("amountColumn")} role="amount" options={columns} value={amountColumn} onChange={setAmountColumn} />

        <div className="flex flex-col gap-1.5">
          <span id={`${ids}-dec`} className="text-[13px] font-bold text-clear-ink-2">{t("decimalSeparator")}</span>
          <ClearSelect
            value={decimalSeparator}
            options={[
              { value: ",", label: t("decimalComma") },
              { value: ".", label: t("decimalDot") },
            ]}
            onChange={setDecimalSeparator}
            ariaLabelledBy={`${ids}-dec`}
          />
        </div>

        <ColumnField
          label={t("directionColumn")}
          optional={t("optional")}
          role="direction"
          options={directionOptions}
          value={directionColumn}
          onChange={setDirectionColumn}
          hint={directionColumn === null ? t("directionColumnHint") : undefined}
        />

        {directionColumn !== null ? (
          <ClearField label={t("directionExpenseValue")} htmlFor={`${ids}-out`}>
            <ClearInput
              id={`${ids}-out`}
              value={directionExpenseValue}
              onChange={(e) => setDirectionExpenseValue(e.target.value)}
              placeholder={t("directionExpenseValuePlaceholder")}
              className="font-semibold"
            />
          </ClearField>
        ) : (
          <span aria-hidden className="hidden sm:block" />
        )}

        <ColumnField label={t("accountColumn")} optional={t("optional")} role="account" options={withNone} value={accountColumn} onChange={setAccountColumn} />
        <ColumnField
          label={t("counterAccountColumn")}
          optional={t("optional")}
          role="counterAccount"
          options={withNone}
          value={counterAccountColumn}
          onChange={setCounterAccountColumn}
        />
        <ColumnField
          label={t("balanceColumn")}
          optional={t("optional")}
          role="balance"
          options={withNone}
          value={balanceColumn}
          onChange={setBalanceColumn}
          hint={t("balanceColumnHint")}
          className="sm:col-span-2"
        />
      </div>

      {/* ── What the mapping makes of the first rows ── */}
      <div data-tip-anchor="importDatePreview" className="flex flex-col gap-1.5">
        <ParsePreview
          title={t("previewLabel")}
          icon={<IconCalendarEvent aria-hidden size={18} stroke={2} />}
          status={
            datesOk ? <ClearChip tone="mint" className="h-6 text-xs">{t("datesLookRight")}</ClearChip> : <ClearChip tone="peach" className="h-6 text-xs">{t("datesUnreadable")}</ClearChip>
          }
          samples={datePreview}
          invalidLabel={t("notADate")}
        />
        {!datesOk && datePreview.length > 0 && <p role="alert" className="m-0 text-[13px] font-semibold text-clear-negative">{t("datePreviewInvalid")}</p>}
      </div>

      <ParsePreview title={t("amountPreviewLabel")} icon={<IconCoinEuro aria-hidden size={18} stroke={2} />} samples={amountPreview} invalidLabel={t("notAnAmount")} />

      {error && <p role="alert" className="m-0 text-sm font-semibold text-clear-negative">{error}</p>}

      <ClearDialogFooterDock className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <span className="inline-flex items-center gap-2 text-[13px] text-clear-muted">
          <IconBookmark aria-hidden size={16} stroke={2} className="shrink-0" />
          {label.trim() ? t("savedAsProfile", { label: label.trim() }) : t("savedAsProfileUnnamed")}
        </span>
        <ClearDialogFooter>
          <button type="button" onClick={onCancel} disabled={submitting} className={clearButtonVariants({ variant: "secondary" })}>
            {t("cancel")}
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit || submitting} className={clearButtonVariants()}>
            <IconFileImport aria-hidden stroke={2} />
            {submitting ? t("importing") : t("import")}
          </button>
        </ClearDialogFooter>
      </ClearDialogFooterDock>

      {/* Points out the balance column while this dialog is the thing on screen. */}
      <ContextualTip id="importBalance" active />
      {/* Only one tip shows at a time, so this queues behind the balance tip. */}
      <AnchoredTip id="importDatePreview" anchor="importDatePreview" />
    </>
  );
}
