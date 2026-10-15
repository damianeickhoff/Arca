"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("insights.forecast.override");
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
        title={t("cardTitle", { name: categoryName })}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors cursor-pointer",
          nested ? "rounded-row" : "rounded-row bg-surface",
        )}
      >
        {icon}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{categoryName}</p>
          <div className="mt-0.5 truncate text-xs text-ink-3">{subtitle}</div>
        </div>
        {hasOverride && (
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
            <span className="tabular-nums">{formatEur(overrideAmount!)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); clearOverride(); }}
              disabled={saving}
              className="transition-opacity hover:opacity-70"
              title={t("clear")}
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        {collapseToggle && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); collapseToggle.onToggle(); }}
            aria-label={collapseToggle.open ? t("collapse") : t("expand")}
            className="-mr-1 shrink-0 rounded-full p-1 transition-colors hover:bg-surface-2"
          >
            <ChevronDown className={cn("size-4 text-ink-3 transition-transform", collapseToggle.open && "rotate-180")} />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="relative w-52 rounded-tile border border-line bg-surface p-3 shadow-float"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={t("close")}
          >
            <X className="size-3.5" />
          </button>
          <p className="truncate text-xs font-semibold text-ink">{categoryName}</p>
          <p className="mt-1 text-[10px] text-ink-3">{t("forMonth", { month })}</p>
          <p className="mb-3 text-[10px] text-ink-3">{t("defaultAmount", { amount: formatEur(defaultAmount) })}</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-3">{currencySymbol()}</span>
              <input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded-tile border border-transparent bg-surface-2 py-1.5 pl-5 text-sm text-ink outline-none focus:border-line"
              />
            </div>
              <button
                onClick={save}
                disabled={saving}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check className="size-4" />
              </button>
          </div>
        </div>
      )}
    </div>
  );
}
