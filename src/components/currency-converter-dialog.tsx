"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NumericKeypad } from "@/components/numeric-keypad";
import { CURRENCIES, currencyInfo, flagEmoji } from "@/lib/currencies";
import { pressKey } from "@/lib/amount-expression";
import { cn } from "@/lib/utils";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { IconPlus, IconX, IconSearch, IconChevronLeft } from "@tabler/icons-react";

const DEFAULT_CODES = ["EUR", "USD"];

interface RatesResponse {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
}

const digitKeyClass =
  "flex items-center justify-center rounded-2xl h-13 text-2xl font-medium text-foreground bg-foreground/5 active:bg-foreground/10 transition-colors select-none";

const springIn = "cubic-bezier(0.16, 1, 0.3, 1)";
const springOut = "cubic-bezier(0.32, 0.72, 0, 1)";

// Multi-currency converter: tap a row to make it the "driver" — its amount is what
// you type on the keypad, every other row shows the live-converted result. Rates
// come from /api/exchange-rates (ECB-backed, refreshed hourly server-side).
//
// Renders as a full-screen createPortal overlay (fade + slight slide-in), matching
// the Budget/Reports portals opened from the same dashboard header — not a
// Dialog/Drawer bottom sheet, which used to make this one visually slide up from
// off-screen while its siblings faded/materialized in place.
export function CurrencyConverterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [rates, setRates] = useState<RatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>(DEFAULT_CODES);
  const [activeCode, setActiveCode] = useState<string>(DEFAULT_CODES[0]);
  const [activeAmount, setActiveAmount] = useState("100");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal must not render until after mount, to avoid SSR/hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open || rates) return;
    fetch("/api/exchange-rates")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load rates");
        return r.json();
      })
      .then((data: RatesResponse) => setRates(data))
      .catch(() => setError("Couldn't load exchange rates. Check your connection and try again."));
  }, [open, rates]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return acquireNavHidden();
  }, [open]);

  function amountFor(code: string): number | null {
    if (!rates) return null;
    const from = rates.rates[activeCode];
    const to = rates.rates[code];
    if (!from || !to) return null;
    const active = parseFloat(activeAmount.replace(",", ".")) || 0;
    return (active / from) * to;
  }

  function press(key: string) {
    setActiveAmount((prev) => pressKey(prev, key));
  }

  function selectRow(code: string) {
    if (code === activeCode) return;
    // Seed the newly active row with its current converted value so the number
    // doesn't visually jump when edit focus switches to a different row.
    const seeded = amountFor(code);
    setActiveCode(code);
    setActiveAmount(seeded != null ? String(Math.round(seeded * 100) / 100).replace(".", ",") : "0");
  }

  function addCurrency(code: string) {
    setCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setPickerOpen(false);
  }

  function removeCurrency(code: string) {
    setCodes((prev) => {
      const next = prev.filter((c) => c !== code);
      if (activeCode === code) {
        setActiveCode(next[0] ?? "EUR");
        setActiveAmount("0");
      }
      return next;
    });
  }

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-x-0 bottom-0 bg-background"
        style={{
          top: 0,
          zIndex: 45,
          opacity: open ? 1 : 0,
          pointerEvents: "none",
          transition: open
            ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)"
            : "opacity 320ms ease",
        }}
      />

      {/* Content */}
      <div
        className="fixed inset-x-0 bottom-0 flex flex-col"
        style={{
          top: 0,
          zIndex: 45,
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(24px)",
          transition: open
            ? `opacity 400ms ease 180ms, transform 500ms ${springIn} 160ms`
            : `opacity 220ms ease, transform 260ms ${springOut}`,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Header — close + centered title + add-currency */}
        <div
          className="shrink-0 grid grid-cols-[auto_1fr_auto] items-center px-4 pb-3"
          style={{ paddingTop: "calc(0.75rem + var(--sat))" }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Back"
            className="size-11 rounded-full bg-white/12 backdrop-blur-xs flex items-center justify-center active:scale-[0.97] transition-transform"
          >
            <IconChevronLeft className="size-5" />
          </button>
          <h1 className="text-lg text-foreground text-center truncate">Currency converter</h1>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label="Add currency"
            className="glass-icon-btn size-11 justify-self-end"
          >
            <IconPlus className="size-5" />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden px-6 flex flex-col gap-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {error && <p className="text-sm text-destructive px-1">{error}</p>}
          {rates && !error && (
            <p className="text-xs text-foreground/40 px-1">
              Rates updated {new Date(rates.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          <div className="space-y-2 shrink-0">
            {codes.map((code) => {
              const info = currencyInfo(code);
              const active = code === activeCode;
              const value = amountFor(code);
              return (
                <div
                  key={code}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors",
                    active ? "bg-foreground/10" : "bg-card",
                  )}
                >
                  <button type="button" onClick={() => selectRow(code)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <span className="text-2xl shrink-0">{info ? flagEmoji(info.country) : "💱"}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{code}</span>
                      <span className="block text-xs text-foreground/50 truncate">{info?.name ?? code}</span>
                    </span>
                  </button>
                  <span className={cn("text-lg font-semibold tabular-nums shrink-0", active ? "text-foreground" : "text-foreground/70")}>
                    {active ? activeAmount || "0" : value != null ? value.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) : "—"}
                  </span>
                  {codes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCurrency(code)}
                      aria-label={`Remove ${code}`}
                      className="size-6 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 text-foreground/50 active:bg-foreground/20 transition-colors"
                    >
                      <IconX className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex-1" />

          <div className="shrink-0 pb-[calc(1.5rem+var(--sab))]">
            <NumericKeypad onKey={press} digitClassName={digitKeyClass} />
          </div>
        </div>
      </div>

      <CurrencyPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} exclude={codes} onSelect={addCurrency} />
    </>,
    document.body,
  );
}

function CurrencyPickerDialog({
  open,
  onOpenChange,
  exclude,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  exclude: string[];
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal must not render until after mount, to avoid SSR/hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    return acquireNavHidden();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [query]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof CURRENCIES>();
    for (const c of filtered) {
      const letter = c.name[0]?.toUpperCase() ?? "#";
      const list = map.get(letter) ?? [];
      list.push(c);
      map.set(letter, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-x-0 bottom-0 bg-background"
        style={{
          top: 0,
          zIndex: 50,
          opacity: open ? 1 : 0,
          pointerEvents: "none",
          transition: open
            ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)"
            : "opacity 320ms ease",
        }}
      />

      {/* Content */}
      <div
        className="fixed inset-x-0 bottom-0 flex flex-col"
        style={{
          top: 0,
          zIndex: 50,
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(24px)",
          transition: open
            ? `opacity 400ms ease 180ms, transform 500ms ${springIn} 160ms`
            : `opacity 220ms ease, transform 260ms ${springOut}`,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Header — close + centered title */}
        <div
          className="shrink-0 grid grid-cols-[auto_1fr_auto] items-center px-4 pb-3"
          style={{ paddingTop: "calc(0.75rem + var(--sat))" }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="glass-icon-btn size-11"
          >
            <IconX className="size-4" />
          </button>
          <h1 className="text-lg text-foreground text-center truncate">Select currency</h1>
          <div className="size-11" />
        </div>

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden px-6 flex flex-col gap-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="relative shrink-0">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search currency"
              className="w-full h-11 rounded-full bg-foreground/5 pl-10 pr-4 text-sm outline-none placeholder:text-foreground/40"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 -mx-1 px-1 pb-[calc(1.5rem+var(--sab))]">
            {groups.map(([letter, list]) => (
              <div key={letter}>
                <p className="px-2 mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/40">{letter}</p>
                <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border/50">
                  {list.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      disabled={exclude.includes(c.code)}
                      onClick={() => onSelect(c.code)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:opacity-40 active:bg-foreground/[0.04] transition-colors"
                    >
                      <span className="text-xl shrink-0">{flagEmoji(c.country)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold">{c.code}</span>
                        <span className="block text-xs text-foreground/50 truncate">{c.name}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
