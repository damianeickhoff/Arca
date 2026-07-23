"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconPencilFilled as Pencil,
  IconCheckFilled as Check,
  IconXFilled as X
} from "@tabler/icons-react";
import { currencySymbol } from "@/lib/format";

export function EditExpectedButton({
  transactionId,
  current,
}: {
  transactionId: number;
  current: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current.toFixed(2));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setValue(current.toFixed(2));
    setEditing(true);
  }

  async function save() {
    const parsed = parseFloat(value.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: transactionId, expectedReimbursement: parsed }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-xs text-muted-foreground">{currencySymbol()}</span>
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          min={0.01}
          step={0.01}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-20 border rounded px-1.5 py-0.5 text-xs bg-background"
        />
        <button
          onClick={save}
          disabled={saving}
          className="p-0.5 rounded text-green-600 hover:bg-green-500/10 disabled:opacity-40"
        >
          <Check className="size-3" />
        </button>
        <button
          onClick={() => setEditing(false)}
          className="p-0.5 rounded text-muted-foreground hover:bg-muted"
        >
          <X className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={startEditing}
      title="Adjust expected amount"
      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      <Pencil className="size-3" />
    </button>
  );
}
