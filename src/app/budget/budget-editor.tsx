"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconAlertTriangle, IconPlus, IconRepeat, IconTrash } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { currencySymbol, formatEurWhole } from "@/lib/format";
import type { BudgetCategoryRow, BudgetOverview, BudgetPeriod } from "@/lib/budget-overview";
import { Icon } from "@/components/icon";
import { ClearChip } from "@/components/clear/chip";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField } from "@/components/clear/field";
import { ClearProgress } from "@/components/clear/progress";
import { IconTile } from "@/components/clear/icon-tile";
import { Segmented } from "@/components/clear/segmented";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { ContextualTip } from "@/components/contextual-tip";
import { AnchoredTip } from "@/components/anchored-tip";
import { BudgetDialog } from "./budget-dialog";
import { BudgetStrategyEditor, strategyTotal, type BudgetStrategyDraft } from "./budget-strategy-editor";
import { MoneyText } from "@/components/clear/money";

// The budget's dialogs, opened from the /budget page through useBudgetEditor():
//   • the editor — overall amount and period, the Needs / Wants / Savings split and
//     the category budgets, all in one dialog (Popup-BudgetEditor);
//   • one category's budget;
//   • the strategy on its own (the page's "Adjust");
//   • "category budgets exceed the overall budget — raise it?", stacked on top of
//     whichever of the first two asked.
// Centred modals from lg up, bottom sheets on phones (see BudgetDialog).

const DEFAULT_BUDGET_MONTH = "0000-00";
const KINDS = ["nodig", "willen", "sparen"] as const;

/** A typed amount ("1250", "12,50"); blank is 0. */
function parseAmount(v: string | undefined) {
  return parseFloat((v ?? "").replace(",", ".")) || 0;
}

/** Digits and a decimal comma, as typed. */
function sanitizeAmount(v: string) {
  return v.replace(/[^0-9,]/g, "");
}

function dayAfter(date: string) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d;
}

/** The big money field of the editor and the category dialog: currency, amount, and
 *  an optional chip at the end ("Resets on the 25th"). */
function BigMoneyInput({
  id,
  value,
  onChange,
  inputRef,
  chip,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  chip?: ReactNode;
}) {
  return (
    <div className="flex h-[60px] items-center gap-1.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-2.5 pl-[18px] transition-colors focus-within:border-clear-ink">
      <span aria-hidden className="text-2xl font-extrabold text-clear-muted">
        {currencySymbol()}
      </span>
      <input
        ref={inputRef}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(sanitizeAmount(e.target.value))}
        className="clear-amount w-full min-w-0 flex-1 border-none bg-transparent p-0 text-[30px] tracking-[-0.03em] text-clear-ink outline-none placeholder:text-clear-placeholder"
      />
      {chip}
    </div>
  );
}

/** One category budget in the editor: icon, name, what it spent this period, amount. */
function CategoryBudgetRow({ cat, value, onChange }: { cat: BudgetCategoryRow; value: string; onChange: (v: string) => void }) {
  const t = useTranslations("budget");
  const id = `budget-cat-${cat.categoryId}`;
  const amount = parseAmount(value);
  const over = amount > 0 && cat.spent > amount;
  return (
    <div className="flex items-center gap-3 rounded-clear-row bg-clear-tile p-2.5">
      <Icon iconKey={cat.icon} color={cat.color} size="md" soft />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label htmlFor={id} className="truncate text-sm font-bold">
          {cat.categoryName}
        </label>
        <span className={cn("truncate text-xs tabular-nums", over ? "font-bold text-clear-negative" : "font-semibold text-clear-muted")}>
          <MoneyText>{over
            ? t("spentOver", { spent: formatEurWhole(cat.spent), over: formatEurWhole(cat.spent - amount) })
            : t("spentHint", { amount: formatEurWhole(cat.spent) })}</MoneyText>
        </span>
      </span>
      <span className="flex h-10 w-[100px] shrink-0 items-center gap-1 rounded-clear-icon border-[1.5px] border-transparent bg-clear-card px-3 transition-colors focus-within:border-clear-ink">
        <span aria-hidden className="text-sm font-bold text-clear-muted">
          {currencySymbol()}
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(sanitizeAmount(e.target.value))}
          className="w-full min-w-0 border-none bg-transparent p-0 text-right text-[15px] font-extrabold tabular-nums text-clear-ink outline-none placeholder:text-clear-placeholder"
        />
      </span>
    </div>
  );
}

/** A category without a budget yet, in the "Add a category budget" picker. */
function CategoryOption({ cat, child, onPick }: { cat: BudgetCategoryRow; child: boolean; onPick: () => void }) {
  const t = useTranslations("budget");
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-clear-row px-2.5 py-2 text-left transition-colors hover:bg-clear-tile focus-visible:bg-clear-tile focus-visible:outline-none",
        child && "pl-8",
      )}
    >
      <Icon iconKey={cat.icon} color={cat.color} size="sm" soft />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold text-clear-ink">{cat.categoryName}</span>
        <span className="truncate text-xs tabular-nums text-clear-muted"><MoneyText>{t("last30", { amount: formatEurWhole(cat.last30) })}</MoneyText></span>
      </span>
    </button>
  );
}

interface ExceedWarning {
  /** Which dialog asked, so the check stacks on top of that one. */
  source: "editor" | "category";
  requiredOverall: number;
  overall: number;
  onConfirm: () => Promise<void>;
}

export interface BudgetEditorApi {
  /** Create a budget, or edit the overall amount, period, strategy and category budgets. */
  openEdit: () => void;
  /** The editor, scrolled to the category budgets. */
  openManage: () => void;
  /** The Needs / Wants / Savings split. */
  openStrategy: () => void;
  /** One category's budget. */
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
  const locale = useLocale();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);

  // The editor's draft. Nothing is saved until Save; Cancel, X and Escape discard it.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFocus, setEditorFocus] = useState<"amount" | "categories">("amount");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
  // Only categories with a row in the editor have a key: the ones with a budget, plus
  // any picked with "Add a category budget". A blank amount removes the budget on save.
  const [catDraft, setCatDraft] = useState<Record<number, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  // Shared by the editor and the strategy dialog; they're never open together.
  const [strategyDraft, setStrategyDraft] = useState<BudgetStrategyDraft>(data.strategy);
  const [strategyOpen, setStrategyOpen] = useState(false);

  // One category's budget. The category stays set after closing so the dialog keeps
  // its content through the close animation.
  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<BudgetCategoryRow | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // Same: the warning keeps its figures while it animates out.
  const [exceedOpen, setExceedOpen] = useState(false);
  const [exceed, setExceed] = useState<ExceedWarning | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const categoriesRef = useRef<HTMLElement>(null);
  const catAmountRef = useRef<HTMLInputElement>(null);

  const parsedAmount = parseAmount(amount);
  const catTotal = Object.values(catDraft).reduce((s, v) => s + parseAmount(v), 0);
  const strategyOk = strategyTotal(strategyDraft) === 100;
  const strategyChanged = KINDS.some((k) => strategyDraft[k] !== data.strategy[k]);
  // A split that doesn't add up only blocks the editor's Save once it has been touched.
  const editorCanSave = strategyOk || !strategyChanged;
  const advised = Math.round((data.income * (strategyDraft.nodig + strategyDraft.willen)) / 100);

  // Parents with their sub-categories right after them — the order rows and the
  // picker list categories in.
  const ordered = useMemo(() => {
    const children = new Map<number, BudgetCategoryRow[]>();
    for (const c of data.categories) {
      if (c.parentCategoryId == null) continue;
      children.set(c.parentCategoryId, [...(children.get(c.parentCategoryId) ?? []), c]);
    }
    const list = data.categories
      .filter((c) => c.parentCategoryId == null)
      .flatMap((c) => [c, ...(children.get(c.categoryId) ?? [])]);
    const listed = new Set(list.map((c) => c.categoryId));
    return [...list, ...data.categories.filter((c) => !listed.has(c.categoryId))];
  }, [data.categories]);
  const rows = ordered.filter((c) => c.categoryId in catDraft);
  const available = ordered.filter((c) => !(c.categoryId in catDraft));

  // "Manage" opens the editor at the category budgets.
  useEffect(() => {
    if (!editorOpen || editorFocus !== "categories") return;
    const timer = setTimeout(() => categoriesRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
    return () => clearTimeout(timer);
  }, [editorOpen, editorFocus]);

  function openEditor(focus: "amount" | "categories") {
    setAmount(data.budget && data.budget.amount > 0 ? String(Math.round(data.budget.amount)) : "");
    setPeriod(data.budget?.period ?? "monthly");
    setCatDraft(Object.fromEntries(data.categories.filter((c) => c.budget != null).map((c) => [c.categoryId, String(Math.round(c.budget!))])));
    setStrategyDraft(data.strategy);
    setEditorFocus(focus);
    setEditorOpen(true);
  }

  function openCategory(categoryId: number) {
    const cat = data.categories.find((c) => c.categoryId === categoryId);
    if (!cat) return;
    setEditingCat(cat);
    setEditAmount(cat.budget != null && cat.budget > 0 ? String(Math.round(cat.budget)) : "");
    setCatOpen(true);
  }

  function openStrategy() {
    setStrategyDraft(data.strategy);
    setStrategyOpen(true);
  }

  function addCategory(categoryId: number) {
    setCatDraft((d) => ({ ...d, [categoryId]: "" }));
    setPickerOpen(false);
    // Once the row has rendered (and the picker has let go of focus).
    setTimeout(() => document.getElementById(`budget-cat-${categoryId}`)?.focus(), 120);
  }

  function askToRaiseOverall(warning: ExceedWarning) {
    setExceed(warning);
    setExceedOpen(true);
  }

  // ── Saving ──────────────────────────────────────────────────────────────────

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
    // A budget with no overall amount and no category budgets is no budget at all.
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

  async function saveStrategy(strategy: BudgetStrategyDraft) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "budget_strategy", value: JSON.stringify(strategy) }),
    });
  }

  // A literal 0 overall means "no overall limit" (the category budgets together are
  // the limit); with a real one, the category budgets can't add up past it without
  // raising it.
  async function persistEditor(overall: number) {
    setSaving(true);
    await saveOverall(overall, period, catTotal === 0);
    await Promise.all(
      data.categories
        .filter((c) => c.categoryId in catDraft && parseAmount(catDraft[c.categoryId]) !== (c.budget ?? 0))
        .map((c) => saveCategoryTarget(c.categoryId, parseAmount(catDraft[c.categoryId]))),
    );
    if (strategyChanged && strategyOk) await saveStrategy(strategyDraft);
    setSaving(false);
    setExceedOpen(false);
    setEditorOpen(false);
    router.refresh();
  }

  function saveEditor() {
    if (saving || !editorCanSave) return;
    if (parsedAmount > 0 && catTotal > parsedAmount) {
      askToRaiseOverall({ source: "editor", requiredOverall: catTotal, overall: parsedAmount, onConfirm: () => persistEditor(catTotal) });
      return;
    }
    void persistEditor(parsedAmount);
  }

  async function removeBudget() {
    const ok = await confirm({
      title: t("confirmDelete"),
      body: t("confirmDeleteBody"),
      confirmLabel: t("deleteBudget"),
      destructive: true,
    });
    if (!ok) return false;
    setSaving(true);
    await fetch("/api/budget", { method: "DELETE" });
    setSaving(false);
    router.refresh();
    return true;
  }

  async function confirmStrategy() {
    if (saving || strategyTotal(strategyDraft) !== 100) return;
    setSaving(true);
    await saveStrategy(strategyDraft);
    setSaving(false);
    setStrategyOpen(false);
    // The page shows the split, so it has to re-render with the saved one.
    router.refresh();
  }

  async function persistCategory(cat: BudgetCategoryRow, value: number, raiseOverallTo?: number) {
    setSaving(true);
    if (raiseOverallTo != null) await saveOverall(raiseOverallTo, data.budget!.period, false);
    await saveCategoryTarget(cat.categoryId, value);
    setSaving(false);
    setExceedOpen(false);
    setCatOpen(false);
    router.refresh();
  }

  function saveEditingCategory() {
    if (!editingCat || saving) return;
    const value = parseAmount(editAmount);
    const overall = data.budget?.amount ?? 0;
    if (overall > 0) {
      const others = data.categories.filter((c) => c.categoryId !== editingCat.categoryId).reduce((s, c) => s + (c.budget ?? 0), 0);
      const newTotal = others + value;
      if (newTotal > overall) {
        askToRaiseOverall({
          source: "category",
          requiredOverall: newTotal,
          overall,
          onConfirm: () => persistCategory(editingCat, value, newTotal),
        });
        return;
      }
    }
    void persistCategory(editingCat, value);
  }

  async function removeEditingCategory() {
    if (!editingCat) return;
    const ok = await confirm({
      title: t("confirmRemoveCategory", { name: editingCat.categoryName }),
      body: t("confirmRemoveCategoryBody"),
      confirmLabel: t("removeBudget"),
      destructive: true,
    });
    if (!ok) return;
    await persistCategory(editingCat, 0);
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

  const api: BudgetEditorApi = {
    openEdit: () => openEditor("amount"),
    openManage: () => openEditor("categories"),
    openStrategy,
    openCategory,
    deleteBudget: () => void removeBudget(),
    moveBudget,
    busy: saving,
  };

  // ── Copy ────────────────────────────────────────────────────────────────────

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const shortDate = (d: string) => dateFmt.format(new Date(`${d}T12:00:00`));
  const editorTitle = data.budget ? t("editBudget") : t("create");
  // The monthly reset day follows the budget month; it's only known while the budget
  // shown is monthly (a weekly one's range says nothing about it).
  const savedPeriod = data.budget?.period ?? "monthly";
  const resetText =
    period === "weekly"
      ? t("resets", { period: "weekly", day: 0 })
      : savedPeriod === "monthly"
        ? t("resets", { period: "monthly", day: dayAfter(data.to).getDate() })
        : null;
  const secondary = clearButtonVariants({ variant: "secondary" });

  // ── The "raise the overall budget?" check ───────────────────────────────────

  function exceedDialog(source: ExceedWarning["source"]) {
    return (
      <BudgetDialog
        open={exceedOpen && exceed?.source === source}
        onOpenChange={setExceedOpen}
        size="sm"
        title={t("exceedTitle")}
        titleId={`budget-exceed-${source}`}
        header={
          <ClearDialogHeader
            titleId={`budget-exceed-${source}`}
            title={t("exceedTitle")}
            icon={
              <IconTile tone="butter">
                <IconAlertTriangle stroke={2} />
              </IconTile>
            }
          />
        }
        footer={
          <ClearDialogFooter>
            <button type="button" onClick={() => setExceedOpen(false)} className={secondary}>
              {t("cancel")}
            </button>
            <button type="button" disabled={saving} onClick={() => void exceed?.onConfirm()} className={clearButtonVariants()}>
              <MoneyText>{t("increaseOverall", { amount: formatEurWhole(exceed?.requiredOverall ?? 0) })}</MoneyText>
            </button>
          </ClearDialogFooter>
        }
      >
        {exceed && (
          <p className="m-0 text-[15px] leading-normal text-clear-ink-2">
            <MoneyText>{t("exceedDesc", { total: formatEurWhole(exceed.requiredOverall), overall: formatEurWhole(exceed.overall) })}</MoneyText>
          </p>
        )}
      </BudgetDialog>
    );
  }

  return (
    <BudgetEditorContext.Provider value={api}>
      {children}

      <ContextualTip id="budgetStrategy" active={strategyOpen} />
      <AnchoredTip id="budgetAddCategory" anchor="budgetAddCategory" active={editorOpen} />

      {/* ── The editor ───────────────────────────────────────────────────────── */}
      <BudgetDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editorTitle}
        titleId="budget-editor-title"
        divider
        initialFocus={editorFocus === "categories" ? addRef : amountRef}
        header={
          <ClearDialogHeader
            titleId="budget-editor-title"
            title={editorTitle}
            subtitle={data.budget ? t("editSubtitle", { from: shortDate(data.from), to: shortDate(data.to) }) : t("createSubtitle")}
            onClose={() => setEditorOpen(false)}
            closeLabel={t("close")}
          />
        }
        footer={
          <ClearDialogFooter
            destructive={
              data.budget && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    if (await removeBudget()) setEditorOpen(false);
                  }}
                  className={cn(clearButtonVariants({ variant: "danger" }), "-ml-2")}
                >
                  <IconTrash aria-hidden />
                  {t("deleteBudget")}
                </button>
              )
            }
          >
            <button type="button" onClick={() => setEditorOpen(false)} className={secondary}>
              {t("cancel")}
            </button>
            <button type="submit" form="budget-editor-form" disabled={saving || !editorCanSave} className={clearButtonVariants()}>
              {saving ? t("saving") : t("save")}
            </button>
          </ClearDialogFooter>
        }
      >
        <form
          id="budget-editor-form"
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            saveEditor();
          }}
        >
          {/* Overall budget + period */}
          <div className="flex flex-col gap-2">
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="budget-overall" className="text-[13px] font-bold text-clear-ink-2">
                  {t("overallBudget")}
                </label>
                <BigMoneyInput
                  id="budget-overall"
                  inputRef={amountRef}
                  value={amount}
                  onChange={setAmount}
                  chip={
                    resetText && (
                      <ClearChip tone="sky" icon={<IconRepeat stroke={2.2} aria-hidden />} className="h-8 font-bold max-[380px]:hidden">
                        {resetText}
                      </ClearChip>
                    )
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span aria-hidden className="text-[13px] font-bold text-clear-ink-2">
                  {t("periodLabel")}
                </span>
                <Segmented
                  label={t("periodLabel")}
                  surface="tile"
                  value={period}
                  onChange={setPeriod}
                  className="h-[60px] w-full [&>button]:h-full [&>button]:flex-1"
                  items={[
                    { value: "monthly", label: t("period.monthly") },
                    { value: "weekly", label: t("period.weekly") },
                  ]}
                />
              </div>
            </div>
            {/* One fixed-height line: the advised pill fades in and out as the split
                adds up or not, so the cards below never move. */}
            <div className="flex h-8 items-center justify-between gap-3 text-[13px] text-clear-muted">
              <span className="min-w-0 truncate tabular-nums">
                <MoneyText>{period === "weekly" ? t("last7", { amount: formatEurWhole(data.last7Total) }) : t("last30", { amount: formatEurWhole(data.last30Total) })}</MoneyText>
              </span>
              {advised > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(advised))}
                  disabled={!strategyOk}
                  aria-hidden={!strategyOk}
                  tabIndex={strategyOk ? undefined : -1}
                  className={cn(
                    "inline-flex h-8 shrink-0 cursor-pointer items-center rounded-full bg-clear-mint px-3.5 text-[13px] font-extrabold whitespace-nowrap text-clear-mint-ink tabular-nums transition-opacity duration-200 hover:opacity-85 motion-reduce:transition-none",
                    !strategyOk && "pointer-events-none opacity-0",
                  )}
                >
                  <MoneyText>{t("advised", { amount: formatEurWhole(advised) })}</MoneyText>
                </button>
              )}
            </div>
          </div>

          {/* Budget strategy */}
          <BudgetStrategyEditor title={t("strategyTitle")} value={strategyDraft} onChange={setStrategyDraft} income={data.income} />

          {/* Category budgets */}
          <section ref={categoriesRef} aria-labelledby="budget-editor-categories" className="flex scroll-mt-2 flex-col gap-3.5">
            {/* Title and subtitle on the left, the actions on the same row at the right;
                on a phone the actions drop under the text only when they can't fit. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 sm:flex-nowrap">
              <div className="flex min-w-[200px] flex-1 flex-col gap-[3px]">
                <h3 id="budget-editor-categories" className="m-0 text-base font-bold">
                  {t("categoryBudgets")}
                </h3>
                <span className="text-[13px] text-clear-muted">{t("categoryBudgetsHint")}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCatDraft((d) => Object.fromEntries(Object.keys(d).map((k) => [k, ""])))}
                    className={clearButtonVariants({ variant: "ghost", size: "sm" })}
                  >
                    {t("clearAll")}
                  </button>
                )}
                <ResponsivePopover
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  title={t("pickCategory")}
                  trigger={
                    <button ref={addRef} type="button" data-tip-anchor="budgetAddCategory" className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
                      <IconPlus aria-hidden />
                      {t("addCategory")}
                    </button>
                  }
                >
                  {available.length === 0 ? (
                    <p className="m-0 px-2.5 py-3 text-sm text-clear-muted">{t("allBudgeted")}</p>
                  ) : (
                    available.map((c) => (
                      <CategoryOption key={c.categoryId} cat={c} child={c.parentCategoryId != null} onPick={() => addCategory(c.categoryId)} />
                    ))
                  )}
                </ResponsivePopover>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="m-0 rounded-clear-tile border border-dashed border-clear-line px-4 py-5 text-center text-sm text-clear-muted">
                {t("noCategoryBudgets")}
              </p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {rows.map((c) => (
                  <CategoryBudgetRow
                    key={c.categoryId}
                    cat={c}
                    value={catDraft[c.categoryId] ?? ""}
                    onChange={(v) => setCatDraft((d) => ({ ...d, [c.categoryId]: v }))}
                  />
                ))}
              </div>
            )}

            {/* Allocation summary */}
            <div className="flex flex-col gap-2.5 rounded-clear-tile border border-clear-line px-4 py-3.5">
              {parsedAmount > 0 ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-clear-ink-2">
                    <span>
                      <MoneyText>{t.rich("allocatedOf", {
                        allocated: formatEurWhole(catTotal),
                        overall: formatEurWhole(parsedAmount),
                        b: (c) => <b className="text-base tabular-nums text-clear-ink"><MoneyText>{c}</MoneyText></b>,
                      })}</MoneyText>
                    </span>
                    <span className={cn("font-bold tabular-nums", catTotal > parsedAmount ? "text-clear-negative" : "text-clear-ember-text")}>
                      <MoneyText>{catTotal > parsedAmount
                        ? t("overAllocated", { amount: formatEurWhole(catTotal - parsedAmount) })
                        : t("leftToAllocateAmount", { amount: formatEurWhole(parsedAmount - catTotal) })}</MoneyText>
                    </span>
                  </div>
                  <ClearProgress
                    hatchRemainder
                    value={Math.min(1, catTotal / parsedAmount)}
                    fillClassName={catTotal > parsedAmount ? "bg-clear-negative-fill" : undefined}
                  />
                </>
              ) : (
                <>
                  <span className="text-sm text-clear-ink-2">
                    <MoneyText>{t.rich("categoryTotal", { amount: formatEurWhole(catTotal), b: (c) => <b className="text-base tabular-nums text-clear-ink"><MoneyText>{c}</MoneyText></b> })}</MoneyText>
                  </span>
                  <span className="text-[13px] text-clear-muted">{t("noOverallHint")}</span>
                </>
              )}
            </div>
          </section>
        </form>

        {exceedDialog("editor")}
      </BudgetDialog>

      {/* ── One category's budget ────────────────────────────────────────────── */}
      <BudgetDialog
        open={catOpen}
        onOpenChange={setCatOpen}
        size="sm"
        title={editingCat?.categoryName ?? t("categoryBudgets")}
        titleId="budget-category-title"
        initialFocus={catAmountRef}
        header={
          editingCat && (
            <ClearDialogHeader
              titleId="budget-category-title"
              title={editingCat.categoryName}
              subtitle={<MoneyText>{t("categorySpent", { amount: formatEurWhole(editingCat.spent) })}</MoneyText>}
              icon={<Icon iconKey={editingCat.icon} color={editingCat.color} size="md" soft />}
              onClose={() => setCatOpen(false)}
              closeLabel={t("close")}
            />
          )
        }
        footer={
          <ClearDialogFooter
            destructive={
              editingCat?.budget != null && (
                <button type="button" disabled={saving} onClick={removeEditingCategory} className={cn(clearButtonVariants({ variant: "danger" }), "-ml-2")}>
                  <IconTrash aria-hidden />
                  {t("removeBudget")}
                </button>
              )
            }
          >
            <button type="button" onClick={() => setCatOpen(false)} className={secondary}>
              {t("cancel")}
            </button>
            <button type="submit" form="budget-category-form" disabled={saving} className={clearButtonVariants()}>
              {saving ? t("saving") : t("save")}
            </button>
          </ClearDialogFooter>
        }
      >
        {editingCat && (
          <form
            id="budget-category-form"
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              saveEditingCategory();
            }}
          >
            <ClearField
              label={t("budgetPer", { period: savedPeriod })}
              htmlFor="budget-category-amount"
              hint={<MoneyText>{t("last30", { amount: formatEurWhole(editingCat.last30) })}</MoneyText>}
            >
              <BigMoneyInput id="budget-category-amount" inputRef={catAmountRef} value={editAmount} onChange={setEditAmount} />
            </ClearField>
          </form>
        )}

        {exceedDialog("category")}
      </BudgetDialog>

      {/* ── The strategy on its own ──────────────────────────────────────────── */}
      <BudgetDialog
        open={strategyOpen}
        onOpenChange={setStrategyOpen}
        title={t("strategyTitle")}
        titleId="budget-strategy-title"
        header={
          <ClearDialogHeader
            titleId="budget-strategy-title"
            title={t("strategyTitle")}
            subtitle={t("strategyDesc")}
            onClose={() => setStrategyOpen(false)}
            closeLabel={t("close")}
          />
        }
        footer={
          <ClearDialogFooter>
            <button type="button" onClick={() => setStrategyOpen(false)} className={secondary}>
              {t("cancel")}
            </button>
            <button type="button" onClick={confirmStrategy} disabled={saving || !strategyOk} className={clearButtonVariants()}>
              {saving ? t("saving") : t("save")}
            </button>
          </ClearDialogFooter>
        }
      >
        <BudgetStrategyEditor value={strategyDraft} onChange={setStrategyDraft} income={data.income} />
        {data.income > 0 && (
          <p className="m-0 text-[13px] text-clear-ink-2">
            <MoneyText>{t.rich("advisedBudget", {
              amount: formatEurWhole(advised),
              pct: strategyDraft.nodig + strategyDraft.willen,
              income: formatEurWhole(data.income),
              b: (chunks) => <b className="text-clear-ink"><MoneyText>{chunks}</MoneyText></b>,
            })}</MoneyText>
          </p>
        )}
      </BudgetDialog>
    </BudgetEditorContext.Provider>
  );
}
