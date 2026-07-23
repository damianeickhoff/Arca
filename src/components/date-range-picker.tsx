"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  IconCalendarWeek as CalendarRange,
  IconChevronDownFilled as ChevronDown
} from "@tabler/icons-react";
import { DatePicker } from "@/components/date-picker";
import { cn } from "@/lib/utils";
import { glassIconButton } from "@/lib/styles";
import { filterPillClass } from "@/components/filter-pill";
import { useIsMobile } from "@/lib/use-is-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  financialMonthRange,
  financialMonthRangeByMonth,
  type FinancialMonthConfig,
} from "@/lib/date-range";

export type { DateRange } from "@/lib/date-range";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}

function endOfWeek(date = new Date()) {
  const start = new Date(`${startOfWeek(date)}T00:00:00`);
  start.setDate(start.getDate() + 6);
  return toDateStr(start);
}

function setRangeCookie(name: "date_from" | "date_to", value: string) {
  document.cookie = `${name}=${value};path=/;max-age=31536000;SameSite=Lax`;
}

type Preset = { label: string; from: () => string; to: () => string };

function makePresets(financialMonth: FinancialMonthConfig): Preset[] {
  const year = new Date().getFullYear();
  return [
    { label: "This week", from: () => startOfWeek(), to: () => endOfWeek() },
    { label: "This month", from: () => financialMonthRange(financialMonth, 0).from, to: () => financialMonthRange(financialMonth, 0).to },
    { label: "Last month", from: () => financialMonthRange(financialMonth, -1).from, to: () => financialMonthRange(financialMonth, -1).to },
    { label: "2 maanden geleden", from: () => financialMonthRange(financialMonth, -2).from, to: () => financialMonthRange(financialMonth, -2).to },
    { label: "Laatste 3 maanden", from: () => financialMonthRange(financialMonth, -2).from, to: () => financialMonthRange(financialMonth, 0).to },
    { label: "This year", from: () => financialMonthRangeByMonth(`${year}-01`, financialMonth).from, to: () => financialMonthRangeByMonth(`${year}-12`, financialMonth).to },
    { label: "Alles", from: () => "2000-01-01", to: () => today() },
  ];
}

function rangeLabel(from: string, to: string, presets: Preset[]): string {
  for (const p of presets) {
    if (p.from() === from && p.to() === to) return p.label;
  }
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(from)} – ${fmt(to)}`;
}

interface DateRangePickerProps {
  from: string;
  to: string;
  financialMonth?: FinancialMonthConfig;
  keepParams?: Record<string, string | undefined>;
  iconOnly?: boolean;
  persist?: boolean;
  forceLabel?: boolean;
  flat?: boolean;
}

export function DateRangePicker({
  from,
  to,
  financialMonth = { defaultStartDay: 1 },
  keepParams,
  iconOnly = false,
  persist = true,
  forceLabel = false,
  flat = false,
}: DateRangePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const presets = makePresets(financialMonth);
  const isMobile = useIsMobile();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-slot="popover-content"]')) return;
      setOpen(false);
    }
    if (!isMobile) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [isMobile]);

  function toggleOpen() {
    if (!isMobile && !open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const panelWidth = 288;
      setPanelPos({
        top: rect.bottom + 8,
        left: Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8),
      });
    }
    setOpen((v) => !v);
  }

  function navigate(f: string, t: string) {
    if (persist) {
      setRangeCookie("date_from", f);
      setRangeCookie("date_to", t);
    }
    const params = new URLSearchParams();
    if (keepParams) {
      for (const [k, v] of Object.entries(keepParams)) {
        if (v && k !== "from" && k !== "to" && k !== "month") params.set(k, v);
      }
    }
    params.set("from", f);
    params.set("to", t);
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  function applyCustom() {
    if (customFrom && customTo && customFrom <= customTo) navigate(customFrom, customTo);
  }

  const triggerButton = (
    <button
      onClick={toggleOpen}
      className={iconOnly
        ? cn("size-12", glassIconButton)
        : flat
          ? filterPillClass(false, "w-full")
          : "flex items-center gap-2 text-sm font-normal rounded-full pl-3 pr-3 py-2 bg-foreground/3 text-foreground cursor-pointer"
      }
    >
      {iconOnly ? (
        <CalendarRange className="stroke-[1.5] size-7 text-foreground dark:text-gray-300" />
      ) : flat ? (
        <>
          <span className="truncate text-left">{rangeLabel(from, to, presets)}</span>
          <ChevronDown className="size-4.5 shrink-0" />
        </>
      ) : (
        <>
          <CalendarRange className="size-4.5 shrink-0" />
          <span className={`${forceLabel ? "" : "hidden sm:inline"} max-w-[180px] truncate`}>{rangeLabel(from, to, presets)}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </>
      )}
    </button>
  );

  if (isMobile) {
    return (
      <div className={`relative ${flat ? "flex-1 min-w-0" : ""}`} ref={ref}>
        {triggerButton}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Periode kiezen</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1 -mx-1">
              {presets.map((p) => {
                const pFrom = p.from();
                const pTo = p.to();
                const active = pFrom === from && pTo === to;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => navigate(pFrom, pTo)}
                    className={cn(
                      "w-full text-left text-sm px-4 py-3.5 rounded-xl transition-colors",
                      active ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-foreground/10 space-y-3">
              <p className="text-sm font-medium text-foreground">Aangepast bereik</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-foreground/60 px-1">Van</label>
                  <DatePicker value={customFrom} onChange={setCustomFrom} triggerClassName="h-10 text-xs mt-0 mb-0" />
                </div>
                <div>
                  <label className="text-xs text-foreground/60">Tot</label>
                  <DatePicker value={customTo} onChange={setCustomTo} triggerClassName="h-10 text-xs mt-0 mb-0" />
                </div>
              </div>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customFrom || !customTo || customFrom > customTo}
                className="w-full h-12 text-sm rounded-xl bg-foreground text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Toepassen
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className={`relative ${flat ? "flex-1 min-w-0" : ""}`} ref={ref}>
      {triggerButton}
      {open && panelPos && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 bg-white/60 backdrop-blur-lg rounded-lg p-1 w-72 max-w-[calc(100vw-1rem)] space-y-1 shadow-md text-popover-foreground"
          style={{ top: panelPos.top, left: Math.max(8, panelPos.left) }}
        >
          {presets.map((p) => {
            const pFrom = p.from();
            const pTo = p.to();
            const active = pFrom === from && pTo === to;
            return (
              <button
                key={p.label}
                onClick={() => navigate(pFrom, pTo)}
                className={`w-full text-left text-sm px-2.5 py-3 rounded-md transition-colors ${
                  active
                    ? "bg-foreground text-primary-foreground font-medium"
                    : "hover:bg-foreground/5 text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}

          <div className="pt-2 border-t border-foreground/5 mx-1.5 space-y-2 pb-1">
            <p className="text-sm text-foreground font-medium px-1">Aangepast bereik</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-foreground/60 px-1">Van</label>
                <DatePicker
                  value={customFrom}
                  onChange={setCustomFrom}
                  triggerClassName="text-foreground h-10 w-full rounded-sm px-2 py-1 text-xs bg-white/20 mt-0 mb-0 gap-1"
                />
              </div>
              <div>
                <label className="text-sm text-foreground/60">Tot</label>
                <DatePicker
                  value={customTo}
                  onChange={setCustomTo}
                  triggerClassName="text-foreground h-10 w-full rounded-sm px-2 py-1 text-xs bg-white/20 mt-0 mb-0 gap-1"
                />
              </div>
            </div>
            <button
              onClick={applyCustom}
              disabled={!customFrom || !customTo || customFrom > customTo}
              className="w-full h-10 mt-1 text-sm py-1.5 rounded-sm bg-foreground text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Toepassen
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
