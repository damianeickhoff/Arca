"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { ProgressRing } from "@/components/progress-ring";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/format";
import { BudgetStrategySliders, type BudgetStrategy } from "@/components/budget-strategy-sliders";
import type { BudgetCategoryRow, BudgetOverview, BudgetPeriod } from "@/lib/budget-overview";
import { FloatingAddButton } from "@/components/floating-add-button";
import { useBudgetHeaderActions } from "@/lib/budget-header-actions";
import { NumericKeypad } from "@/components/numeric-keypad";
import { AnimatedAmountDisplay } from "@/components/animated-amount-display";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useBudgetPortal } from "@/lib/budget-portal-state";
import {
  IconWallet,
  IconChevronLeft,
  IconX,
  IconPencil,
  IconTrash,
  IconAlertTriangleFilled,
  IconChevronRight,
  IconPlus,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";

const DEFAULT_BUDGET_MONTH = "0000-00";

const eur0 = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
function money(n: number) {
  return eur0.format(Math.round(n)).replace(/\s/g, "");
}

function fmtRange(from: string, to: string) {
  const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${f(from)} – ${f(to)}`;
}

/** Numpad digit-entry reducer shared by the overall-amount screen and the
 * single-category edit dialog. */
function nextAmountValue(cur: string, k: string): string {
  if (k === "back") return cur.length <= 1 ? "0" : cur.slice(0, -1);
  if (k === ",") return cur.includes(",") ? cur : `${cur},`;
  const next = cur === "0" ? k : cur + k;
  return next.replace(/^0+(?=\d)/, "");
}

// Same digit styling as the add-transaction keypad, for a consistent amount-entry feel.
const NUMPAD_DIGIT_CLASS = "h-13 rounded-2xl bg-foreground/5 text-2xl font-medium text-foreground flex items-center justify-center active:bg-foreground/10 transition-colors select-none";

function Numpad({ onKey, className }: { onKey: (k: string) => void; className?: string }) {
  return (
    <div className={className ?? "px-4"}>
      <NumericKeypad onKey={onKey} digitClassName={NUMPAD_DIGIT_CLASS} />
    </div>
  );
}

const PERIOD_OPTIONS = [
  { value: "weekly" as const, letter: "W", label: "Weekly" },
  { value: "monthly" as const, letter: "M", label: "Monthly" },
];

/** Segmented W/M period control — the selected side shows its letter badge plus the
 * full label inside a raised pill; the other side is just the muted letter badge. */
function PeriodToggle({ value, onChange }: { value: BudgetPeriod; onChange: (p: BudgetPeriod) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-card p-1">
      {PERIOD_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex items-center gap-2 rounded-full transition-all duration-200",
              active ? "bg-foreground/10 py-1 pl-1 pr-3.5" : "py-1 px-1",
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center size-7 rounded-lg text-xs font-bold shrink-0 transition-colors",
                active ? "bg-foreground/15 text-foreground" : "bg-foreground/8 text-foreground/45",
              )}
            >
              {opt.letter}
            </span>
            {active && <span className="text-sm font-semibold text-foreground whitespace-nowrap">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Semicircular gauge — track + orange/green fill, big centred amount. */
function Gauge({ pct, left, over }: { pct: number; left: number; over: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = over ? "var(--danger)" : clamped >= 80 ? "#f97316" : clamped >= 60 ? "#f59e0b" : "var(--success)";
  return (
    <div className="relative w-full">
      <svg viewBox="0 0 100 55" className="w-full">
        <path d="M 6 50 A 44 44 0 0 1 94 50" fill="none" stroke="var(--foreground)" strokeOpacity="0.12" strokeWidth="3" strokeLinecap="round" pathLength={100} />
        {/* A zero-length dash (clamped === 0) still paints a round-linecap dot at both
            ends of the path in some browsers, so skip the colored path entirely then —
            otherwise "0% used" shows two stray dots instead of just the gray track. */}
        {clamped > 0 && (
          <path
            d="M 6 50 A 44 44 0 0 1 94 50"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${clamped} 100`}
            style={{ transition: "stroke-dasharray 500ms ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <p className="text-sm text-foreground/60">{over ? "Over" : "Left"}</p>
        <p className="text-4xl font-semibold tabular-nums tracking-tight">{money(Math.abs(left))}</p>
        <p className="text-sm font-medium tabular-nums" style={{ color }}>{Math.round(pct)}% used</p>
      </div>
    </div>
  );
}

/** One category's draft-amount row in the "Manage categories" list. Sub-categories
 * render indented directly beneath their parent (see `topLevelCats`/`childrenByParent`
 * in BudgetPortal) so the hierarchy stays visible while still being flat, individually
 * budgetable rows. */
function CategoryAmountRow({
  cat,
  value,
  onChange,
  indent,
}: {
  cat: BudgetCategoryRow;
  value: string;
  onChange: (v: string) => void;
  indent?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl bg-card px-4 py-3", indent && "ml-8")}>
      <Icon iconKey={cat.icon} color={cat.color} size={indent ? "lg" : "xl"} round />
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{cat.categoryName}</p>
        <p className="text-xs text-foreground/50 tabular-nums">Last 30 days: {money(cat.last30)}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-foreground/50 text-sm">{currencySymbol()}</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9,]/g, ""))}
          placeholder="0"
          className="w-16 h-9 text-right bg-foreground/5 rounded-lg px-2 text-sm tabular-nums outline-none focus:ring-1 focus:ring-foreground/30"
        />
      </div>
    </div>
  );
}

/** Category-budgets step content — shared by both entry points into it: nested
 * inside the amount-step dialog when reached via Skip/Continue (`backIcon:
 * "chevron"`, closing it just pops back to the amount step), and as its own
 * top-level dialog when reached directly via "Manage"/"Add category budget"
 * from the saved overview (`backIcon: "close"`, nothing to pop back to). */
function CategoryBudgetsPanel({
  backIcon,
  onBack,
  parsedAmount,
  remainingPct,
  catTotal,
  topLevelCats,
  childrenByParent,
  catDraft,
  setCatDraft,
  resetAllToZero,
  save,
  saving,
}: {
  backIcon: "chevron" | "close";
  onBack: () => void;
  parsedAmount: number;
  remainingPct: number;
  catTotal: number;
  topLevelCats: BudgetCategoryRow[];
  childrenByParent: Map<number, BudgetCategoryRow[]>;
  catDraft: Record<number, string>;
  setCatDraft: Dispatch<SetStateAction<Record<number, string>>>;
  resetAllToZero: () => void;
  save: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col h-full bg-black">
      <div
        className="grid grid-cols-[auto_1fr_auto] items-center px-4 min-h-11 shrink-0 pb-4"
        style={{ paddingTop: "calc(20px + var(--sat))" }}
      >
        <button
          onClick={onBack}
          aria-label={backIcon === "close" ? "Close" : "Back"}
          className="glass-icon-btn size-11"
        >
          {backIcon === "close" ? <IconX className="size-5" /> : <IconChevronLeft className="size-5" />}
        </button>
        <h1 className="text-lg text-foreground text-center truncate">Category budgets</h1>
        <button
          type="button"
          onClick={resetAllToZero}
          className="h-11 px-4 rounded-full text-white bg-white/7 text-sm active:scale-95 transition-transform justify-self-end"
        >
          Reset
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
        <div className="rounded-2xl bg-card p-4">
          {parsedAmount > 0 ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <p className="text-xl font-bold tabular-nums">{Math.round(100 - remainingPct)}% allocated</p>
                <p className="text-sm text-foreground/50 tabular-nums shrink-0">{money(Math.max(0, parsedAmount - catTotal))} left</p>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#2f7bf6] transition-[width] duration-300"
                  style={{ width: `${Math.min(100, 100 - remainingPct)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-foreground/60">Total category budgets</p>
              <p className="text-2xl font-bold tabular-nums">{money(catTotal)}</p>
              <p className="text-xs text-foreground/50 mt-1">This total will become your overall budget limit.</p>
            </>
          )}
        </div>

        {topLevelCats.map((c) => (
          <div key={c.categoryId} className="space-y-2.5">
            <CategoryAmountRow
              cat={c}
              value={catDraft[c.categoryId] ?? ""}
              onChange={(v) => setCatDraft((d) => ({ ...d, [c.categoryId]: v }))}
            />
            {(childrenByParent.get(c.categoryId) ?? []).map((child) => (
              <CategoryAmountRow
                key={child.categoryId}
                cat={child}
                value={catDraft[child.categoryId] ?? ""}
                onChange={(v) => setCatDraft((d) => ({ ...d, [child.categoryId]: v }))}
                indent
              />
            ))}
          </div>
        ))}
      </div>

      <div className="px-4 pt-3 pb-[calc(0.75rem+var(--sab))] shrink-0">
        <button
          onClick={save}
          disabled={saving}
          className="w-full h-14 rounded-full bg-foreground text-background font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/** The same top color wash used by every sheet/dialog with an accent color
 * (see DialogContent's accentColor prop) — reproduced here since these overlays
 * aren't built on that shared component. */
function ColorWash({ color }: { color: string | null }) {
  if (!color) return null;
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 h-52 pointer-events-none"
      style={{ background: `linear-gradient(to bottom, ${color}26, transparent)` }}
    />
  );
}

type FlowStep = "amount" | "categories" | null;
// How the "categories" step was reached — controls whether its header shows a
// back-chevron (continuing the create/edit flow from step 1) or a close button
// (opened directly from "Manage"/"Add category budget", so it should just close).
type CategoriesEntry = "flow" | "direct";

interface ExceedWarning {
  requiredOverall: number;
  onConfirm: () => void;
}

export function BudgetPortal({ data }: { data: BudgetOverview }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [step, setStep] = useState<FlowStep>(null);
  const [categoriesEntry, setCategoriesEntry] = useState<CategoriesEntry>("flow");
  const [saving, setSaving] = useState(false);
  // `strategyOpen` keeps the popup mounted through its exit animation; `strategyVisible`
  // drives the animated transform/opacity, flipped a frame after mount so the initial
  // (off-screen) state is committed first — same pattern as SettingsDialog's sub-panels.
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [strategyVisible, setStrategyVisible] = useState(false);
  // Local draft edited by the sliders while the popup is open — nothing is persisted
  // until "Save" is pressed, so closing via the backdrop or the X discards it.
  const [strategyDraft, setStrategyDraft] = useState<BudgetStrategy>(data.strategy);
  const [exceedWarning, setExceedWarning] = useState<ExceedWarning | null>(null);

  // Draft state for the create/edit flow
  const [amount, setAmount] = useState("0");
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
  const [strategy, setStrategy] = useState<BudgetStrategy>(data.strategy);
  const [catDraft, setCatDraft] = useState<Record<number, string>>({});

  // Single-category quick-edit dialog (tapping a row in the saved overview)
  const [editingCat, setEditingCat] = useState<BudgetCategoryRow | null>(null);
  const [editAmount, setEditAmount] = useState("0");

  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0;
  const catTotal = data.categories.reduce((s, c) => s + (parseFloat((catDraft[c.categoryId] ?? "").replace(",", ".")) || 0), 0);
  const remainingPct = parsedAmount > 0 ? Math.max(0, Math.min(100, ((parsedAmount - catTotal) / parsedAmount) * 100)) : 0;

  // Top-level categories with their sub-categories grouped underneath, for the
  // "Manage categories" list — every category (both levels) is individually budgetable.
  const topLevelCats = useMemo(() => data.categories.filter((c) => c.parentCategoryId == null), [data.categories]);
  const childrenByParent = useMemo(() => {
    const m = new Map<number, BudgetCategoryRow[]>();
    for (const c of data.categories) {
      if (c.parentCategoryId == null) continue;
      const arr = m.get(c.parentCategoryId) ?? [];
      arr.push(c);
      m.set(c.parentCategoryId, arr);
    }
    return m;
  }, [data.categories]);

  function resetAllToZero() {
    setCatDraft(Object.fromEntries(data.categories.map((c) => [c.categoryId, "0"])));
  }

  // Strategy-based advised spendable budget: the Needs + Wants share of income.
  const advised = Math.round((data.income * (strategy.nodig + strategy.willen)) / 100);
  const strategySet = strategy.nodig + strategy.willen + strategy.sparen === 100 && data.income > 0;

  function resetCatDraft() {
    setCatDraft(Object.fromEntries(data.categories.filter((c) => c.budget != null).map((c) => [c.categoryId, String(Math.round(c.budget!))])));
  }

  // Entry point 1: empty-state "Create budget" button, or the pencil "Edit budget"
  // button — walks step 1 (overall amount) then step 2 (categories).
  function openCreateOrEditFlow() {
    if (data.budget) {
      setAmount(data.budget.amount > 0 ? String(Math.round(data.budget.amount)) : "0");
      setPeriod(data.budget.period);
    } else {
      setAmount("0");
      setPeriod("monthly");
    }
    resetCatDraft();
    setCategoriesEntry("flow");
    setStep("amount");
  }

  // Entry point 2: "Manage" / "Add category budget" — jumps straight to the
  // category list; its header shows a close (X), not a back-chevron.
  function openManageCategories() {
    resetCatDraft();
    setCategoriesEntry("direct");
    setStep("categories");
  }

  // The dashboard's "no budget" card opens this portal wanting the create flow
  // directly, skipping the empty-state landing screen below.
  const { autoCreate, clearAutoCreate } = useBudgetPortal();
  useEffect(() => {
    if (!autoCreate) return;
    openCreateOrEditFlow();
    clearAutoCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openCreateOrEditFlow/clearAutoCreate only close over stable setters and `data`
  }, [autoCreate]);

  function openCategoryEdit(cat: BudgetCategoryRow) {
    setEditingCat(cat);
    setEditAmount(cat.budget != null && cat.budget > 0 ? String(Math.round(cat.budget)) : "0");
  }

  async function saveStrategy(next: BudgetStrategy) {
    setStrategy(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "budget_strategy", value: JSON.stringify(next) }),
    });
  }

  function openStrategyPicker() {
    setStrategyDraft(strategy);
    setStrategyOpen(true);
    requestAnimationFrame(() => setStrategyVisible(true));
  }
  // Closes without saving — used by the backdrop and the X button. Only the
  // Save button (gated on the draft summing to 100%) actually persists it.
  function closeStrategyPicker() {
    setStrategyVisible(false);
    setTimeout(() => setStrategyOpen(false), 300);
  }
  function confirmStrategy() {
    if (strategyDraft.nodig + strategyDraft.willen + strategyDraft.sparen !== 100) return;
    saveStrategy(strategyDraft);
    closeStrategyPicker();
  }

  async function saveCategoryTarget(categoryId: number, value: number) {
    return fetch("/api/budget-targets", {
      method: value > 0 ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        value > 0
          ? { categoryId, month: DEFAULT_BUDGET_MONTH, targetAmount: value }
          : { categoryId, month: DEFAULT_BUDGET_MONTH },
      ),
    });
  }

  async function saveOverall(overallAmount: number, overallPeriod: BudgetPeriod, allCategoriesZero: boolean) {
    if (overallAmount === 0 && allCategoriesZero) {
      await fetch("/api/budget", { method: "DELETE" });
    } else {
      await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: overallAmount, period: overallPeriod }),
      });
    }
  }

  async function save() {
    // A literal 0 overall means "no overall limit" set from this screen — if a real
    // overall limit already exists, category budgets can't be saved past it (see the
    // exceed-budget guard below); with no overall limit at all, anything goes.
    if (parsedAmount > 0 && catTotal > parsedAmount) {
      setExceedWarning({
        requiredOverall: catTotal,
        onConfirm: async () => {
          setSaving(true);
          await saveOverall(catTotal, period, catTotal === 0);
          await Promise.all(data.categories.map((c) => saveCategoryTarget(c.categoryId, parseFloat((catDraft[c.categoryId] ?? "").replace(",", ".")) || 0)));
          setSaving(false);
          setExceedWarning(null);
          setStep(null);
          router.refresh();
        },
      });
      return;
    }
    setSaving(true);
    await saveOverall(parsedAmount, period, catTotal === 0);
    await Promise.all(
      data.categories.map((c) => {
        const raw = catDraft[c.categoryId] ?? "";
        const val = parseFloat(raw.replace(",", ".")) || 0;
        return saveCategoryTarget(c.categoryId, val);
      }),
    );
    setSaving(false);
    setStep(null);
    router.refresh();
  }

  async function deleteBudget() {
    if (!confirm("Delete this budget? Category budgets will be cleared too.")) return;
    setSaving(true);
    await fetch("/api/budget", { method: "DELETE" });
    setSaving(false);
    router.refresh();
  }

  async function saveEditingCategory() {
    if (!editingCat) return;
    const val = parseFloat(editAmount.replace(",", ".")) || 0;
    const overallAmount = data.budget?.amount ?? 0;

    if (overallAmount > 0) {
      const otherTotal = data.categories
        .filter((c) => c.categoryId !== editingCat.categoryId)
        .reduce((s, c) => s + (c.budget ?? 0), 0);
      const newTotal = otherTotal + val;
      if (newTotal > overallAmount) {
        setExceedWarning({
          requiredOverall: newTotal,
          onConfirm: async () => {
            setSaving(true);
            await saveOverall(newTotal, data.budget!.period, false);
            await saveCategoryTarget(editingCat.categoryId, val);
            setSaving(false);
            setExceedWarning(null);
            setEditingCat(null);
            router.refresh();
          },
        });
        return;
      }
    }

    setSaving(true);
    await saveCategoryTarget(editingCat.categoryId, val);
    setSaving(false);
    setEditingCat(null);
    router.refresh();
  }

  async function deleteEditingCategory() {
    if (!editingCat) return;
    if (!confirm(`Remove the budget for ${editingCat.categoryName}?`)) return;
    setSaving(true);
    await saveCategoryTarget(editingCat.categoryId, 0);
    setSaving(false);
    setEditingCat(null);
    router.refresh();
  }

  // ── Overview numbers ──
  // A literal 0 overall amount means no overall limit was set — in that case the
  // "budget" is just whatever's allocated across individual categories, and only
  // spend within those budgeted categories counts (not every variable category).
  const hasOverall = (data.budget?.amount ?? 0) > 0;
  const amountLimit = hasOverall ? data.budget!.amount : data.allocated;
  const used = hasOverall ? data.totalSpent : data.budgetedSpent;
  const left = amountLimit - used;
  const pct = amountLimit > 0 ? (used / amountLimit) * 100 : 0;
  const over = left < 0;
  const leftToAllocate = hasOverall ? amountLimit - data.allocated : 0;
  const totalDays = Math.max(1, Math.round((new Date(`${data.to}T12:00:00`).getTime() - new Date(`${data.from}T12:00:00`).getTime()) / 86_400_000) + 1);
  const elapsedPct = ((totalDays - data.daysLeft) / totalDays) * 100;
  const pacingBehind = amountLimit > 0 && pct > elapsedPct + 10 && !over;

  // The edit/delete buttons render in the portal's own fixed header (owned by
  // DashboardHeaderBar), not here — this publishes them into that header's slot.
  // Memoized on `data` (not recreated as a fresh element every render): the publish
  // happens via a context setState in an effect, so an unmemoized node here would
  // change identity every render, re-trigger the effect, and loop forever.
  const headerActions = useMemo(() => (
    data.budget ? (
      <>
        <button onClick={openCreateOrEditFlow} aria-label="Edit budget" className="glass-icon-btn size-11">
          <IconPencil className="size-5" />
        </button>
        <button onClick={deleteBudget} aria-label="Delete budget" className="glass-icon-btn size-11">
          <IconTrash className="size-5" />
        </button>
      </>
    ) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openCreateOrEditFlow/deleteBudget only close over stable setters and `data`, which is already a dep
  ), [data]);
  useBudgetHeaderActions(headerActions);

  return (
    <div className="pb-[calc(6rem+var(--sab))]">
      {/* ─────────────── EMPTY STATE ─────────────── */}
      {!data.budget && (
        <div className="flex flex-col items-center justify-center text-center px-8" style={{ minHeight: "60vh" }}>
          <div className="size-16 rounded-xl bg-[var(--icon-muted)] border border-white/5 flex items-center justify-center mb-6 -rotate-10">
            <IconWallet className="size-8 text-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-2">No budget set</h2>
          <p className="text-foreground/55 text-sm max-w-xs">Create a budget to track your spending and stay on top of your finances.</p>
        </div>
      )}

      {!data.budget && (
        <FloatingAddButton
          onClick={openCreateOrEditFlow}
          label="Create budget"
          ariaLabel="Create budget"
        />
      )}

      {/* ─────────────── SAVED OVERVIEW ─────────────── */}
      {data.budget && (
        <div className="px-4 space-y-4">
          {pacingBehind && (
            <div className="flex items-start gap-3 rounded-2xl bg-card p-4">
              <IconAlertTriangleFilled className="size-5 shrink-0 text-orange-500 mt-0.5" />
              <p className="text-sm text-foreground/80">Spending a bit faster than planned. Keep an eye on it.</p>
            </div>
          )}

          {/* Gauge card */}
          <div className="rounded-2xl bg-card p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm text-foreground/60 capitalize">{data.budget.period}</p>
                <p className="font-semibold">{fmtRange(data.from, data.to)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-foreground/60">Days left</p>
                <p className="font-semibold">{data.daysLeft} days</p>
              </div>
            </div>

            <Gauge pct={pct} left={left} over={over} />

            <div className="flex items-end justify-between mt-2">
              <div>
                <p className="text-sm text-foreground/60">{hasOverall ? "Amount" : "Allocated"}</p>
                <p className="font-semibold tabular-nums">{money(amountLimit)}</p>
              </div>
              {hasOverall ? (
                <div className="text-right">
                  <p className="text-sm text-foreground/60">Left to allocate</p>
                  <p className="font-semibold tabular-nums">{money(leftToAllocate)}</p>
                </div>
              ) : (
                <div className="text-right">
                  <p className="text-sm text-foreground/60">Budgeted categories</p>
                  <p className="font-semibold tabular-nums">{data.categories.filter((c) => c.budget != null && c.budget > 0).length}</p>
                </div>
              )}
            </div>
          </div>

          {/* Category budgets */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <h3 className="text-lg font-bold">Category budgets</h3>
              <p className="text-sm text-foreground/55 tabular-nums">{money(data.allocated)} total</p>
            </div>
            <button onClick={openManageCategories} className="h-10 px-4 rounded-full bg-card font-semibold text-sm active:scale-95 transition-transform">
              Manage
            </button>
          </div>

          <div className="space-y-2.5">
            {data.categories.filter((c) => c.budget != null && c.budget > 0).map((c) => {
              const cLeft = (c.budget ?? 0) - c.spent;
              const cPct = c.budget && c.budget > 0 ? Math.max(0, Math.min(100, (c.spent / c.budget) * 100)) : 0;
              const cOver = cLeft < 0;
              const ring = cOver ? "var(--danger)" : (c.color ?? "var(--primary)");
              return (
                <button
                  key={c.categoryId}
                  type="button"
                  onClick={() => openCategoryEdit(c)}
                  className="w-full flex items-center gap-4 rounded-2xl bg-card px-4 py-3 text-left active:bg-foreground/[0.03] transition-colors"
                >
                  <ProgressRing pct={cPct} color={ring}>
                    <Icon iconKey={c.icon} color={c.color} size="lg" round />
                  </ProgressRing>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{c.categoryName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("font-semibold tabular-nums", cOver && "text-red-500")}>{money(Math.abs(cLeft))} {cOver ? "over" : "left"}</p>
                    <p className="text-xs text-foreground/50 tabular-nums">of {money(c.budget ?? 0)}</p>
                  </div>
                </button>
              );
            })}

            {/* Add category budget */}
            <button onClick={openManageCategories} className="w-full flex items-center gap-4 rounded-2xl bg-card px-4 py-3 text-left active:bg-foreground/[0.03] transition-colors">
              <div className="size-12 rounded-full bg-foreground/8 flex items-center justify-center shrink-0">
                <IconPlus className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Add category budget</p>
                {hasOverall && (
                  <p className="text-xs text-foreground/50 tabular-nums">{money(Math.max(0, leftToAllocate))} left to allocate</p>
                )}
              </div>
              <IconChevronRight className="size-5 text-foreground/40 shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* The flow overlay, the single-category dialog, and the exceed-budget warning
          all portal straight to <body>. They're triggered from deep inside a chain of
          fixed/transformed/scrollable ancestors (the dashboard header's own portal
          wrapper); a `transform` on any of those redefines the containing block for
          `position: fixed` descendants and lets an intermediate `overflow-y-auto`
          clip and misposition them, which also breaks their hit-testing. Portalling to
          <body> escapes all of that and guarantees true-viewport fixed positioning. */}
      {mounted && createPortal(
        <>
          {/* ─────────────── SINGLE-CATEGORY QUICK EDIT ─────────────── */}
          {editingCat && (
            <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ paddingTop: "var(--sat)", pointerEvents: "auto" }}>
              <ColorWash color={editingCat.color} />
              <div className="relative flex items-center justify-between px-4 h-14 shrink-0">
                <button onClick={() => setEditingCat(null)} aria-label="Close" className="glass-icon-btn size-11">
                  <IconX className="size-5" />
                </button>
                <div className="flex items-center gap-2 min-w-0 max-w-[55%]">
                  <Icon iconKey={editingCat.icon} color={editingCat.color} size="sm" round />
                  <h1 className="font-bold text-lg truncate">{editingCat.categoryName}</h1>
                </div>
                <button onClick={deleteEditingCategory} aria-label="Remove budget" className="glass-icon-btn size-11">
                  <IconTrash className="size-5" />
                </button>
              </div>

              <div className="relative flex-1 flex flex-col items-center justify-center px-6 text-center">
                <p className="text-foreground/60 mb-4">Set a budget for this category</p>
                <p className="text-6xl font-semibold tracking-tight tabular-nums">
                  <AnimatedAmountDisplay value={editAmount} prefixClassName="text-foreground/40 mr-1" />
                </p>
                <p className="text-foreground/50 text-sm mt-4">Last 30 days: {money(editingCat.last30)}</p>
              </div>

              <Numpad onKey={(k) => setEditAmount((cur) => nextAmountValue(cur, k))} />

              <div className="px-4 pt-3 pb-[calc(0.75rem+var(--sab))]">
                <button
                  onClick={saveEditingCategory}
                  disabled={saving}
                  className="w-full h-14 rounded-full bg-foreground text-background font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* ─────────────── BUDGET STRATEGY POPUP ─────────────── */}
          {/* Rendered here (not nested inside the amount-step Dialog below) since
              its own fixed positioning would otherwise be scoped by the Drawer's
              animated transform — same reasoning as the block comment above.
              Vaul's Drawer is built on Radix Dialog, which sets `body.style.pointerEvents
              = "none"` while a modal dialog is open (re-enabling it only on the Drawer's
              own Content element) — this popup is a sibling portal, not a descendant of
              that Content, so it inherits the lock and silently swallows all clicks
              unless it opts back in with its own `pointerEvents: "auto"` below. Radix's
              outside-click dismissal has the same blind spot in reverse: a tap on this
              popup's own backdrop reads as "outside" the amount-step Drawer too and would
              close that whole page along with the popup — `data-dialog-keep-open` (read by
              the Drawer's onPointerDownOutside in ui/dialog.tsx) opts the whole popup out
              of that dismissal so only its own onClick-to-close fires. Edits are staged in
              `strategyDraft` and only reach the server via the Save button (disabled until
              the draft sums to 100%) — the backdrop and the X both discard it instead. */}
          {strategyOpen && (
            <div
              data-dialog-keep-open
              className="fixed inset-0 flex items-end justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out"
              style={{ zIndex: 60, pointerEvents: "auto", opacity: strategyVisible ? 1 : 0 }}
              onClick={closeStrategyPicker}
            >
              <div
                className="w-full bg-[#1f1f1f]/70 backdrop-blur-3xl rounded-t-3xl p-5 pb-[calc(1.25rem+var(--sab))] transition-transform duration-300 ease-out"
                style={{ transform: strategyVisible ? "translateY(0)" : "translateY(100%)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="font-semibold text-base">Budget strategy</h2>
                    <p className="text-xs text-foreground/55">How your income splits across Needs, Wants, and Savings.</p>
                    <p className="text-xs text-foreground/55">Commonly used is 50/25/25.</p>
                  </div>
                  <button onClick={closeStrategyPicker} aria-label="Close" className="size-11 rounded-full bg-white/7 flex items-center justify-center">
                    <IconX className="size-5" />
                  </button>
                </div>
                <BudgetStrategySliders value={strategyDraft} onChange={setStrategyDraft} />
                {data.income > 0 && (
                  <p className="text-xs text-center text-foreground/55 mt-4">
                    Advised budget: <span className="font-semibold text-foreground">
                      {money(Math.round((data.income * (strategyDraft.nodig + strategyDraft.willen)) / 100))}
                    </span> ({strategyDraft.nodig + strategyDraft.willen}% of {money(data.income)} income)
                  </p>
                )}
                <button
                  onClick={confirmStrategy}
                  disabled={strategyDraft.nodig + strategyDraft.willen + strategyDraft.sparen !== 100}
                  className="w-full h-12 mt-5 rounded-full bg-white text-black font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* ─────────────── EXCEED-BUDGET WARNING ─────────────── */}
          {/* Same sibling-portal caveats as the strategy popup above: needs its own
              `pointerEvents: "auto"` (Radix's body-level lock) and `data-dialog-keep-open`
              (so a backdrop tap only closes this, not the Drawer behind it) too. */}
          {exceedWarning && (
            <div
              data-dialog-keep-open
              className="fixed inset-0 flex items-end justify-center bg-black/40 backdrop-blur-sm"
              style={{ zIndex: 70, pointerEvents: "auto" }}
              onClick={() => setExceedWarning(null)}
            >
              <div className="w-full max-w-md bg-background/90 backdrop-blur-xl rounded-t-3xl p-5 pb-[calc(1.25rem+var(--sab))]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-3">
                  <IconAlertTriangleFilled className="size-6 text-warning shrink-0" />
                  <h2 className="font-semibold text-base">Category budgets exceed your overall budget</h2>
                </div>
                <p className="text-sm text-foreground/70 mb-5">
                  Your category budgets add up to {money(exceedWarning.requiredOverall)}, more than your overall budget of {money(data.budget?.amount ?? 0)}. Increase the overall budget to {money(exceedWarning.requiredOverall)}, or cancel and lower the category amount instead.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => exceedWarning.onConfirm()}
                    disabled={saving}
                    className="w-full h-12 rounded-full bg-foreground text-background font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    Increase overall to {money(exceedWarning.requiredOverall)}
                  </button>
                  <button
                    onClick={() => setExceedWarning(null)}
                    className="w-full h-12 rounded-full bg-card font-semibold text-sm active:scale-[0.98] transition-transform"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body,
      )}

      {/* ─────────────── CREATE / EDIT FLOW — step 1: overall amount ───────────────
          Full-height dialog (same shell as every other add/edit dialog in the app).
          Skip/Continue opens step 2 as a Dialog nested *inside* this one — base-ui's
          Drawer.NestedRoot (wired up by DialogContent/NestedDialogContext) stacks it
          iOS-style: the amount step scales back and dims behind the category-budgets
          sheet instead of the two swapping places. */}
      <Dialog
        open={step === "amount" || (step === "categories" && categoriesEntry === "flow")}
        onOpenChange={(o) => { if (!o) setStep(null); }}
      >
        <DialogContent fullHeight hideHandle hideHeaderRow title="Budget" className="p-0 gap-0 overflow-hidden">
          <div className="flex flex-col h-full bg-background">
            {/* Header — same shape as the add-transaction header: close (left), the
                period toggle where the title would sit (center, like add-transaction's
                expense/income/transfer toggle), a secondary action (right). */}
            <div className="flex items-center justify-between px-4 pt-[calc(var(--sat)+20px)] pb-2 shrink-0">
              <button onClick={() => setStep(null)} aria-label="Close" className="glass-icon-btn size-11">
                <IconX className="size-5" />
              </button>
              <PeriodToggle value={period} onChange={setPeriod} />
              <button onClick={openStrategyPicker} aria-label="Budget strategy" className="glass-icon-btn size-11">
                <IconAdjustmentsHorizontal className="size-5" />
              </button>
            </div>

            {/* One card holding the amount and the keypad — same shell as
                add-transaction's card (account pill + amount + keypad). */}
            <div className="flex-1 flex flex-col min-h-0 mx-4 mb-3 rounded-3xl bg-foreground/[0.03] p-4">
              <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-2 text-center">
                <p className="text-foreground/60 mb-4">Set your overall budget limit for this period</p>
                <div className="text-6xl font-semibold tracking-tight tabular-nums">
                  <AnimatedAmountDisplay value={amount} prefixClassName="text-foreground/40 mr-1" />
                </div>
                <p className="text-foreground/50 text-sm mt-4">
                  {period === "weekly" ? `Last 7 days: ${money(data.last7Total)}` : `Last 30 days: ${money(data.last30Total)}`}
                </p>
                {strategySet && (
                  <button onClick={() => setAmount(String(advised))} className="mt-3 px-3 py-1.5 rounded-full bg-foreground/6 text-sm font-medium active:scale-95 transition-transform">
                    Advised: {money(advised)}
                  </button>
                )}
              </div>

              <Numpad className="shrink-0" onKey={(k) => setAmount((cur) => nextAmountValue(cur, k))} />
            </div>

            {/* CTA */}
            <div className="px-5 pb-[calc(var(--sab)+1.25rem)] shrink-0">
              <button
                onClick={() => { setCategoriesEntry("flow"); setStep("categories"); }}
                className="w-full h-14 rounded-full bg-foreground text-background font-semibold text-base active:scale-[0.98] transition-transform"
              >
                {parsedAmount === 0 ? "Skip" : "Continue"}
              </button>
              <p className="text-center text-xs text-foreground/45 mt-2">You can skip and set category budgets next</p>
            </div>
          </div>

          {/* STEP 2 — category budgets, nested (iOS-style stacked) dialog */}
          <Dialog
            open={step === "categories" && categoriesEntry === "flow"}
            onOpenChange={(o) => { if (!o) setStep("amount"); }}
          >
            <DialogContent fullHeight hideHandle hideHeaderRow title="Category budgets" className="p-0 gap-0 overflow-hidden">
              <CategoryBudgetsPanel
                backIcon="chevron"
                onBack={() => setStep("amount")}
                parsedAmount={parsedAmount}
                remainingPct={remainingPct}
                catTotal={catTotal}
                topLevelCats={topLevelCats}
                childrenByParent={childrenByParent}
                catDraft={catDraft}
                setCatDraft={setCatDraft}
                resetAllToZero={resetAllToZero}
                save={save}
                saving={saving}
              />
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>

      {/* Direct entry — "Manage" / "Add category budget" from the saved overview:
          its own top-level full-height dialog, no amount step behind it. */}
      <Dialog
        open={step === "categories" && categoriesEntry === "direct"}
        onOpenChange={(o) => { if (!o) setStep(null); }}
      >
        <DialogContent fullHeight hideHandle hideHeaderRow title="Category budgets" className="p-0 gap-0 overflow-hidden">
          <CategoryBudgetsPanel
            backIcon="close"
            onBack={() => setStep(null)}
            parsedAmount={parsedAmount}
            remainingPct={remainingPct}
            catTotal={catTotal}
            topLevelCats={topLevelCats}
            childrenByParent={childrenByParent}
            catDraft={catDraft}
            setCatDraft={setCatDraft}
            resetAllToZero={resetAllToZero}
            save={save}
            saving={saving}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
