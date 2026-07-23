"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  IconUpload as Upload,
  IconCircleCheckFilled as CheckCircle2,
  IconAlertCircleFilled as AlertCircle,
  IconFileTextFilled as FileText
} from "@tabler/icons-react";
import type { Bank } from "@/db/schema";
import { NewAccountsPrompt } from "@/components/new-accounts-prompt";
import { ImportColumnMapping, type NeedsMappingResponse } from "@/components/import-column-mapping";

export function ImportCsvCard() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ imported: number; skipped: number; autoCategorised: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [newAccounts, setNewAccounts] = useState<Bank[]>([]);
  const [mapping, setMapping] = useState<NeedsMappingResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setStatus("loading");
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setStatus("error");
      } else if (data.needsMapping) {
        setStatus("idle");
        setMapping(data);
      } else {
        setResult(data);
        setStatus("success");
        if (data.newAccounts?.length > 0) setNewAccounts(data.newAccounts);
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-card p-5">
        <h2 className="font-semibold text-base mb-4">Upload export file</h2>

        <div
          className={`rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors border-2 border-dashed
            ${dragOver ? "border-muted bg-muted/5" : "border-foreground/15 hover:border-muted/50 hover:bg-foreground/3"}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFileChange} />

          {status === "idle" && (
            <>
              <Upload className="size-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Drag your file here</p>
                <p className="text-sm text-muted-foreground">or click to choose a file</p>
              </div>
            </>
          )}

          {status === "loading" && (
            <>
              <FileText className="size-10 text-foreground animate-pulse" />
              <p className="font-medium">Importing...</p>
            </>
          )}

          {status === "success" && result && (
            <>
              <CheckCircle2 className="size-10 text-green-600" />
              <div className="text-center">
                <p className="font-semibold text-green-600">{result.imported} transactions imported</p>
                {result.autoCategorised > 0 && (
                  <p className="text-sm text-muted-foreground">{result.autoCategorised} automatically categorised</p>
                )}
                {result.skipped > 0 && (
                  <p className="text-sm text-muted-foreground">{result.skipped} skipped (already present)</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{result.total} rows in file</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setStatus("idle"); setResult(null); }}
                className="text-sm text-white font-medium hover:underline cursor-pointer bg-foreground rounded-md p-3"
              >
                Import another file
              </button>
            </>
          )}

          {status === "error" && (
            <>
              <AlertCircle className="size-10 text-destructive" />
              <div className="text-center">
                <p className="font-semibold text-destructive">Import failed</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setStatus("idle"); setError(null); }}
                className="text-sm text-foreground hover:underline cursor-pointer"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-card p-5">
        <h2 className="font-semibold text-base mb-3">Which banks are supported?</h2>
        <div className="text-sm text-foreground space-y-2">
          <p>
            ING, Rabobank, ABN AMRO, bunq, Revolut, and KNAB exports are recognized automatically —
            just download your bank&apos;s CSV/transaction export and upload it here.
          </p>
          <p className="text-sm text-muted-foreground">
            Any other bank still works: we&apos;ll ask you to point out the date, amount, and
            description columns once, then remember it for next time.
          </p>
          <p className="pt-2 text-sm text-muted-foreground">
            Duplicate transactions are automatically skipped based on date, amount, and description.
          </p>
        </div>
      </div>

      <NewAccountsPrompt
        accounts={newAccounts}
        onDone={() => { setNewAccounts([]); router.refresh(); }}
      />

      <ImportColumnMapping
        data={mapping}
        onCancel={() => setMapping(null)}
        onImported={(data) => {
          setMapping(null);
          setResult(data);
          setStatus("success");
          if (data.newAccounts.length > 0) setNewAccounts(data.newAccounts);
        }}
      />
    </div>
  );
}
