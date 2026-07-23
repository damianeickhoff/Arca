"use client";

import { useState } from "react";
import {
  IconChevronRight as ChevronRight,
  IconRepeat,
  IconSparkles,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CategoryGrid, useCategoryFilter } from "@/components/category-picker";
import { CalendarContent } from "@/components/date-picker";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";
import type { Category } from "@/db/schema";
import { RECURRENCE_OPTIONS, recurrenceLabel } from "./goal-shared";

// The goal creator's row vocabulary — icon-led rows inside rounded cards, each
// opening a small dialog. Shared by the routed /goals/add page and the edit
// overlay (goal-creator.tsx) so the two stay identical.

export function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-card overflow-hidden">{children}</div>;
}

export function Divider() {
  return <div className="mx-4 h-px bg-foreground/8" />;
}

export function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="size-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
      {children}
    </span>
  );
}

export function ValueRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-foreground/[0.03] transition-colors">
      <RowIcon>{icon}</RowIcon>
      <span className="flex-1 text-base">{label}</span>
      <span className="text-sm text-foreground/50 tabular-nums">{value}</span>
      <ChevronRight className="size-4 text-foreground/30 shrink-0" />
    </button>
  );
}

export function CategoryRow({
  categories,
  value,
  onChange,
  required = false,
}: {
  categories: Category[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { budgetType, showSubcategories, filterMenu } = useCategoryFilter();
  const selected = categories.find((c) => String(c.id) === value);
  return (
    <>
      <ValueRow
        icon={<IconSparkles className="size-5" />}
        label="Category"
        value={selected ? selected.name : required ? "Required" : "All"}
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader actions={filterMenu}>
            <DialogTitle>Choose category</DialogTitle>
          </DialogHeader>
          <CategoryGrid
            categories={categories}
            current={value || undefined}
            isFormMode
            budgetType={budgetType}
            showSubcategories={showSubcategories}
            onChange={(v) => onChange(v === "none" ? "" : v)}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AmountRow({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  return (
    <>
      <ValueRow
        icon={icon}
        label={label}
        value={value ? formatEur(parseFloat(value) || 0) : "—"}
        onClick={() => { setDraft(value); setOpen(true); }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              type="number"
              step="0.01"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="0.00"
            />
            <Button
              className="w-full"
              onClick={() => { onChange(draft); setOpen(false); }}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RecurrenceRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ValueRow
        icon={<IconRepeat className="size-5" />}
        label="Recurrency"
        value={recurrenceLabel(value)}
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Recurrency</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {RECURRENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "w-full text-left rounded-xl px-4 py-3 text-sm transition-colors",
                  value === opt.value ? "bg-foreground text-primary-foreground font-semibold" : "hover:bg-foreground/5",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DateRow({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  return (
    <>
      <ValueRow icon={icon} label={label} value={fmtDate(value || null)} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <CalendarContent
            value={value}
            onChange={onChange}
            granularity="day"
            cursor={cursor}
            setCursor={setCursor}
            onClose={() => setOpen(false)}
          />
          {value && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="w-full text-center text-xs font-medium text-foreground/50 hover:text-foreground mt-2 transition-colors"
            >
              Clear
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TypeCard({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 rounded-2xl bg-card px-4 py-4 text-left active:bg-foreground/[0.03] transition-colors"
    >
      <span className="size-11 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-lg font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-foreground/55 leading-snug">{subtitle}</span>
      </span>
      <ChevronRight className="size-5 text-foreground/30 shrink-0" />
    </button>
  );
}
