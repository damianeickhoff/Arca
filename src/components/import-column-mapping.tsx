"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContextualTip } from "@/components/contextual-tip";
import { AnchoredTip } from "@/components/anchored-tip";
import { guessBalanceColumn } from "@/lib/import-columns";
import { parseAmount, parseDate, type ColumnMapping } from "@/lib/import-parse";
import { formatDate, formatEur } from "@/lib/format";
import type { Bank } from "@/db/schema";

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

function ColumnSelect({ label, headers, value, onChange, allowNone, noneLabel }: {
  label: string;
  headers: string[];
  value: number | null;
  onChange: (v: number | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground/60">{label}</label>
      <Select
        modal={false}
        value={value}
        onValueChange={(v) => onChange(v === null ? null : Number(v))}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={null}>{noneLabel}</SelectItem>}
          {headers.map((h, i) => (
            <SelectItem key={i} value={i}>{h || `Column ${i + 1}`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Shows what the current mapping actually makes of the file's first rows:
 * "21-06-2024 → 21 Jun 2024", or the raw cell flagged as unreadable.
 *
 * This is the whole point of the preview — picking the wrong column is invisible until
 * you see the result, and an unreadable date used to be written to the database verbatim.
 */
function ParsePreview({ samples, invalidLabel }: { samples: { raw: string; parsed: string | null }[]; invalidLabel: string }) {
  if (samples.length === 0) return null;
  return (
    <div className="rounded-lg bg-foreground/3 px-3 py-2 space-y-1">
      {samples.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="text-foreground/50 truncate max-w-[45%]">{s.raw || "—"}</span>
          <span className="text-foreground/30">→</span>
          {s.parsed === null ? (
            <span className="text-destructive font-medium">✗ {invalidLabel}</span>
          ) : (
            <span className="text-foreground font-medium truncate">{s.parsed}</span>
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
  if (data && guessedFor !== data.rawId) {
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

  const DATE_FORMATS: { value: ColumnMapping["dateFormat"]; label: string }[] = [
    { value: "dmy", label: t("dateFormatDmy") },
    { value: "iso", label: t("dateFormatIso") },
    { value: "mdy", label: t("dateFormatMdy") },
    { value: "custom", label: t("dateFormatCustom") },
  ];

  if (!data) return null;

  const sampleRows = data.previewRows.slice(0, 3);

  const datePreview = dateColumn === null
    ? []
    : sampleRows.map((row) => {
        const raw = row[dateColumn] ?? "";
        const iso = parseDate(raw, dateFormat, dateFormat === "custom" ? customDateFormat.trim() : null);
        return { raw, parsed: iso === null ? null : formatDate(iso) };
      });

  const amountPreview = amountColumn === null
    ? []
    : sampleRows.map((row) => {
        const raw = row[amountColumn] ?? "";
        const n = parseAmount(raw, decimalSeparator);
        return { raw, parsed: Number.isFinite(n) ? formatEur(n) : null };
      });

  // The server rejects a file with any unreadable date, so refusing to submit here just
  // saves the round trip — and makes the reason visible right next to the offending select.
  // A file with no data rows at all has nothing to judge; let the server say so.
  const datesOk = datePreview.every((s) => s.parsed !== null);

  const canSubmit =
    descriptionColumn !== null &&
    amountColumn !== null &&
    dateColumn !== null &&
    datesOk &&
    (dateFormat !== "custom" || customDateFormat.trim() !== "");

  async function submit() {
    if (!data || !canSubmit) return;
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
            : (json.error ?? "Something went wrong"),
        );
        setSubmitting(false);
        return;
      }
      onImported(json);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!data} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl bg-foreground/3 p-3 overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  {data.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-medium text-foreground/60 whitespace-nowrap">{h || `Col ${i + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.previewRows.slice(0, 3).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 whitespace-nowrap text-foreground/80">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/60">{t("bankName")}</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("bankNamePlaceholder")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ColumnSelect label={t("dateColumn")} headers={data.headers} value={dateColumn} onChange={setDateColumn} />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/60">{t("dateFormat")}</label>
              <Select modal={false} value={dateFormat} onValueChange={(v) => setDateFormat(v as ColumnMapping["dateFormat"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {dateFormat === "custom" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/60">{t("customDateFormat")}</label>
              <Input
                value={customDateFormat}
                onChange={(e) => setCustomDateFormat(e.target.value)}
                placeholder={t("customDateFormatPlaceholder")}
              />
              <p className="text-xs text-foreground/50">{t("customDateFormatHint")}</p>
            </div>
          )}

          <div className="space-y-1.5" data-tip-anchor="importDatePreview">
            <label className="text-xs font-medium text-foreground/60">{t("previewLabel")}</label>
            <ParsePreview samples={datePreview} invalidLabel={t("notADate")} />
            {!datesOk && datePreview.length > 0 && (
              <p className="text-xs text-destructive">{t("datePreviewInvalid")}</p>
            )}
          </div>

          <ColumnSelect label={t("descriptionColumn")} headers={data.headers} value={descriptionColumn} onChange={setDescriptionColumn} />

          <div className="grid grid-cols-2 gap-3">
            <ColumnSelect label={t("amountColumn")} headers={data.headers} value={amountColumn} onChange={setAmountColumn} />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/60">{t("decimalSeparator")}</label>
              <Select modal={false} value={decimalSeparator} onValueChange={(v) => setDecimalSeparator(v as "," | ".")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">{t("decimalComma")}</SelectItem>
                  <SelectItem value=".">{t("decimalDot")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ParsePreview samples={amountPreview} invalidLabel={t("notAnAmount")} />

          <div className="border-t border-foreground/10 pt-3 space-y-3">
            <p className="text-[10px] text-foreground/50 uppercase tracking-wide">{t("directionHint")}</p>
            <ColumnSelect
              label={t("directionColumn")}
              headers={[t("useAmountSign"), ...data.headers]}
              value={directionColumn === null ? 0 : directionColumn + 1}
              onChange={(v) => setDirectionColumn(v === null || v === 0 ? null : v - 1)}
            />
            {directionColumn !== null && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/60">{t("directionExpenseValue")}</label>
                <Input value={directionExpenseValue} onChange={(e) => setDirectionExpenseValue(e.target.value)} placeholder={t("directionExpenseValuePlaceholder")} />
              </div>
            )}
          </div>

          <div className="border-t border-foreground/10 pt-3 grid grid-cols-2 gap-3">
            <ColumnSelect label={t("accountColumn")} headers={data.headers} value={accountColumn} onChange={setAccountColumn} allowNone noneLabel={t("none")} />
            <ColumnSelect label={t("counterAccountColumn")} headers={data.headers} value={counterAccountColumn} onChange={setCounterAccountColumn} allowNone noneLabel={t("none")} />
          </div>

          <div className="border-t border-foreground/10 pt-3 space-y-1.5">
            <ColumnSelect
              label={t("balanceColumn")}
              headers={data.headers}
              value={balanceColumn}
              onChange={setBalanceColumn}
              allowNone
              noneLabel={t("none")}
            />
            <p className="text-xs text-foreground/50">{t("balanceColumnHint")}</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button className="flex-1" onClick={submit} disabled={!canSubmit || submitting}>
              {submitting ? t("importing") : t("import")}
            </Button>
          </div>
        </div>

        {/* Points out the new balance column while this dialog is the thing on screen. */}
        <ContextualTip id="importBalance" active={!!data} />
        {/* Only one tip shows at a time, so this queues behind the balance tip. */}
        <AnchoredTip id="importDatePreview" anchor="importDatePreview" />
      </DialogContent>
    </Dialog>
  );
}
