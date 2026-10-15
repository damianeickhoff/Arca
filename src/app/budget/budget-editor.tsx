"use client";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconChevronLeft,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { SHEET_COLUMN } from "@/components/page-container";
import { currencySymbol, formatEurWhole } from "@/lib/format";
import { BudgetStrategySliders, type BudgetStrategy } from "@/components/budget-strategy-sliders";
import type { BudgetCategoryRow, BudgetOverview, BudgetPeriod } from "@/lib/budget-overview";
import { NumericKeypad } from "@/components/numeric-keypad";
import { AnimatedAmountDisplay } from "@/components/animated-amount-display";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/ui/category-icon";
import { ContextualTip } from "@/components/contextual-tip";
import { useEscapeToClose } from "@/lib/use-escape-to-close";

// The budget's create/edit flows — the overall amount on a numpad, the category budgets
// list, the single-category numpad, the 50/25/25 strategy sheet and the "category
// budgets exceed the overall budget" warning. They used to live inside the Budget
// portal next to its own overview; the /budget page is now that overview, and opens
// these through useBudgetEditor() from wherever its buttons sit.

const DEFAULT_BUDGET_MONTH = "0000-00";

/** Numpad digit-entry reducer shared by the overall-amount screen and the
 *  single-category screen. */
function nextAmountValue(cur: string, k: string): string {
  if (k === "back") return cur.length <= 1 ? "0" : cur.slice(0, -1);
  if (k === ",") return cur.includes(",") ? cur : `${cur},`;
  const next = cur === "0" ? k : cur + k;
  return next.replace(/^0+(?=\d)/, "");
}

const NUMPAD_DIGIT_CLASS =
  "h-13 rounded-tile bg-surface-2 text-2xl font-medium text-ink flex items-center justify-center active:bg-line transition-colors select-none";

function Numpad({ onKey, onEnter, className }: { onKey: (k: string) => void; onEnter?: () => void; className?: string }) {
  return (
    <div className={className ?? "px-4"}>
      <NumericKeypad onKey={onKey} onEnter={onEnter} digitClassName={NUMPAD_DIGIT_CLASS} />
    </div>
  );
}

const ICON_BTN =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-surface-2";
const PRIMARY_BTN =
  "w-full h-14 rounded-full bg-ink text-bg font-bold text-base active:scale-[0.98] transition-transform disabled:opacity-50";

/** Weekly | Monthly, as the house segmented control. */
function PeriodToggle({ value, onChange }: { value: BudgetPeriod; onChange: (p: BudgetPeriod) => void }) {
  const t = useTranslations("budget");
  return (
    <div className="inline-flex gap-0.5 rounded-full bg-surface-2 p-[3px]">
      {(["weekly", "monthly"] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={cn(
            "inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors",
            value === p ? "bg-ink text-bg" : "text-ink-2 hover:text-ink",
          )}
        >
          {t(`period.${p}`)}
        </button>
      ))}
    </div>
  );
}

/** One category's draft amount in the category budgets list. Sub-categories sit
 *  indented under their parent; every category (both levels) can have its own budget. */
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
  const t = useTranslations("budget");
  return (
    <div className={cn("flex items-center gap-3 rounded-row border border-line bg-surface px-4 py-3", indent && "ml-8")}>
      <CategoryIcon icon={cat.icon} color={cat.color} size={indent ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{cat.categoryName}</p>
        <p className="text-xs tabular-nums text-ink-3">{t("last30", { amount: formatEurWhole(cat.last30) })}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-sm text-ink-3">{currencySymbol()}</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9,]/g, ""))}
          placeholder="0"
          aria-label={cat.categoryName}
          className="h-9 w-20 rounded-tile bg-surface-2 px-2 text-right text-sm tabular-nums text-ink outline-none focus:ring-2 focus:ring-mustard/50"
        />
      </div>
    </div>
  );
}

/** The category budgets step — reached from the amount step (back chevron) or directly
 *  from "Manage" / "Add a category budget" (close button). */
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
  const t = useTranslations("budget");
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="grid min-h-11 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 px-4 pb-4 pt-[calc(20px+var(--sat))]">
        <button onClick={onBack} aria-label={backIcon === "close" ? t("close") : t("back")} className={ICON_BTN}>
          {backIcon === "close" ? <IconX className="size-5" /> : <IconChevronLeft className="size-5" />}
        </button>
        <h1 className="heading truncate text-center text-lg text-ink">{t("categoryBudgets")}</h1>
        <button
          type="button"
          onClick={resetAllToZero}
          className="h-10 justify-self-end rounded-full bg-negative-soft px-4 text-[13px] font-bold text-negative active:scale-95 transition-transform"
        >
          {t("reset")}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4">
        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          {parsedAmount > 0 ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <p className="amount text-xl tabular-nums text-ink">{t("allocatedPct", { pct: Math.round(100 - remainingPct) })}</p>
                <p className="shrink-0 text-sm tabular-nums text-ink-3">{t("amountLeft", { amount: formatEurWhole(Math.max(0, parsedAmount - catTotal)) })}</p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-mustard transition-[width] duration-300" style={{ width: `${Math.min(100, 100 - remainingPct)}%` }} />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-2">{t("totalCategoryBudgets")}</p>
              <p className="amount text-2xl tabular-nums text-ink">{formatEurWhole(catTotal)}</p>
              <p className="mt-1 text-xs text-ink-3">{t("totalBecomesLimit")}</p>
            </>
          )}
        </div>

        {topLevelCats.map((c) => (
          <div key={c.categoryId} className="space-y-2.5">
            <CategoryAmountRow cat={c} value={catDraft[c.categoryId] ?? ""} onChange={(v) => setCatDraft((d) => ({ ...d, [c.categoryId]: v }))} />
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

      <div className="shrink-0 px-4 pb-[calc(0.75rem+var(--sab))] pt-3">
        <button onClick={save} disabled={saving} className={PRIMARY_BTN}>
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}

type FlowStep = "amount" | "categories" | null;
// How the categories step was reached: from the amount step ("flow", back chevron) or
// straight from the page ("direct", close button).
type CategoriesEntry = "flow" | "direct";

interface ExceedWarning {
  requiredOverall: number;
  onConfirm: () => void;
}

export interface BudgetEditorApi {
  /** Create a budget, or edit the overall amount, period and category budgets. */
  openEdit: () => void;
  /** Straight to the category budgets list. */
  openManage: () => void;
  /** The Needs / Wants / Savings split. */
  openStrategy: () => void;
  /** One category's budget on a numpad. */
  openCategory: (categoryId: number) => void;
  deleteBudget: () => void;
  /** Move part of one category's budget to another (the over-budget suggestion). */
  moveBudget: (fromId: number, toId: number, amount: number) => Promise<void>;
  busy: boolean;
}

const BudgetEditorContext = createContext<BudgetEditorApi | null>(null);

export function useBudgetEditor() {
  const ctx = useContext(BudgetEditorContext);
  if (!ctx) throw new Error("useBudgetEditor must be used within BudgetEditorProvider");
  return ctx;
}

export function BudgetEditorProvider({ data, children }: { data: BudgetOverview; children: ReactNode }) {
  const router = useRouter();
  const t = useTranslations("budget");
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the body portal can't render until after mount
  useEffect(() => { setMounted(true); }, []);

  const [step, setStep] = useState<FlowStep>(null);
  const [categoriesEntry, setCategoriesEntry] = useState<CategoriesEntry>("flow");
  const [saving, setSaving] = useState(false);
  // `strategyOpen` keeps the sheet mounted through its exit animation; `strategyVisible`
  // drives the transform, flipped a frame after mount so the off-screen state commits first.
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [strategyVisible, setStrategyVisible] = useState(false);
  // Edited by the sliders; nothing is saved until Save, so the backdrop and X discard it.
  const [strategyDraft, setStrategyDraft] = useState<BudgetStrategy>(data.strategy);
  const [exceedWarning, setExceedWarning] = useState<ExceedWarning | null>(null);

  // Draft state for the create/edit flow
  const [amount, setAmount] = useState("0");
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
  const [catDraft, setCatDraft] = useState<Record<number, string>>({});

  // Single-category numpad
  const [editingCat, setEditingCat] = useState<BudgetCategoryRow | null>(null);
  const [editAmount, setEditAmount] = useState("0");

  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0;
  const catTotal = data.categories.reduce((s, c) => s + (parseFloat((catDraft[c.categoryId] ?? "").replace(",", ".")) || 0), 0);
  const remainingPct = parsedAmount > 0 ? Math.max(0, Math.min(100, ((parsedAmount - catTotal) / parsedAmount) * 100)) : 0;

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

  // Strategy-based advised spendable budget: the Needs + Wants share of income.
  const strategy = data.strategy;
  const advised = Math.round((data.income * (strategy.nodig + strategy.willen)) / 100);
  const strategySet = strategy.nodig + strategy.willen + strategy.sparen === 100 && data.income > 0;

  function resetAllToZero() {
    setCatDraft(Object.fromEntries(data.categories.map((c) => [c.categoryId, "0"])));
  }
  function resetCatDraft() {
    setCatDraft(Object.fromEntries(data.categories.filter((c) => c.budget != null).map((c) => [c.categoryId, String(Math.round(c.budget!))])));
  }

  function openEdit() {
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

  function openManage() {
    resetCatDraft();
    setCategoriesEntry("direct");
    setStep("categories");
  }

  function openCategory(categoryId: number) {
    const cat = data.categories.find((c) => c.categoryId === categoryId);
    if (!cat) return;
    setEditingCat(cat);
    setEditAmount(cat.budget != null && cat.budget > 0 ? String(Math.round(cat.budget)) : "0");
  }

  // Both sit above the amount-step sheet (body portals), so they take Escape first.
  useEscapeToClose(exceedWarning != null, () => setExceedWarning(null), { aboveDialog: true });
  useEscapeToClose(strategyOpen, closeStrategy, { aboveDialog: true });

  function openStrategy() {
    setStrategyDraft(data.strategy);
    setStrategyOpen(true);
    requestAnimationFrame(() => setStrategyVisible(true));
  }
  function closeStrategy() {
    setStrategyVisible(false);
    setTimeout(() => setStrategyOpen(false), 300);
  }
  async function confirmStrategy() {
    if (strategyDraft.nodig + strategyDraft.willen + strategyDraft.sparen !== 100) return;
    closeStrategy();
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "budget_strategy", value: JSON.stringify(strategyDraft) }),
    });
    // The page shows the split, so it has to re-render with the saved one.
    router.refresh();
  }

  async function saveCategoryTarget(categoryId: number, value: number) {
    return fetch("/api/budget-targets", {
      method: value > 0 ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        value > 0 ? { categoryId, month: DEFAULT_BUDGET_MONTH, targetAmount: value } : { categoryId, month: DEFAULT_BUDGET_MONTH },
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
    // A literal 0 overall means "no overall limit"; with a real one, category budgets
    // can't add up past it without raising it (the exceed warning).
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
      data.categories.map((c) => saveCategoryTarget(c.categoryId, parseFloat((catDraft[c.categoryId] ?? "").replace(",", ".")) || 0)),
    );
    setSaving(false);
    setStep(null);
    router.refresh();
  }

  async function deleteBudget() {
    if (!confirm(t("confirmDelete"))) return;
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
      const otherTotal = data.categories.filter((c) => c.categoryId !== editingCat.categoryId).reduce((s, c) => s + (c.budget ?? 0), 0);
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
    if (!confirm(t("confirmRemoveCategory", { name: editingCat.categoryName }))) return;
    setSaving(true);
    await saveCategoryTarget(editingCat.categoryId, 0);
    setSaving(false);
    setEditingCat(null);
    router.refresh();
  }

  // Overall stays the same, so this can never trip the exceed warning.
  async function moveBudget(fromId: number, toId: number, moveAmount: number) {
    const from = data.categories.find((c) => c.categoryId === fromId);
    const to = data.categories.find((c) => c.categoryId === toId);
    if (!from?.budget || !to?.budget || moveAmount <= 0) return;
    setSaving(true);
    await Promise.all([saveCategoryTarget(fromId, Math.max(0, from.budget - moveAmount)), saveCategoryTarget(toId, to.budget + moveAmount)]);
    setSaving(false);
    router.refresh();
  }

  // The direct path never went through the amount step, so it keeps the saved overall
  // amount and period instead of the (unset) draft ones.
  function saveDirect() {
    const overall = data.budget?.amount ?? 0;
    const overallPeriod = data.budget?.period ?? "monthly";
    if (overall > 0 && catTotal > overall) {
      setExceedWarning({
        requiredOverall: catTotal,
        onConfirm: async () => {
          setSaving(true);
          await saveOverall(catTotal, overallPeriod, false);
          await Promise.all(data.categories.map((c) => saveCategoryTarget(c.categoryId, parseFloat((catDraft[c.categoryId] ?? "").replace(",", ".")) || 0)));
          setSaving(false);
          setExceedWarning(null);
          setStep(null);
          router.refresh();
        },
      });
      return;
    }
    void (async () => {
      setSaving(true);
      if (!data.budget && catTotal > 0) await saveOverall(0, "monthly", false);
      // A budget with no overall amount and no category budgets left is no budget at all.
      if (data.budget && overall === 0 && catTotal === 0) await fetch("/api/budget", { method: "DELETE" });
      await Promise.all(data.categories.map((c) => saveCategoryTarget(c.categoryId, parseFloat((catDraft[c.categoryId] ?? "").replace(",", ".")) || 0)));
      setSaving(false);
      setStep(null);
      router.refresh();
    })();
  }

  const api: BudgetEditorApi = { openEdit, openManage, openStrategy, openCategory, deleteBudget, moveBudget, busy: saving };

  return (
    <BudgetEditorContext.Provider value={api}>
      {children}

      <ContextualTip id="budgetStrategy" active={strategyOpen} />

      {/* The strategy sheet and the exceed warning portal to <body> so they can sit on top
          of the amount-step sheet. Radix sets `pointer-events: none` on <body> while a modal
          sheet is open, so each opts back in, and `data-dialog-keep-open` keeps a tap on
          their backdrop from also closing the sheet underneath. */}
      {mounted &&
        createPortal(
          <>
            {strategyOpen && (
              <div
                data-dialog-keep-open
                className="fixed inset-0 flex items-end justify-center bg-[#1E1A14]/30 backdrop-blur-[6px] transition-opacity duration-300 ease-out"
                style={{ zIndex: 60, pointerEvents: "auto", opacity: strategyVisible ? 1 : 0 }}
                onClick={closeStrategy}
              >
                <div
                  className={cn(SHEET_COLUMN, "rounded-t-card bg-[var(--dialog-background)] p-5 pb-[calc(1.25rem+var(--sab))] transition-transform duration-300 ease-out lg:mb-6 lg:rounded-card")}
                  style={{ transform: strategyVisible ? "translateY(0)" : "translateY(100%)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-7 flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <h2 className="heading text-lg text-ink">{t("strategyTitle")}</h2>
                      <p className="text-[13px] text-ink-2">{t("strategyDesc")}</p>
                      <p className="text-[13px] text-ink-3">{t("strategyCommon")}</p>
                    </div>
                    <button onClick={closeStrategy} aria-label={t("close")} className={ICON_BTN}>
                      <IconX className="size-5" />
                    </button>
                  </div>
                  <BudgetStrategySliders value={strategyDraft} onChange={setStrategyDraft} />
                  {data.income > 0 && (
                    <p className="mt-4 text-center text-xs text-ink-3">
                      {t.rich("advisedBudget", {
                        amount: formatEurWhole(Math.round((data.income * (strategyDraft.nodig + strategyDraft.willen)) / 100)),
                        pct: strategyDraft.nodig + strategyDraft.willen,
                        income: formatEurWhole(data.income),
                        b: (chunks) => <span className="font-semibold text-ink">{chunks}</span>,
                      })}
                    </p>
                  )}
                  <button
                    onClick={confirmStrategy}
                    disabled={strategyDraft.nodig + strategyDraft.willen + strategyDraft.sparen !== 100}
                    className="mt-5 h-12 w-full rounded-full bg-ink text-sm font-bold text-bg transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                  >
                    {t("save")}
                  </button>
                </div>
              </div>
            )}

            {exceedWarning && (
              <div
                data-dialog-keep-open
                className="fixed inset-0 flex items-end justify-center bg-[#1E1A14]/30 backdrop-blur-[6px]"
                style={{ zIndex: 70, pointerEvents: "auto" }}
                onClick={() => setExceedWarning(null)}
              >
                <div
                  className="w-full max-w-md rounded-t-card bg-[var(--dialog-background)] p-5 pb-[calc(1.25rem+var(--sab))] lg:mb-6 lg:rounded-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                      <IconAlertTriangle className="size-5" />
                    </span>
                    <h2 className="heading text-base text-ink">{t("exceedTitle")}</h2>
                  </div>
                  <p className="mb-5 text-sm text-ink-2">
                    {t("exceedDesc", { total: formatEurWhole(exceedWarning.requiredOverall), overall: formatEurWhole(data.budget?.amount ?? 0) })}
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => exceedWarning.onConfirm()}
                      disabled={saving}
                      className="h-12 w-full rounded-full bg-ink text-sm font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-50"
                    >
                      {t("increaseOverall", { amount: formatEurWhole(exceedWarning.requiredOverall) })}
                    </button>
                    <button
                      onClick={() => setExceedWarning(null)}
                      className="h-12 w-full rounded-full border border-line bg-surface text-sm font-bold text-ink transition-transform active:scale-[0.98]"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>,
          document.body,
        )}

      {/* One category's budget on a numpad. */}
      <Dialog open={editingCat != null} onOpenChange={(o) => { if (!o) setEditingCat(null); }}>
        <DialogContent fullHeight hideHeaderRow accentColor={editingCat?.color} title={editingCat?.categoryName ?? t("categoryBudgets")} className="gap-0 p-0">
          {editingCat && (
            <div className="flex h-full flex-col">
              <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 pt-[var(--sat)] mt-5">
                <button onClick={() => setEditingCat(null)} aria-label={t("close")} className={ICON_BTN}>
                  <IconX className="size-5" />
                </button>
                <div className="flex min-w-0 items-center gap-2">
                  <CategoryIcon icon={editingCat.icon} color={editingCat.color} size="sm" />
                  <h1 className="heading truncate text-lg text-ink">{editingCat.categoryName}</h1>
                </div>
                <button onClick={deleteEditingCategory} aria-label={t("removeBudget")} className={ICON_BTN}>
                  <IconTrash className="size-5" />
                </button>
              </div>

              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <p className="mb-4 text-ink-2">{t("setCategoryBudget")}</p>
                <div className="amount text-6xl tabular-nums text-ink">
                  <AnimatedAmountDisplay value={editAmount} prefixClassName="text-ink-3 mr-1" />
                </div>
                <p className="mt-4 text-sm text-ink-3">{t("last30", { amount: formatEurWhole(editingCat.last30) })}</p>
              </div>

              <Numpad onKey={(k) => setEditAmount((cur) => nextAmountValue(cur, k))} onEnter={() => { if (!saving) saveEditingCategory(); }} />

              <div className="px-4 pb-[calc(0.75rem+var(--sab))] pt-3">
                <button onClick={saveEditingCategory} disabled={saving} className={PRIMARY_BTN}>
                  {saving ? t("saving") : t("save")}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit, step 1: the overall amount. Continue opens step 2 nested inside
          this sheet, so the amount step scales back behind the category list. */}
      <Dialog open={step === "amount" || (step === "categories" && categoriesEntry === "flow")} onOpenChange={(o) => { if (!o) setStep(null); }}>
        <DialogContent fullHeight hideHandle hideHeaderRow title={t("editBudget")} className="gap-0 overflow-hidden p-0">
          <div className="flex h-full flex-col bg-bg">
            <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[calc(var(--sat)+20px)]">
              <button onClick={() => setStep(null)} aria-label={t("close")} className={ICON_BTN}>
                <IconX className="size-5" />
              </button>
              <PeriodToggle value={period} onChange={setPeriod} />
              <button onClick={openStrategy} aria-label={t("strategyTitle")} className={ICON_BTN}>
                <IconAdjustmentsHorizontal className="size-5" />
              </button>
            </div>

            <div className="mx-4 mb-3 flex min-h-0 flex-1 flex-col rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 text-center">
                <p className="mb-4 text-ink-2">{t("overallLimit")}</p>
                <div className="amount text-6xl tabular-nums text-ink">
                  <AnimatedAmountDisplay value={amount} prefixClassName="text-ink-3 mr-1" />
                </div>
                <p className="mt-4 text-sm text-ink-3">
                  {period === "weekly" ? t("last7", { amount: formatEurWhole(data.last7Total) }) : t("last30", { amount: formatEurWhole(data.last30Total) })}
                </p>
                {strategySet && (
                  <button
                    onClick={() => setAmount(String(advised))}
                    className="mt-3 h-8 rounded-full bg-mustard-soft px-3.5 text-[13px] font-semibold text-mustard-strong transition-transform active:scale-95"
                  >
                    {t("advised", { amount: formatEurWhole(advised) })}
                  </button>
                )}
              </div>
              <Numpad
                className="shrink-0"
                onKey={(k) => setAmount((cur) => nextAmountValue(cur, k))}
                onEnter={() => { setCategoriesEntry("flow"); setStep("categories"); }}
              />
            </div>

            <div className="shrink-0 px-5 pb-[calc(var(--sab)+1.25rem)]">
              <button onClick={() => { setCategoriesEntry("flow"); setStep("categories"); }} className={PRIMARY_BTN}>
                {parsedAmount === 0 ? t("skip") : t("continue")}
              </button>
              <p className="mt-2 text-center text-xs text-ink-3">{t("skipHint")}</p>
            </div>
          </div>

          <Dialog open={step === "categories" && categoriesEntry === "flow"} onOpenChange={(o) => { if (!o) setStep("amount"); }}>
            <DialogContent fullHeight hideHandle hideHeaderRow title={t("categoryBudgets")} className="gap-0 overflow-hidden p-0">
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

      {/* Category budgets reached directly from the page. */}
      <Dialog open={step === "categories" && categoriesEntry === "direct"} onOpenChange={(o) => { if (!o) setStep(null); }}>
        <DialogContent fullHeight hideHandle hideHeaderRow title={t("categoryBudgets")} className="gap-0 overflow-hidden p-0">
          <CategoryBudgetsPanel
            backIcon="close"
            onBack={() => setStep(null)}
            parsedAmount={data.budget?.amount ?? 0}
            remainingPct={
              (data.budget?.amount ?? 0) > 0 ? Math.max(0, Math.min(100, ((data.budget!.amount - catTotal) / data.budget!.amount) * 100)) : 0
            }
            catTotal={catTotal}
            topLevelCats={topLevelCats}
            childrenByParent={childrenByParent}
            catDraft={catDraft}
            setCatDraft={setCatDraft}
            resetAllToZero={resetAllToZero}
            save={saveDirect}
            saving={saving}
          />
        </DialogContent>
      </Dialog>
    </BudgetEditorContext.Provider>
  );
}
