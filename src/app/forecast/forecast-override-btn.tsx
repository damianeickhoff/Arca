"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  IconXFilled as X,
  IconCheckFilled as Check
} from "@tabler/icons-react";
import { formatEur, currencySymbol } from "@/lib/format";

interface Props {
  itemId: number;
  itemName: string;
  month: string; // YYYY-MM
  defaultAmount: number; // monthly-normalised default
  overrideAmount: number | null;
  icon: React.ReactNode;
  subtitle: React.ReactNode;
}

// Tapping the whole card opens the override popover — no separate dots trigger.
// The card itself is a div (not a <button>) so the amber "override active" pill's
// own clear (×) button can nest inside it without an invalid button-in-button.
export function PrognoseOverrideBtn({ itemId, itemName, month, defaultAmount, overrideAmount, icon, subtitle }: Props) {
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
    const popoverHeight = 130; // approximate height

    if (spaceBelow < popoverHeight) {
      // Open upward
      setPopoverStyle({
        position: "fixed",
        right: window.innerWidth - rect.right,
        bottom: window.innerHeight - rect.top + 6,
        zIndex: 9999,
      });
    } else {
      // Open downward
      setPopoverStyle({
        position: "fixed",
        right: window.innerWidth - rect.right,
        top: rect.bottom + 6,
        zIndex: 9999,
      });
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
    await fetch("/api/prognose/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringItemId: itemId, month, amount: num }),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function clearOverride() {
    setSaving(true);
    await fetch("/api/prognose/overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringItemId: itemId, month }),
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
        title={t("cardTitle", { name: itemName })}
        className="w-full flex items-center gap-3 rounded-row bg-surface px-4 py-3 text-left hover:bg-surface-2 transition-colors cursor-pointer"
      >
        {icon}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{itemName}</p>
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
          <p className="truncate text-xs font-semibold text-ink">{itemName}</p>
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
