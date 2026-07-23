"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconXFilled as X,
  IconCheckFilled as Check,
  IconChevronDownFilled as ChevronDown,
} from "@tabler/icons-react";
import { formatEur, currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  categoryId: number;
  categoryName: string;
  month: string; // YYYY-MM
  defaultAmount: number; // from budget targets
  overrideAmount: number | null;
  icon: React.ReactNode;
  subtitle: React.ReactNode;
  // When true, this row is nested inside a parent category's own card (see the
  // Prognose "Categories" section) — drops its own rounded/background styling so it
  // reads as a row within that card instead of a separate floating card.
  nested?: boolean;
  // Present only on a parent category row that has subcategories — renders a chevron
  // that toggles their visibility, independent of the row's own tap-to-override action.
  collapseToggle?: { open: boolean; onToggle: () => void };
}

// Tapping the row opens the override popover — no separate dots trigger.
export function VariablePrognoseOverrideBtn({ categoryId, categoryName, month, defaultAmount, overrideAmount, icon, subtitle, nested = false, collapseToggle }: Props) {
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
    await fetch("/api/prognose/variable-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, month, overrideAmount: num }),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function clearOverride() {
    setSaving(true);
    await fetch("/api/prognose/variable-overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, month }),
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
        title={`Override budget voor ${categoryName} deze maand`}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left active:bg-foreground/[0.03] transition-colors cursor-pointer",
          nested ? "rounded-xl" : "rounded-2xl bg-card",
        )}
      >
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{categoryName}</p>
          <div className="text-xs text-foreground/60 mt-0.5 truncate">{subtitle}</div>
        </div>
        {hasOverride && (
          <div className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs px-2 py-0.5 font-medium shrink-0">
            <span className="tabular-nums">{formatEur(overrideAmount!)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); clearOverride(); }}
              disabled={saving}
              className="hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
              title="Delete override"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        {collapseToggle && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); collapseToggle.onToggle(); }}
            aria-label={collapseToggle.open ? "Collapse subcategories" : "Expand subcategories"}
            className="shrink-0 p-1 -mr-1 rounded-full hover:bg-foreground/10 transition-colors"
          >
            <ChevronDown className={cn("size-4 text-foreground/50 transition-transform", collapseToggle.open && "rotate-180")} />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="relative bg-white/5 rounded-xl backdrop-blur-xl p-3 w-52"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 size-6 rounded-full flex items-center justify-center text-foreground/50 hover:bg-foreground/10 hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
          <p className="text-xs font-medium text-foreground truncate">{categoryName}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Override amount for {month}
          </p>
          <p className="text-[10px] text-muted-foreground mb-3">
            (budget: <span className="tabular-nums">{formatEur(defaultAmount)}</span>/mnd)
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
                className="w-full rounded-lg pl-5 py-1.5 text-sm bg-white/12 outline-none focus:outline-none focus:ring-0 border border-transparent focus:border-white/20"
              />
            </div>
              <button
                onClick={save}
                disabled={saving}
                className="size-9 shrink-0 rounded-full bg-background text-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Check className="size-4" />
              </button>
          </div>
        </div>
      )}
    </div>
  );
}
