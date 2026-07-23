"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SUPPORTED_CURRENCIES, type SupportedCurrencyCode, getCurrentCurrency, setCurrentCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OptionList } from "@/components/option-list";

// Shared state + save logic behind both CurrencySegmented (pill) and CurrencyList
// (settings sub-page). Reads its initial value straight from the format.ts module (set
// app-wide by CurrencySync before any descendant renders — see
// src/components/currency-sync.tsx) rather than via a prop, so either component can be
// dropped into both the desktop settings page and the mobile settings dialog without
// threading the current value through each call site.
function useCurrencySwitcher() {
  const router = useRouter();
  const [active, setActive] = useState<SupportedCurrencyCode>(() => getCurrentCurrency());
  const [pending, setPending] = useState(false);

  async function change(next: SupportedCurrencyCode) {
    if (next === active || pending) return;
    const previous = active;
    setPending(true);
    setActive(next);
    // Optimistic: every formatEur()/currencySymbol() call elsewhere in the app reflects the
    // new symbol immediately, before the settings save round-trip finishes.
    setCurrentCurrency(next);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "default_currency", value: next }),
    });
    setPending(false);
    if (!res.ok) {
      setActive(previous);
      setCurrentCurrency(previous);
      return;
    }
    router.refresh();
  }

  return { active, pending, change };
}

// List-style currency picker for the "Currency" settings sub-page.
export function CurrencyList() {
  const { active, pending, change } = useCurrencySwitcher();
  return (
    <OptionList
      options={SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
      value={active}
      onSelect={change}
      disabled={pending}
    />
  );
}

// EUR / USD / GBP segmented control, styled like LanguageSegmented (src/components/language-switcher.tsx).
export function CurrencySegmented() {
  const { active, pending, change } = useCurrencySwitcher();

  return (
    <span
      role="radiogroup"
      aria-label="Currency"
      className="inline-flex shrink-0 items-center rounded-full bg-foreground/15 p-0.5"
    >
      {SUPPORTED_CURRENCIES.map((c) => (
        <button
          key={c.code}
          type="button"
          role="radio"
          aria-checked={active === c.code}
          aria-label={c.label}
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            change(c.code);
          }}
          className={cn(
            "flex h-7 min-w-9 items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default",
            active === c.code ? "bg-card text-foreground shadow" : "text-foreground/40 hover:text-foreground/70",
          )}
        >
          {c.code}
        </button>
      ))}
    </span>
  );
}
