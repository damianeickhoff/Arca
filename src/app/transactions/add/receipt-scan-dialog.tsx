"use client";

import { useRef, useState } from "react";
import { IconCamera, IconAlertCircleFilled, IconCheck } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatEur } from "@/lib/format";

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
  const [status, setStatus] = useState<"idle" | "scanning" | "result" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScannedReceipt | null>(null);
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
        setError(data.error ?? "Something went wrong reading that receipt.");
        setStatus("error");
        return;
      }
      setResult(data as ScannedReceipt);
      setStatus("result");
    } catch {
      setError("Something went wrong reading that receipt.");
      setStatus("error");
    }
  }

  function apply() {
    if (!result) return;
    onApply(result);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan receipt</DialogTitle>
        </DialogHeader>

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
            className="rounded-2xl border-2 border-dashed border-foreground/15 hover:border-foreground/30 hover:bg-foreground/3 transition-colors p-8 flex flex-col items-center justify-center gap-3 text-center"
          >
            <IconCamera className="size-9 text-muted-foreground" />
            <div>
              <p className="font-medium">Take or choose a photo</p>
              <p className="text-sm text-muted-foreground">Read locally by Ollama — nothing leaves this device</p>
            </div>
          </button>
        )}

        {status === "scanning" && (
          <div className="rounded-2xl bg-foreground/3 p-8 flex flex-col items-center justify-center gap-3 text-center">
            <IconCamera className="size-9 text-foreground animate-pulse" />
            <p className="font-medium">Reading receipt…</p>
            <p className="text-xs text-muted-foreground">This can take a moment on a local model.</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-destructive/10 p-6 flex flex-col items-center justify-center gap-2 text-center">
              <IconAlertCircleFilled className="size-8 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full h-11 rounded-full bg-foreground/8 text-sm font-medium active:scale-[0.98] transition-transform"
            >
              Try again
            </button>
          </div>
        )}

        {status === "result" && result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 mb-1">
              <IconCheck className="size-4" />
              Review before applying — nothing&apos;s saved yet.
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60">Name</label>
              <Input
                value={result.name ?? ""}
                onChange={(e) => setResult({ ...result, name: e.target.value })}
                placeholder="Merchant name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground/60">Amount</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={result.amount != null ? String(result.amount) : ""}
                  onChange={(e) => setResult({ ...result, amount: parseFloat(e.target.value.replace(",", ".")) || null })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/60">Date</label>
                <Input
                  type="date"
                  value={result.date ?? ""}
                  onChange={(e) => setResult({ ...result, date: e.target.value || null })}
                />
              </div>
            </div>
            {result.categoryName && (
              <p className="text-xs text-muted-foreground">
                {result.categoryId ? "Matched category: " : "Suggested category (no match found): "}
                <span className="font-medium text-foreground">{result.categoryName}</span>
              </p>
            )}
            {result.amount != null && (
              <p className="text-xs text-muted-foreground">Detected total: {formatEur(result.amount)}</p>
            )}
            <button
              type="button"
              onClick={apply}
              className="w-full h-12 rounded-full bg-foreground text-background text-base font-semibold active:scale-[0.98] transition-transform"
            >
              Use these details
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
