"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconXFilled as X,
  IconCheckFilled as Check
} from "@tabler/icons-react";
import { formatEur, currencySymbol } from "@/lib/format";

interface Props {
  goalId: number;
  goalName: string;
  month: string; // YYYY-MM
  defaultAmount: number;
  overrideAmount: number | null;
  icon: React.ReactNode;
  subtitle: React.ReactNode;
}

// Tapping the whole card opens the override popover — no separate dots trigger.
export function SavingsPrognoseOverrideBtn({ goalId, goalName, month, defaultAmount, overrideAmount, icon, subtitle }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(overrideAmount ?? defaultAmount));
  const [saving, setSaving] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function openPopover() {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const popoverHeight = 130;

    if (spaceBelow < popoverHeight) {
      setPopoverStyle({ position: "fixed", right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.top + 6, zIndex: 9999 });
    } else {
      setPopoverStyle({ position: "fixed", right: window.innerWidth - rect.right, top: rect.bottom + 6, zIndex: 9999 });
    }
    setValue(String(overrideAmount ?? defaultAmount));
    setOpen(true);
    setTimeout(() => inputRef.current?.select(), 50);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        cardRef.current && !cardRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function save() {
    const num = parseFloat(value.replace(",", "."));
    if (isNaN(num) || num < 0) return;
    setSaving(true);
    await fetch("/api/savings-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId, month, overrideAmount: num }),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function clearOverride() {
    setSaving(true);
    await fetch("/api/savings-overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId, month }),
    });
    setSaving(false);
    router.refresh();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") setOpen(false);
  }

  const hasOverride = overrideAmount !== null;

  return (
    <div className="relative">
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        onClick={openPopover}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPopover(); } }}
        title={`Override bijdrage voor ${goalName} deze maand`}
        className="w-full flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left active:bg-foreground/[0.03] transition-colors cursor-pointer"
      >
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{goalName}</p>
          <div className="text-xs text-foreground/60 mt-0.5 truncate">{subtitle}</div>
        </div>
        {hasOverride && (
          <div className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs px-2 py-0.5 font-medium shrink-0">
            <span className="tabular-nums">{formatEur(overrideAmount!)}</span>
            <button onClick={(e) => { e.stopPropagation(); clearOverride(); }} disabled={saving} className="hover:text-amber-900 dark:hover:text-amber-200 transition-colors" title="Delete override">
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>

      {open && (
        <div ref={popoverRef} style={popoverStyle} className="bg-background border rounded-xl shadow-lg p-3 w-52 space-y-2">
          <p className="text-xs font-medium text-foreground truncate">{goalName}</p>
          <p className="text-[10px] text-muted-foreground">
            Override voor {month} (standaard: <span className="tabular-nums">{formatEur(defaultAmount)}</span>/mnd)
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currencySymbol()}</span>
              <input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full border rounded-lg pl-5 pr-2 py-1.5 text-sm bg-background"
              />
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Check className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
