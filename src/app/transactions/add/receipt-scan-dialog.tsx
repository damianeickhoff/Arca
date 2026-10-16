"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconAlertTriangle, IconCamera, IconCheck } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ContextualTip } from "@/components/contextual-tip";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

export interface ScannedReceipt {
  name: string | null;
  amount: number | null;
  date: string | null;
  categoryId: number | null;
  categoryName: string | null;
}

// Scans a receipt photo via a locally-running Ollama vision model (see
// /api/receipts/scan) — never leaves the machine, no cloud API, no cost. Ollama not
// being installed/running is treated as a normal, expected error state, not a crash:
// the manual add-transaction flow works exactly the same with or without it.
export function ReceiptScanDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (fields: ScannedReceipt) => void;
}) {
  const t = useTranslations("transactions.scan");
  const ids = useId();
  const [status, setStatus] = useState<"idle" | "scanning" | "result" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScannedReceipt | null>(null);
  // Typed as text so a half-typed "12," survives; parsed when applied.
  const [amountText, setAmountText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStatus("idle");
    setError(null);
    setResult(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function scan(file: File) {
    setStatus("scanning");
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/receipts/scan", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("error"));
        setStatus("error");
        return;
      }
      setResult(data as ScannedReceipt);
      setAmountText(data.amount != null ? String(data.amount).replace(".", ",") : "");
      setStatus("result");
    } catch {
      setError(t("error"));
      setStatus("error");
    }
  }

  function apply() {
    if (!result) return;
    const amount = parseFloat(amountText.replace(",", "."));
    onApply({ ...result, amount: Number.isFinite(amount) && amount > 0 ? amount : null });
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Portals to <body> itself, so it isn't clipped by the sheet it explains. */}
      <ContextualTip id="receiptScan" active={open} />
      <DialogContent
        hideHeaderRow
        title={t("title")}
        className="gap-5 pt-7 font-clear text-clear-ink"
        footer={
          status === "result" ? (
            <ClearDialogFooter>
              <button type="button" onClick={() => inputRef.current?.click()} className={clearButtonVariants({ variant: "secondary" })}>
                {t("another")}
              </button>
              <button type="submit" form={`${ids}-form`} className={clearButtonVariants()}>
                {t("apply")}
              </button>
            </ClearDialogFooter>
          ) : undefined
        }
      >
        <ClearDialogHeader title={t("title")} subtitle={t("subtitle")} onClose={() => handleOpenChange(false)} closeLabel={t("close")} />

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) scan(file);
          }}
        />

        {status === "idle" && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-clear-tile border-2 border-dashed border-clear-line p-8 text-center transition-colors hover:bg-clear-tile"
          >
            <span aria-hidden className="inline-flex size-14 items-center justify-center rounded-full bg-clear-tile text-clear-ink">
              <IconCamera className="size-6" stroke={1.9} />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-bold">{t("pick")}</span>
              <span className="text-[13px] text-clear-muted">{t("local")}</span>
            </span>
          </button>
        )}

        {status === "scanning" && (
          <div role="status" className="flex flex-col items-center justify-center gap-3 rounded-clear-tile bg-clear-tile p-8 text-center">
            <IconCamera className="size-8 animate-pulse text-clear-ink" stroke={1.9} aria-hidden />
            <span className="text-[15px] font-bold">{t("reading")}</span>
            <span className="text-[13px] text-clear-muted">{t("slow")}</span>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col gap-3">
            <div role="alert" className="flex items-start gap-2.5 rounded-clear-tile bg-clear-negative-fill/15 p-4 text-sm font-semibold text-clear-negative">
              <IconAlertTriangle className="mt-0.5 size-[18px] shrink-0" stroke={2} aria-hidden />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => inputRef.current?.click()} className={cn(clearButtonVariants({ variant: "secondary" }), "w-full")}>
              {t("retry")}
            </button>
          </div>
        )}

        {status === "result" && result && (
          <form
            id={`${ids}-form`}
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
            className="flex flex-col gap-4"
          >
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-clear-positive-fill/15 px-3 py-1 text-[13px] font-bold text-clear-positive">
              <IconCheck className="size-4" stroke={2.4} aria-hidden />
              {t("review")}
            </span>
            <ClearField label={t("name")} htmlFor={`${ids}-name`}>
              <ClearInput
                id={`${ids}-name`}
                value={result.name ?? ""}
                onChange={(e) => setResult({ ...result, name: e.target.value })}
                placeholder={t("namePlaceholder")}
              />
            </ClearField>
            <div className="grid grid-cols-2 gap-3">
              <ClearField label={t("amount")} htmlFor={`${ids}-amount`}>
                <ClearInput
                  id={`${ids}-amount`}
                  inputMode="decimal"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.,]/g, ""))}
                  placeholder="0,00"
                  className="font-extrabold tabular-nums"
                />
              </ClearField>
              <ClearField label={t("date")} htmlFor={`${ids}-date`}>
                <ClearInput id={`${ids}-date`} type="date" value={result.date ?? ""} onChange={(e) => setResult({ ...result, date: e.target.value || null })} />
              </ClearField>
            </div>
            {(result.categoryName || result.amount != null) && (
              <div className="flex flex-col gap-1 text-[13px] text-clear-muted">
                {result.categoryName && (
                  <span>
                    {result.categoryId ? t("matched") : t("suggested")} <b className="font-bold text-clear-ink">{result.categoryName}</b>
                  </span>
                )}
                {result.amount != null && <span><MoneyText>{t("detected", { amount: formatEur(result.amount) })}</MoneyText></span>}
              </div>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
