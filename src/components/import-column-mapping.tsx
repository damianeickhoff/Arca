"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ColumnMapping } from "@/lib/import-profiles";
import type { Bank } from "@/db/schema";

export interface NeedsMappingResponse {
  needsMapping: true;
  rawId: string;
  delimiter: string;
  headers: string[];
  previewRows: string[][];
}

export interface ManualImportResult {
  imported: number;
  skipped: number;
  autoCategorised: number;
  total: number;
  newAccounts: Bank[];
}

interface Props {
  data: NeedsMappingResponse | null;
  onImported: (result: ManualImportResult) => void;
  onCancel: () => void;
}

const DATE_FORMATS: { value: ColumnMapping["dateFormat"]; label: string }[] = [
  { value: "dmy", label: "DD-MM-YYYY" },
  { value: "iso", label: "YYYY-MM-DD" },
  { value: "mdy", label: "MM-DD-YYYY" },
];

function ColumnSelect({ label, headers, value, onChange, allowNone }: {
  label: string;
  headers: string[];
  value: number | null;
  onChange: (v: number | null) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground/60">{label}</label>
      <select
        value={value === null ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
        className="w-full rounded-lg px-3 py-2 text-sm bg-foreground/5"
      >
        {allowNone && <option value="">None</option>}
        {headers.map((h, i) => (
          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
        ))}
      </select>
    </div>
  );
}

// Shown when an uploaded CSV doesn't match any built-in bank format (ING, Rabobank,
// ABN AMRO, bunq, Revolut, KNAB). Lets the user tell us which column is which; the
// mapping is saved so future imports from this same bank apply it automatically.
export function ImportColumnMapping({ data, onImported, onCancel }: Props) {
  const [label, setLabel] = useState("");
  const [dateColumn, setDateColumn] = useState<number | null>(0);
  const [dateFormat, setDateFormat] = useState<ColumnMapping["dateFormat"]>("dmy");
  const [descriptionColumn, setDescriptionColumn] = useState<number | null>(null);
  const [amountColumn, setAmountColumn] = useState<number | null>(null);
  const [decimalSeparator, setDecimalSeparator] = useState<"," | ".">(",");
  const [directionColumn, setDirectionColumn] = useState<number | null>(null);
  const [directionExpenseValue, setDirectionExpenseValue] = useState("");
  const [accountColumn, setAccountColumn] = useState<number | null>(null);
  const [counterAccountColumn, setCounterAccountColumn] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;

  const canSubmit = descriptionColumn !== null && amountColumn !== null && dateColumn !== null;

  async function submit() {
    if (!data || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    const mapping: ColumnMapping = {
      delimiter: data.delimiter,
      dateColumn: dateColumn!,
      dateFormat,
      descriptionColumn: descriptionColumn!,
      amountColumn: amountColumn!,
      decimalSeparator,
      directionColumn,
      directionExpenseValue: directionColumn !== null ? directionExpenseValue : null,
      accountColumn,
      counterAccountColumn,
    };

    try {
      const res = await fetch("/api/import/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawId: data.rawId, label: label.trim(), mapping }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
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
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
        <DialogHeader>
          <DialogTitle>Unrecognized bank format</DialogTitle>
          <DialogDescription>
            We couldn&apos;t automatically detect this bank. Tell us which column is which — we&apos;ll remember it for next time.
          </DialogDescription>
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
            <label className="text-xs font-medium text-foreground/60">Bank name (optional)</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My Bank" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ColumnSelect label="Date column" headers={data.headers} value={dateColumn} onChange={setDateColumn} />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/60">Date format</label>
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as ColumnMapping["dateFormat"])}
                className="w-full rounded-lg px-3 py-2 text-sm bg-foreground/5"
              >
                {DATE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <ColumnSelect label="Description column" headers={data.headers} value={descriptionColumn} onChange={setDescriptionColumn} />

          <div className="grid grid-cols-2 gap-3">
            <ColumnSelect label="Amount column" headers={data.headers} value={amountColumn} onChange={setAmountColumn} />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/60">Decimal separator</label>
              <select
                value={decimalSeparator}
                onChange={(e) => setDecimalSeparator(e.target.value as "," | ".")}
                className="w-full rounded-lg px-3 py-2 text-sm bg-foreground/5"
              >
                <option value=",">Comma (1.234,56)</option>
                <option value=".">Dot (1,234.56)</option>
              </select>
            </div>
          </div>

          <div className="border-t border-foreground/10 pt-3 space-y-3">
            <p className="text-[10px] text-foreground/50 uppercase tracking-wide">
              Direction (optional — leave as &quot;Use amount sign&quot; if negative amounts already mean money out)
            </p>
            <ColumnSelect
              label="Direction column"
              headers={["Use amount sign", ...data.headers]}
              value={directionColumn === null ? 0 : directionColumn + 1}
              onChange={(v) => setDirectionColumn(v === null || v === 0 ? null : v - 1)}
            />
            {directionColumn !== null && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/60">Value in that column meaning &quot;money out&quot;</label>
                <Input value={directionExpenseValue} onChange={(e) => setDirectionExpenseValue(e.target.value)} placeholder="e.g. Debit" />
              </div>
            )}
          </div>

          <div className="border-t border-foreground/10 pt-3 grid grid-cols-2 gap-3">
            <ColumnSelect label="Account column (optional)" headers={data.headers} value={accountColumn} onChange={setAccountColumn} allowNone />
            <ColumnSelect label="Counter-account (optional)" headers={data.headers} value={counterAccountColumn} onChange={setCounterAccountColumn} allowNone />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submit} disabled={!canSubmit || submitting}>
              {submitting ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
