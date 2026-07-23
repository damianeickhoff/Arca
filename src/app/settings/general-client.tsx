"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  IconPlusFilled as Plus,
  IconCheckFilled as Check,
  IconDotsVerticalFilled as EllipsisVertical,
  IconTrashFilled as Trash2
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import {
  currentFinancialMonth,
  financialMonthRangeByMonth,
  type FinancialMonthConfig,
} from "@/lib/date-range";
import { LanguageList } from "@/components/language-switcher";
import { CurrencyList } from "@/components/currency-switcher";

type MonthOverride = {
  month: string;
  startDay: number;
};

interface Props {
  currentStartDay: number;
  currentWeekendRollback: boolean;
  currentBudgetRollover?: boolean;
  initialOverrides: MonthOverride[];
}

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

function formatMonthLabel(month: string) {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("en-GB", {
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
            <Input type="number" inputMode="numeric" min={1} max={28} value={startDay} onChange={(e) => setStartDay(e.target.value)} className="w-24" placeholder="1" />
            <span className="text-sm text-foreground/60">of the month (1–28)</span>
          </div>
          <Button onClick={saveDefaultStartDay} disabled={savingDefault || !isValidStartDay(startDay)}>
            {savingDefault ? "Saving..." : savedDefault ? "Saved ✓" : "Save"}
          </Button>
        </div>
      </Field>
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-sm">Shift the start day to Friday when it falls on a weekend</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => toggleWeekendRollback(!weekendRollback)} disabled={savingRollback}
          className="shrink-0 bg-foreground/3 text-foreground hover:bg-foreground/10 size-9">
          {weekendRollback && <Check className="size-4" />}
        </Button>
      </div>
      <p className="text-xs text-foreground/60">Current period: {previewRange}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function MaandUitzonderingenForm({
  currentStartDay,
  initialOverrides,
}: {
  currentStartDay: number;
  initialOverrides: MonthOverride[];
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState(sortOverrides(initialOverrides));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newMonth, setNewMonth] = useState("");
  const [newStartDay, setNewStartDay] = useState(String(currentStartDay));
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editStartDay, setEditStartDay] = useState("");

  const previewConfig: FinancialMonthConfig = {
    defaultStartDay: currentStartDay,
    overrides: Object.fromEntries(overrides.map((row) => [row.month, row.startDay])),
    weekendRollback: false,
  };

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
    if (!confirm(`Delete the override for ${formatMonthLabel(month)}?`)) return;
    setError("");
    setPending(true);
    const res = await fetch(`/api/settings/financial-month-overrides?month=${encodeURIComponent(month)}`, { method: "DELETE" });
    setPending(false);
    if (!res.ok) { setError(`The override for ${formatMonthLabel(month)} could not be deleted.`); return; }
    setOverrides((cur) => cur.filter((r) => r.month !== month));
    setEditingMonth((cur) => (cur === month ? null : cur));
  }

  function openAddOverride() {
    const now = new Date();
    setNewMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    setNewStartDay(String(currentStartDay));
    setAddOpen(true);
  }

  async function submitAddOverride() {
    const ok = await saveOverride(newMonth, newStartDay);
    if (ok) setAddOpen(false);
  }

  function startEditOverride(row: MonthOverride) { setEditingMonth(row.month); setEditStartDay(String(row.startDay)); }

  async function submitEditOverride() {
    if (!editingMonth) return;
    const ok = await saveOverride(editingMonth, editStartDay);
    if (ok) setEditingMonth(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">Only use this for months that deviate from the default.</p>
        <button onClick={openAddOverride} className="size-9 rounded-full bg-foreground/3 hover:bg-foreground/10 text-foreground flex items-center justify-center shrink-0 cursor-pointer" aria-label="Add override">
          <Plus className="size-4" />
        </button>
      </div>
      {overrides.length === 0 ? (
        <p className="text-sm text-foreground/60">No overrides configured yet.</p>
      ) : (
        <div className="space-y-3">
          {overrides.map((override) => (
            <div key={override.month} className="py-3.5 px-5 rounded-xl bg-foreground/3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base capitalize truncate">{formatMonthLabel(override.month)}</p>
                <p className="text-sm text-foreground/60 mt-0.5">Startdag {override.startDay} · {formatRange(previewConfig, override.month)}</p>
              </div>
              <button onClick={() => startEditOverride(override)} className="flex items-center justify-center p-1.5 rounded hover:bg-foreground/10 text-foreground rounded-sm bg-foreground/5 hover:text-foreground shrink-0 size-9 cursor-pointer">
                <EllipsisVertical className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader><DialogTitle>New override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Month"><DatePicker granularity="month" value={newMonth} onChange={setNewMonth} /></Field>
            <Field label="Start day">
              <Input type="number" inputMode="numeric" min={1} max={28} value={newStartDay} onChange={(e) => setNewStartDay(e.target.value)} />
            </Field>
            <Button onClick={submitAddOverride} disabled={pending || !isValidMonth(newMonth) || !isValidStartDay(newStartDay)} className="w-full">
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingMonth !== null} onOpenChange={(v) => !v && setEditingMonth(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader><DialogTitle>Edit override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Month">
              <p className="h-12 w-full rounded-lg bg-foreground/3 px-3.5 text-sm mt-1 flex items-center capitalize">{editingMonth ? formatMonthLabel(editingMonth) : ""}</p>
            </Field>
            <Field label="Start day">
              <Input type="number" inputMode="numeric" min={1} max={28} value={editStartDay} onChange={(e) => setEditStartDay(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button onClick={submitEditOverride} disabled={pending || !isValidStartDay(editStartDay)} className="flex-1">
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

  // When addOpen flips to true, pre-fill the month field
  const prevAddOpen = useRef(false);
  if (addOpen && !prevAddOpen.current) {
    const now = new Date();
    setNewMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    setNewStartDay(String(currentStartDay));
  }
  prevAddOpen.current = addOpen;

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
    if (!confirm(`Delete the override for ${formatMonthLabel(month)}?`)) return;
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
        <p className="text-sm text-foreground/60 pt-2">No overrides configured yet.</p>
      ) : (
        <div className="space-y-3 pt-1">
          {overrides.map((override) => (
            <div key={override.month} className="py-3.5 px-5 rounded-2xl bg-white dark:bg-white/10 shadow-sm flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold capitalize truncate">{formatMonthLabel(override.month)}</p>
                <p className="text-sm text-foreground/60 mt-0.5">Startdag {override.startDay} · {formatRange(previewConfig, override.month)}</p>
              </div>
              <button onClick={() => startEdit(override)} className="flex items-center justify-center rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground shrink-0 size-9 cursor-pointer">
                <EllipsisVertical className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader><DialogTitle>New override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Month"><DatePicker granularity="month" value={newMonth} onChange={setNewMonth} /></Field>
            <Field label="Start day">
              <Input type="number" inputMode="numeric" min={1} max={28} value={newStartDay} onChange={(e) => setNewStartDay(e.target.value)} />
            </Field>
            <Button onClick={submitAdd} disabled={pending || !isValidMonth(newMonth) || !isValidStartDay(newStartDay)} className="w-full">
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editingMonth !== null} onOpenChange={(v) => !v && setEditingMonth(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader><DialogTitle>Edit override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Month">
              <p className="h-12 w-full rounded-lg bg-foreground/3 px-3.5 text-sm mt-1 flex items-center capitalize">{editingMonth ? formatMonthLabel(editingMonth) : ""}</p>
            </Field>
            <Field label="Start day">
              <Input type="number" inputMode="numeric" min={1} max={28} value={editStartDay} onChange={(e) => setEditStartDay(e.target.value)} />
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

// ── Full page component (used on /settings?tab=general) ───────────────────────

export function GeneralSettingsClient({ currentStartDay, currentWeekendRollback, currentBudgetRollover, initialOverrides }: Props) {
  const router = useRouter();
  const [startDay, setStartDay] = useState(String(currentStartDay));
  const [weekendRollback, setWeekendRollback] = useState(currentWeekendRollback);
  const [budgetRollover, setBudgetRollover] = useState(currentBudgetRollover ?? false);
  const [savingBudgetRollover, setSavingBudgetRollover] = useState(false);
  const [overrides, setOverrides] = useState(sortOverrides(initialOverrides));
  const [savingDefault, setSavingDefault] = useState(false);
  const [savedDefault, setSavedDefault] = useState(false);
  const [savingRollback, setSavingRollback] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [newMonth, setNewMonth] = useState("");
  const [newStartDay, setNewStartDay] = useState(String(currentStartDay));

  // Edit dialog state
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editStartDay, setEditStartDay] = useState("");

  const defaultStartDay = isValidStartDay(startDay) ? parseInt(startDay, 10) : 1;
  const previewConfig: FinancialMonthConfig = {
    defaultStartDay,
    overrides: Object.fromEntries(overrides.map((row) => [row.month, row.startDay])),
    weekendRollback,
  };
  const previewMonth = currentFinancialMonth(previewConfig);
  const previewRange = formatRange(previewConfig, previewMonth);

  async function toggleWeekendRollback(checked: boolean) {
    setWeekendRollback(checked);
    setError("");
    setSavingRollback(true);
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "month_start_weekend_rollback", value: checked ? "1" : "0" }),
    });
    setSavingRollback(false);

    if (!response.ok) {
      setError("Could not save the weekend setting.");
      setWeekendRollback(!checked);
      return;
    }
    router.refresh();
  }

  async function toggleBudgetRollover(checked: boolean) {
    setBudgetRollover(checked);
    setError("");
    setSavingBudgetRollover(true);
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "budget_rollover", value: checked ? "1" : "0" }),
    });
    setSavingBudgetRollover(false);

    if (!response.ok) {
      setError("Could not save the rollover setting.");
      setBudgetRollover(!checked);
      return;
    }
    router.refresh();
  }

  async function saveDefaultStartDay() {
    const n = parseInt(startDay, 10);
    if (isNaN(n) || n < 1 || n > 28) return;

    setError("");
    setSavingDefault(true);
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "month_start_day", value: n }),
    });
    setSavingDefault(false);

    if (!response.ok) {
      setError("Could not save the start day.");
      return;
    }

    setSavedDefault(true);
    setTimeout(() => setSavedDefault(false), 2000);
    router.refresh();
  }

  async function saveOverride(month: string, value: string) {
    if (!isValidMonth(month) || !isValidStartDay(value)) return false;

    setError("");
    setPending(true);
    const startDayValue = parseInt(value, 10);
    const response = await fetch("/api/settings/financial-month-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, startDay: startDayValue }),
    });
    setPending(false);

    if (!response.ok) {
      setError(`The override for ${formatMonthLabel(month)} could not be saved.`);
      return false;
    }

    setOverrides((current) =>
      sortOverrides([
        ...current.filter((row) => row.month !== month),
        { month, startDay: startDayValue },
      ]),
    );
    router.refresh();
    return true;
  }

  async function removeOverride(month: string) {
    if (!confirm(`Delete the override for ${formatMonthLabel(month)}?`)) return;
    setError("");
    setPending(true);
    const response = await fetch(`/api/settings/financial-month-overrides?month=${encodeURIComponent(month)}`, {
      method: "DELETE",
    });
    setPending(false);

    if (!response.ok) {
      setError(`The override for ${formatMonthLabel(month)} could not be deleted.`);
      return;
    }

    setOverrides((current) => current.filter((row) => row.month !== month));
    setEditingMonth((current) => (current === month ? null : current));
  }

  function openAddOverride() {
    // Default to the current month, matching what the DatePicker's trigger already
    // displays when given an empty value — otherwise the button looks pre-filled but
    // "Add" stays disabled until the user clicks a month, which is confusing.
    const now = new Date();
    setNewMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    setNewStartDay(String(currentStartDay));
    setAddOpen(true);
  }

  async function submitAddOverride() {
    const ok = await saveOverride(newMonth, newStartDay);
    if (ok) setAddOpen(false);
  }

  function startEditOverride(row: MonthOverride) {
    setEditingMonth(row.month);
    setEditStartDay(String(row.startDay));
  }

  async function submitEditOverride() {
    if (!editingMonth) return;
    const ok = await saveOverride(editingMonth, editStartDay);
    if (ok) setEditingMonth(null);
  }

  return (
    <div className="space-y-6">
      {/* Section: Language */}
      <div className="rounded-2xl bg-card p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-lg mb-1">Language</h2>
          <p className="text-sm text-foreground/60">Choose the language for the interface.</p>
        </div>
        <LanguageList />
      </div>

      {/* Section: Currency */}
      <div className="rounded-2xl bg-card p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-lg mb-1">Currency</h2>
          <p className="text-sm text-foreground/60">
            Choose the currency symbol shown on amounts throughout the app.
          </p>
        </div>
        <CurrencyList />
      </div>

      {/* Section: Financial month settings */}
      <div className="rounded-2xl bg-card p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-lg mb-1">Financial month</h2>
          <p className="text-sm text-foreground/60">
            Set a default start day for your financial month.
          </p>
        </div>

        <div className="space-y-3">
          <Field label="Default start day">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={28}
                  value={startDay}
                  onChange={(e) => setStartDay(e.target.value)}
                  className="w-24"
                  placeholder="1"
                />
                <span className="text-sm text-foreground/60">of the month (1–28)</span>
              </div>
              <Button onClick={saveDefaultStartDay} disabled={savingDefault || !isValidStartDay(startDay)}>
                {savingDefault ? "Saving..." : savedDefault ? "Saved ✓" : "Save"}
              </Button>
            </div>
          </Field>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm">Shift the start day to Friday when it falls on a weekend</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => toggleWeekendRollback(!weekendRollback)}
              disabled={savingRollback}
              className="shrink-0 bg-foreground/3 text-foreground hover:bg-foreground/10 size-9"
            >
              {weekendRollback && <Check className="size-4" />}
            </Button>
          </div>

          <p className="text-xs text-foreground/60">
            Current period with these settings: {previewRange}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-base">Budget rollover</h2>
          <p className="text-xs text-muted-foreground">Unused category budget carries into next month.</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">Roll over unused category budgets to next month</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => toggleBudgetRollover(!budgetRollover)}
            disabled={savingBudgetRollover}
            className="shrink-0 bg-foreground/3 text-foreground hover:bg-foreground/10 size-9"
          >
            {budgetRollover && <Check className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Section: Maanduitzonderingen */}
      <div className="rounded-2xl bg-card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg mb-1">Month overrides</h2>
            <p className="text-sm text-foreground/60">
              Only use this for months that deviate from the default.
            </p>
          </div>
          <button
            onClick={openAddOverride}
            className="size-9 rounded-full bg-foreground/3 hover:bg-foreground/10 text-foreground flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Add override"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {overrides.length === 0 ? (
          <p className="text-sm text-foreground/60">No overrides configured yet.</p>
        ) : (
          <div className="space-y-3">
            {overrides.map((override) => (
              <div key={override.month} className="py-3.5 px-5 rounded-xl bg-foreground/3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base capitalize truncate">{formatMonthLabel(override.month)}</p>
                  <p className="text-sm text-foreground/60 mt-0.5">
                    Startdag {override.startDay} · {formatRange(previewConfig, override.month)}
                  </p>
                </div>
                <button
                  onClick={() => startEditOverride(override)}
                  className="flex items-center justify-center p-1.5 rounded hover:bg-foreground/10 text-foreground rounded-sm bg-foreground/5 hover:text-foreground shrink-0 size-9 cursor-pointer"
                >
                  <EllipsisVertical className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* Add override dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader>
            <DialogTitle>New override</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Month">
              <DatePicker granularity="month" value={newMonth} onChange={setNewMonth} />
            </Field>
            <Field label="Start day">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                value={newStartDay}
                onChange={(e) => setNewStartDay(e.target.value)}
              />
            </Field>
            <Button
              onClick={submitAddOverride}
              disabled={pending || !isValidMonth(newMonth) || !isValidStartDay(newStartDay)}
              className="w-full"
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit override dialog */}
      <Dialog open={editingMonth !== null} onOpenChange={(v) => !v && setEditingMonth(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader>
            <DialogTitle>Edit override</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Month">
              <p className="h-12 w-full rounded-lg bg-foreground/3 px-3.5 text-sm mt-1 flex items-center capitalize">
                {editingMonth ? formatMonthLabel(editingMonth) : ""}
              </p>
            </Field>
            <Field label="Start day">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                value={editStartDay}
                onChange={(e) => setEditStartDay(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={submitEditOverride} disabled={pending || !isValidStartDay(editStartDay)} className="flex-1">
                <Check className="size-4 mr-1" />
                Save
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="size-12"
                onClick={() => editingMonth && removeOverride(editingMonth)}
              >
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
