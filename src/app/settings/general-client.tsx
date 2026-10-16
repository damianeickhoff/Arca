"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconCheckFilled as Check,
  IconDotsVerticalFilled as EllipsisVertical,
  IconTrashFilled as Trash2
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import { useConfirm } from "@/components/clear/confirm-dialog";
import {
  currentFinancialMonth,
  financialMonthRangeByMonth,
  type FinancialMonthConfig,
} from "@/lib/date-range";

type MonthOverride = {
  month: string;
  startDay: number;
};

function isValidStartDay(value: string) {
  const n = parseInt(value, 10);
  return !isNaN(n) && n >= 1 && n <= 28;
}

function isValidMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function sortOverrides(rows: MonthOverride[]) {
  return [...rows].sort((left, right) => right.month.localeCompare(left.month));
}

function formatMonthLabel(month: string, locale = "en-GB") {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
}

function formatRange(config: FinancialMonthConfig, month: string) {
  const range = financialMonthRangeByMonth(month, config);
  const fmt = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}

// ── Standalone form components (used in sidebar dialogs) ─────────────────────

export function FinancieleMaandForm({
  currentStartDay,
  currentWeekendRollback,
}: {
  currentStartDay: number;
  currentWeekendRollback: boolean;
}) {
  const router = useRouter();
  const [startDay, setStartDay] = useState(String(currentStartDay));
  const [weekendRollback, setWeekendRollback] = useState(currentWeekendRollback);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savedDefault, setSavedDefault] = useState(false);
  const [savingRollback, setSavingRollback] = useState(false);
  const [error, setError] = useState("");

  const defaultStartDay = isValidStartDay(startDay) ? parseInt(startDay, 10) : 1;
  const previewConfig: FinancialMonthConfig = { defaultStartDay, overrides: {}, weekendRollback };
  const previewMonth = currentFinancialMonth(previewConfig);
  const previewRange = formatRange(previewConfig, previewMonth);

  async function toggleWeekendRollback(checked: boolean) {
    setWeekendRollback(checked);
    setError("");
    setSavingRollback(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "month_start_weekend_rollback", value: checked ? "1" : "0" }),
    });
    setSavingRollback(false);
    if (!res.ok) { setError("Could not save the weekend setting."); setWeekendRollback(!checked); return; }
    router.refresh();
  }

  async function saveDefaultStartDay() {
    const n = parseInt(startDay, 10);
    if (isNaN(n) || n < 1 || n > 28) return;
    setError("");
    setSavingDefault(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "month_start_day", value: n }),
    });
    setSavingDefault(false);
    if (!res.ok) { setError("Could not save the start day."); return; }
    setSavedDefault(true);
    setTimeout(() => setSavedDefault(false), 2000);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Field label="Default start day">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Input backgroundClassName="bg-[var(--dialog-background)]" type="number" inputMode="numeric" min={1} max={28} value={startDay} onChange={(e) => setStartDay(e.target.value)} className="w-24" placeholder="1" />
            <span className="text-sm text-ink-2">of the month (1-28)</span>
          </div>
          <Button onClick={saveDefaultStartDay} disabled={savingDefault || !isValidStartDay(startDay)}>
            {savingDefault ? "Saving..." : savedDefault ? "Saved ✓" : "Save"}
          </Button>
        </div>
      </Field>
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-sm">Shift the start day to Friday when it falls on a weekend</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => toggleWeekendRollback(!weekendRollback)} disabled={savingRollback}
          className="shrink-0 bg-surface-2 text-ink hover:bg-foreground/10 size-9">
          {weekendRollback && <Check className="size-4" />}
        </Button>
      </div>
      <p className="text-xs text-ink-2">Current period: {previewRange}</p>
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  );
}

// ── Sidebar sub-page variant (addOpen controlled externally by header + button) ─

export function MaandUitzonderingenSubPage({
  currentStartDay,
  initialOverrides,
  addOpen,
  onAddOpenChange,
}: {
  currentStartDay: number;
  initialOverrides: MonthOverride[];
  addOpen: boolean;
  onAddOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const t = useTranslations("settings.monthOverrides");
  const locale = useLocale();
  const confirm = useConfirm();
  const [overrides, setOverrides] = useState(sortOverrides(initialOverrides));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [newMonth, setNewMonth] = useState("");
  const [newStartDay, setNewStartDay] = useState(String(currentStartDay));
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editStartDay, setEditStartDay] = useState("");

  const previewConfig: FinancialMonthConfig = {
    defaultStartDay: currentStartDay,
    overrides: Object.fromEntries(overrides.map((row) => [row.month, row.startDay])),
    weekendRollback: false,
  };

  // When addOpen flips to true, pre-fill the month field. Tracked in state, not a ref:
  // refs may not be read or written during render.
  const [prevAddOpen, setPrevAddOpen] = useState(false);
  if (addOpen !== prevAddOpen) {
    setPrevAddOpen(addOpen);
    if (addOpen) {
      const now = new Date();
      setNewMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      setNewStartDay(String(currentStartDay));
    }
  }

  async function saveOverride(month: string, value: string) {
    if (!isValidMonth(month) || !isValidStartDay(value)) return false;
    setError("");
    setPending(true);
    const startDayValue = parseInt(value, 10);
    const res = await fetch("/api/settings/financial-month-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, startDay: startDayValue }),
    });
    setPending(false);
    if (!res.ok) { setError(`The override for ${formatMonthLabel(month)} could not be saved.`); return false; }
    setOverrides((cur) => sortOverrides([...cur.filter((r) => r.month !== month), { month, startDay: startDayValue }]));
    router.refresh();
    return true;
  }

  async function removeOverride(month: string) {
    const ok = await confirm({
      title: t("deleteTitle", { month: formatMonthLabel(month, locale) }),
      body: t("deleteBody"),
      confirmLabel: t("deleteConfirm"),
      destructive: true,
    });
    if (!ok) return;
    setError("");
    setPending(true);
    const res = await fetch(`/api/settings/financial-month-overrides?month=${encodeURIComponent(month)}`, { method: "DELETE" });
    setPending(false);
    if (!res.ok) { setError(`The override for ${formatMonthLabel(month)} could not be deleted.`); return; }
    setOverrides((cur) => cur.filter((r) => r.month !== month));
    setEditingMonth((cur) => (cur === month ? null : cur));
  }

  async function submitAdd() {
    const ok = await saveOverride(newMonth, newStartDay);
    if (ok) onAddOpenChange(false);
  }

  function startEdit(row: MonthOverride) { setEditingMonth(row.month); setEditStartDay(String(row.startDay)); }

  async function submitEdit() {
    if (!editingMonth) return;
    const ok = await saveOverride(editingMonth, editStartDay);
    if (ok) setEditingMonth(null);
  }

  return (
    <div className="px-4 pb-[calc(1.5rem+var(--sab))] pt-2 space-y-3">
      {overrides.length === 0 ? (
        <p className="text-sm text-ink-2 pt-2">No overrides configured yet.</p>
      ) : (
        <div className="space-y-3 pt-1">
          {overrides.map((override) => (
            <div key={override.month} className="py-3.5 px-5 rounded-card bg-white dark:bg-white/10 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold capitalize truncate">{formatMonthLabel(override.month)}</p>
                <p className="text-sm text-ink-2 mt-0.5">Startdag {override.startDay} · {formatRange(previewConfig, override.month)}</p>
              </div>
              <button onClick={() => startEdit(override)} className="flex items-center justify-center rounded-row bg-surface-2 hover:bg-foreground/10 text-ink shrink-0 size-9 cursor-pointer">
                <EllipsisVertical className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-negative">{error}</p>}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader><DialogTitle>New override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Month"><DatePicker granularity="month" value={newMonth} onChange={setNewMonth} /></Field>
            <Field label="Start day">
              <Input backgroundClassName="bg-[var(--dialog-content-background)]" type="number" inputMode="text" min={1} max={28} value={newStartDay} onChange={(e) => setNewStartDay(e.target.value)} />
            </Field>
            <Button onClick={submitAdd} disabled={pending || !isValidMonth(newMonth) || !isValidStartDay(newStartDay)} className="w-full">
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editingMonth !== null} onOpenChange={(v) => !v && setEditingMonth(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader><DialogTitle>Edit override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Month">
              <p className="h-12 w-full rounded-tile bg-surface-2 px-3.5 text-sm mt-1 flex items-center capitalize">{editingMonth ? formatMonthLabel(editingMonth) : ""}</p>
            </Field>
            <Field label="Start day">
              <Input backgroundClassName="bg-[var(--dialog-content-background)]" type="number" inputMode="text" min={1} max={28} value={editStartDay} onChange={(e) => setEditStartDay(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button onClick={submitEdit} disabled={pending || !isValidStartDay(editStartDay)} className="flex-1">
                <Check className="size-4 mr-1" />Save
              </Button>
              <Button variant="destructive" size="icon" className="size-12" onClick={() => editingMonth && removeOverride(editingMonth)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
