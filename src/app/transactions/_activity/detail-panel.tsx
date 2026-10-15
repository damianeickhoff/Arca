"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconArrowUp,
  IconArrowDown,
  IconArrowsLeftRight,
  IconBrandGoogle,
  IconBuildingStore,
  IconCamera,
  IconChevronDown,
  IconChevronUp,
  IconDots,
  IconEye,
  IconEyeOff,
  IconLink,
  IconPencil,
  IconPhoto,
  IconReceiptRefund,
  IconRepeat,
  IconTrash,
  IconArrowsSplit2,
  IconBolt,
  IconTransfer,
  IconX,
} from "@tabler/icons-react";
import { refreshLayoutAction } from "@/app/actions/refresh-layout";
import { Icon } from "@/components/icon";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryGrid, useCategoryFilter } from "@/components/category-picker";
import { OptionDropdown } from "@/components/option-dropdown";
import { BrandIconPicker } from "@/components/brand-icon-picker";
import { MerchantDetailPortal, type MerchantRef } from "@/components/merchant-detail-portal";
import { RecurringClient } from "@/components/settings/recurring/recurring-client";
import { formatEur, normalizeBudgetType, currencySymbol } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import { resolveDisplayName } from "@/lib/friendly-names";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { getMatchedTransactionInfoFields } from "@/lib/transaction-info-fields";
import { TRANSFER_TYPES, TRANSFER_TYPE_LABELS } from "@/lib/transfer-types";
import { getTransactionSplitTotal } from "@/lib/transaction-splits";
import { nextOccurrence } from "@/lib/recurring-occurrence";
import { cn } from "@/lib/utils";
import type { Category, Goal, Merchant } from "@/db/schema";
import { SplitTransactionDialog } from "../split-transaction-dialog";
import { LinkDialog } from "../link-dialog";
import { MerchantPickerDialog, buildRecurringPrefill, guessMerchant } from "../transaction-detail-dialog";
import type { TransactionRow } from "../transaction-types";
import { RowIcon, needsCategory, signedAmount } from "./activity-list";
import type { ActivityContext } from "./context";

// Loaded lazily, as in the old detail sheet: the recurring sheet lists linked
// transactions and can open transaction sheets in turn — a module cycle otherwise.
const RecurringDetailDialog = dynamic(
  () => import("@/components/settings/recurring/recurring-detail-dialog").then((m) => m.RecurringDetailDialog),
  { ssr: false },
);

// Nested sheets open above the phone detail sheet (z-50); harmless on desktop.
const NESTED = { sheetClassName: "z-[85]", overlayClassName: "z-[85] backdrop-blur-lg bg-foreground/20" } as const;

const BUDGET_KEY: Record<string, "needs" | "wants" | "save"> = { nodig: "needs", willen: "wants", sparen: "save" };

type ReimbursementLink = { amount: number; reimbursementTransactionId: number; originalTransactionId: number };
type Charge = { date: string; amount: number; correctedAmount: number | null };

/** Distinct, theme-aware colours for the merchant segments of the category bar. */
const SEGMENT_COLORS = ["var(--arca-info)", "var(--arca-positive)", "var(--arca-negative)", "var(--arca-warning)", "var(--arca-accent-strong)"];

async function patchTransaction(body: Record<string, unknown>) {
  await fetch("/api/transactions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(date: string) {
  const a = new Date(`${isoToday()}T12:00:00`).getTime();
  const b = new Date(`${date}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const compactEur = (n: number) => formatEur(n).replace(/,00$/, "");

/**
 * The Activity transaction detail (design H3). Desktop renders it as the right-hand card
 * — fixed height, the body scrolling inside and the quick actions pinned at the bottom;
 * phones render the same sections in a bottom sheet with the actions at the end.
 *
 * Top to bottom: position and ↑/↓ navigation; the transaction with its tags; Budget
 * impact and Next charge tiles; the last 12 charges of a recurring item; the four detail
 * tiles (Category, Budget type, Savings goal, Note); this month's spend in the category,
 * by merchant; and the quick actions (Split, Create a rule, Add receipt, More). Every
 * editor and action of the earlier panel is still here: merchant via the merchant name,
 * the rest in More.
 */
export function TransactionDetailPanel({
  row,
  categories,
  savingsGoals,
  context,
  position,
  layout,
  onCategorized,
  onDeleted,
}: {
  row: TransactionRow;
  categories: Category[];
  savingsGoals: Goal[];
  context: ActivityContext;
  position?: { index: number; total: number; onPrev?: () => void; onNext?: () => void };
  layout: "card" | "sheet";
  onCategorized: (id: number, categoryId: number | null) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("activity.detail");
  const tTags = useTranslations("activity.tags");
  const tFreq = useTranslations("activity.frequency");
  const locale = useLocale();
  const router = useRouter();

  // ── local copies of what this panel edits, so it reflects changes before the list
  //    re-renders (the list's row object is a snapshot).
  const [categoryId, setCategoryId] = useState<number | null>(row.categoryId);
  const [budgetTypeOverride, setBudgetTypeOverride] = useState<string | null>(row.budgetTypeOverride ?? null);
  const [transferType, setTransferType] = useState<string | null>(row.transferType ?? null);
  const [goalId, setGoalId] = useState<number | null>(row.goalId);
  const [notes, setNotes] = useState<string | null>(row.notes);
  const [excluded, setExcluded] = useState(!!row.excludeFromReports);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(row.receiptUrl);
  const [recurringId, setRecurringId] = useState<number | null>(row.recurringItemId ?? null);

  // ── fetched per transaction
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [merchantVersion, setMerchantVersion] = useState(0);
  const [links, setLinks] = useState<ReimbursementLink[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);

  useEffect(() => {
    if (row.isInternalTransfer) return;
    let cancelled = false;
    fetch(`/api/merchants/for-transaction?transactionId=${row.id}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMerchant(d.merchant ?? null); })
      .catch(() => { /* leave the name as the description rather than break the panel */ });
    return () => { cancelled = true; };
  }, [row.id, row.isInternalTransfer, merchantVersion]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reimbursements")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setLinks(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setLinks([]); });
    return () => { cancelled = true; };
  }, [row.id]);

  useEffect(() => {
    if (recurringId == null) return;
    let cancelled = false;
    fetch(`/api/recurring/transactions?itemId=${recurringId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setCharges(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setCharges([]); });
    return () => { cancelled = true; };
  }, [recurringId]);

  const paidBack = (links ?? []).filter((l) => l.originalTransactionId === row.id).reduce((s, l) => s + l.amount, 0);
  const allocated = (links ?? []).filter((l) => l.reimbursementTransactionId === row.id).reduce((s, l) => s + l.amount, 0);

  // ── sheets and dialogs
  const [pickerOpen, setPickerOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [budgetTypeOpen, setBudgetTypeOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringDetailOpen, setRecurringDetailOpen] = useState(false);
  const [merchantPickerOpen, setMerchantPickerOpen] = useState(false);
  const [openMerchant, setOpenMerchant] = useState<MerchantRef | null>(null);
  const [rule, setRule] = useState<RuleDraft | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentCat = categories.find((c) => c.id === categoryId) ?? null;
  const effectiveBudgetType = normalizeBudgetType(budgetTypeOverride ?? currentCat?.budgetType ?? null);
  const isExpense = row.direction === "expense" && !row.isReimbursement;
  const total = getTransactionSplitTotal(row.amount, row.correctedAmount);
  const lookupQuery = (guessMerchant(row.description) || resolveDisplayName(row)).trim();
  const infoFields = getMatchedTransactionInfoFields(row.rawDescription);
  const recurringItem = recurringId != null ? context.recurring[recurringId] ?? null : null;
  const goal = savingsGoals.find((g) => g.id === goalId) ?? null;

  const icon = resolveTransactionIcon({
    ...row,
    categoryIcon: currentCat?.icon ?? row.categoryIcon,
    categoryColor: currentCat?.color ?? row.categoryColor,
    merchantIcon: merchant?.icon ?? row.merchantIcon,
    merchantColor: merchant?.color ?? row.merchantColor,
    transferType,
  });

  const fmtDay = (date: string, opts: Intl.DateTimeFormatOptions) =>
    isValidISODate(date) ? new Date(`${date}T12:00:00`).toLocaleDateString(locale, opts) : date;
  const dateLabel = fmtDay(row.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const frequencyLabel = (f: string) => (["daily", "weekly", "monthly", "quarterly", "yearly", "once"].includes(f) ? tFreq(f) : f);

  // ── Budget impact
  const budget = categoryId != null ? context.budgets[categoryId] : undefined;
  const showBudget = isExpense && !row.isInternalTransfer && !row.isSplit && budget?.budget != null && budget.budget > 0;
  const budgetPct = showBudget ? (budget!.spent / budget!.budget!) * 100 : 0;

  // ── Next charge
  const nextDate = recurringItem && recurringItem.active ? nextOccurrence(recurringItem) : null;

  // ── Last 12 charges, oldest first
  const last12 = (charges ?? [])
    .filter((c) => isValidISODate(c.date))
    .slice(0, 12)
    .reverse()
    .map((c) => ({ date: c.date, value: Math.abs(c.correctedAmount ?? c.amount) }));
  let priceChange: { diff: number; date: string } | null = null;
  for (let i = last12.length - 1; i > 0; i--) {
    const diff = Math.round(last12[i].value * 100) - Math.round(last12[i - 1].value * 100);
    if (diff !== 0) {
      priceChange = { diff: diff / 100, date: last12[i].date };
      break;
    }
  }
  const year = new Date().getFullYear();
  const paidThisYear = (charges ?? [])
    .filter((c) => c.date.startsWith(String(year)))
    .reduce((s, c) => s + Math.abs(c.correctedAmount ?? c.amount), 0);

  // ── Category context (expenses in a category only)
  const showContext = isExpense && !row.isInternalTransfer && !row.isSplit && categoryId != null;
  const merchants = showContext ? context.merchantSpend[categoryId!] ?? [] : [];
  const monthTotal = merchants.reduce((s, m) => s + m.amount, 0);
  const segments = [
    ...merchants.slice(0, 4),
    ...(merchants.length > 4 ? [{ name: t("other"), amount: merchants.slice(4).reduce((s, m) => s + m.amount, 0) }] : []),
  ];
  const contextBudget = budget?.budget != null && budget.budget > 0 ? budget.budget : null;
  const denominator = Math.max(contextBudget ?? 0, monthTotal) || 1;
  const ownMerchant = (merchant?.name ?? row.merchantName ?? "").toLowerCase();

  // ── actions
  async function applyCategory(value: string) {
    const next = value ? Number(value) : null;
    setPickerOpen(false);
    setCategoryId(next);
    await patchTransaction({ id: row.id, categoryId: next });
    onCategorized(row.id, next);
    router.refresh();
    // Offer to apply the same category to similar transactions — unless a recurring
    // item already drives this row's category, which would make it redundant.
    if (next != null && recurringId == null) setRule(newRuleDraft(row, next, "afterChange"));
  }

  async function saveBudgetType(value: string | null) {
    setBudgetTypeOpen(false);
    setBudgetTypeOverride(value);
    await patchTransaction({ id: row.id, budgetTypeOverride: value });
    router.refresh();
  }

  async function saveTransferType(value: string | null) {
    setTransferOpen(false);
    setTransferType(value);
    await patchTransaction({ id: row.id, transferType: value });
    router.refresh();
  }

  async function applyGoal(value: number | null) {
    setGoalOpen(false);
    setGoalId(value);
    await patchTransaction({ id: row.id, goalId: value });
    router.refresh();
  }

  async function toggleExcluded() {
    const next = !excluded;
    setExcluded(next);
    await patchTransaction({ id: row.id, excludeFromReports: next });
    router.refresh();
  }

  async function toggleFlag(field: "isReimbursement" | "isManualTransfer", value: boolean) {
    await patchTransaction({ id: row.id, [field]: value });
    await refreshLayoutAction();
    router.refresh();
  }

  async function pickMerchant(name: string) {
    const created = await fetch("/api/merchants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!created.ok) return;
    const next: Merchant = await created.json();
    setMerchantPickerOpen(false);
    await patchTransaction({ id: row.id, merchantId: next.id });
    setMerchantVersion((v) => v + 1);
    setOpenMerchant((current) => (current ? { id: next.id, name: next.name } : null));
    router.refresh();
  }

  async function uploadReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("transactionId", String(row.id));
    const res = await fetch("/api/transactions/receipt", { method: "POST", body: form });
    if (res.ok) {
      const { receiptUrl: url } = await res.json();
      setReceiptUrl(url);
      router.refresh();
    }
  }

  async function removeReceipt() {
    setReceiptUrl(null);
    await fetch("/api/transactions/receipt", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: row.id }),
    });
    router.refresh();
  }

  async function remove() {
    if (!confirm(t("confirmDelete"))) return;
    await fetch("/api/transactions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    });
    await refreshLayoutAction();
    onDeleted();
    router.refresh();
  }

  // ── pieces ─────────────────────────────────────────────────────────────────────
  const quickBtn =
    "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45";

  const moreMenu = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={t("more")}
        className="ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-surface-2"
      >
        <IconDots className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-60">
        <DropdownMenuItem onClick={() => setLinkOpen(true)} disabled={row.direction !== "income"}>
          <IconLink className="size-4" />
          {t("actions.link")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setRecurringOpen(true)} disabled={recurringId != null}>
          <IconRepeat className="size-4" />
          {t("actions.recurring")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggleExcluded}>
          {excluded ? <IconEye className="size-4" /> : <IconEyeOff className="size-4" />}
          {excluded ? t("actions.include") : t("actions.exclude")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setCorrectOpen(true)}>
          <IconPencil className="size-4" />
          {t("menu.correctAmount")}
        </DropdownMenuItem>
        {!row.isInternalTransfer && (
          <DropdownMenuItem onClick={() => setMerchantPickerOpen(true)}>
            <IconBuildingStore className="size-4" />
            {t("menu.changeMerchant")}
          </DropdownMenuItem>
        )}
        {!!row.isInternalTransfer && (
          <DropdownMenuItem onClick={() => setTransferOpen(true)}>
            <IconTransfer className="size-4" />
            {t("fields.transferType")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setIconOpen(true)}>
          <IconPhoto className="size-4" />
          {t("menu.brandIcon")}
        </DropdownMenuItem>
        {receiptUrl && (
          <>
            <DropdownMenuItem onClick={() => setViewingReceipt(true)}>
              <IconCamera className="size-4" />
              {t("viewReceipt")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={removeReceipt}>
              <IconX className="size-4" />
              {t("removeReceipt")}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => toggleFlag("isReimbursement", !row.isReimbursement)}>
          <IconReceiptRefund className="size-4" />
          {row.isReimbursement ? t("menu.unmarkReimbursement") : t("menu.markReimbursement")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => toggleFlag("isManualTransfer", !row.isManualTransfer)}
          disabled={row.isInternalTransfer && !row.isManualTransfer}
        >
          <IconArrowsLeftRight className="size-4" />
          {row.isManualTransfer ? t("menu.unmarkTransfer") : t("menu.markTransfer")}
        </DropdownMenuItem>
        {lookupQuery && (
          <DropdownMenuItem
            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(lookupQuery)}`, "_blank", "noopener,noreferrer")}
          >
            <IconBrandGoogle className="size-4" />
            {t("menu.lookUp")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={remove} className="text-negative">
          <IconTrash className="size-4" />
          {t("menu.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const quickActions = (
    <div className="flex items-center gap-2">
      <button type="button" className={quickBtn} disabled={!!row.isInternalTransfer} onClick={() => setSplitOpen(true)}>
        <IconArrowsSplit2 className="size-4 shrink-0" />
        {row.isSplit ? t("actions.adjustSplit") : t("actions.split")}
      </button>
      <button type="button" className={quickBtn} onClick={() => setRule(newRuleDraft(row, categoryId, "create"))}>
        <IconBolt className="size-4 shrink-0" />
        {t("actions.rule")}
      </button>
      <button type="button" className={quickBtn} onClick={() => fileRef.current?.click()}>
        <IconCamera className="size-4 shrink-0" />
        {receiptUrl ? t("actions.replaceReceipt") : t("actions.receipt")}
      </button>
      {moreMenu}
    </div>
  );

  const nameNode = row.isInternalTransfer ? (
    <h2 className="heading truncate text-xl text-ink">{resolveDisplayName(row)}</h2>
  ) : (
    <button
      type="button"
      onClick={() => (merchant ? setOpenMerchant({ id: merchant.id, name: merchant.name }) : setMerchantPickerOpen(true))}
      title={merchant ? t("openMerchant") : t("setMerchant")}
      className="heading min-w-0 truncate text-left text-xl text-ink underline-offset-4 hover:underline"
    >
      {resolveDisplayName(row)}
    </button>
  );

  const body = (
    <>
      {/* 1. Position and navigation */}
      {position && (
        <div className="flex items-center justify-between gap-3">
          <span className="mono-label text-[10px]">{t("position", { index: position.index, total: position.total })}</span>
          <div className="flex items-center gap-1.5" data-tip-anchor="activityKeys">
            <span className="mono-label hidden text-[10px] lg:inline">{t("keysHint")}</span>
            <button
              type="button"
              onClick={position.onPrev}
              disabled={!position.onPrev}
              aria-label={t("previous")}
              className="inline-flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink disabled:opacity-40"
            >
              <IconChevronUp className="size-4" />
            </button>
            <button
              type="button"
              onClick={position.onNext}
              disabled={!position.onNext}
              aria-label={t("next")}
              className="inline-flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink disabled:opacity-40"
            >
              <IconChevronDown className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. The transaction and its tags */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3.5">
          {needsCategory({ ...row, categoryId }) ? (
            <RowIcon row={{ ...row, categoryId }} size="xl" />
          ) : (
            <Icon iconKey={icon.iconKey} color={icon.color} background={icon.background} initials={icon.initials} round size="xl" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            {nameNode}
            <span className="truncate text-[13px] text-ink-3">{[dateLabel, row.bankName].filter(Boolean).join(" · ")}</span>
          </div>
          <span className={cn("amount shrink-0 text-[32px]", isExpense ? "text-ink" : "text-positive")}>{signedAmount(row)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.isInternalTransfer ? (
            <Pill tone="info">{(transferType && TRANSFER_TYPE_LABELS[transferType]) || t("internalTransfer")}</Pill>
          ) : currentCat ? (
            <Pill>{currentCat.name}</Pill>
          ) : row.isSplit ? null : (
            <Pill tone="warning">{t("needsCategory")}</Pill>
          )}
          {effectiveBudgetType && BUDGET_KEY[effectiveBudgetType] && (
            <Pill tone="accent">{t(`budgetType.${BUDGET_KEY[effectiveBudgetType]}`)}</Pill>
          )}
          {recurringId != null && <Pill tone="info" icon={<IconRepeat />}>{tTags("recurring")}</Pill>}
          {row.isSplit && <Pill>{t("splitInto", { count: row.splitCount })}</Pill>}
          {(row.isReimbursement || paidBack > 0) && (
            <Pill tone="positive" icon={<IconReceiptRefund />}>
              {paidBack > 0 ? t("paidBackPill", { amount: formatEur(paidBack) }) : tTags("paidBack")}
            </Pill>
          )}
          {excluded && <Pill>{tTags("notInReports")}</Pill>}
        </div>
      </div>

      {/* 3. Budget impact and next charge */}
      {(showBudget || nextDate) && (
        <div className={cn("grid gap-2.5", showBudget && nextDate ? "grid-cols-2" : "grid-cols-1")}>
          {showBudget && (
            <div className="flex items-center gap-3.5 rounded-tile bg-surface-2 p-3.5">
              <Ring pct={budgetPct} color={budgetPct >= 98 ? "var(--arca-warning)" : currentCat?.color ?? "var(--arca-accent)"} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="mono-label text-[10px]">{t("budgetImpact")}</span>
                <span className="text-sm font-bold text-ink">
                  {t("budgetOf", { spent: compactEur(budget!.spent), budget: compactEur(budget!.budget!) })}{" "}
                  <span className="font-medium text-ink-3">
                    · {currentCat?.name} · {t("left", { amount: compactEur(Math.max(0, budget!.budget! - budget!.spent)) })}
                  </span>
                </span>
              </div>
            </div>
          )}
          {nextDate && recurringItem && (
            <div className="flex flex-col gap-0.5 rounded-tile bg-surface-2 p-3.5">
              <span className="mono-label text-[10px]">{t("nextCharge")}</span>
              <span className="text-sm font-bold text-ink">
                {fmtDay(nextDate, { weekday: "short", day: "numeric", month: "short" })} · {formatEur(recurringItem.amount ?? 0)}
              </span>
              <span className="text-xs text-ink-3">
                {t("inDays", { count: daysUntil(nextDate) })} · {frequencyLabel(recurringItem.frequency)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 4. The last 12 charges of a recurring item */}
      {recurringId != null && last12.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="mono-label">{t("last12")}</span>
            {priceChange && (
              <Pill tone="warning" icon={priceChange.diff > 0 ? <IconArrowUp /> : <IconArrowDown />}>
                {t(priceChange.diff > 0 ? "priceUp" : "priceDown", {
                  amount: formatEur(Math.abs(priceChange.diff)),
                  month: fmtDay(priceChange.date, { month: "long" }),
                })}
              </Pill>
            )}
          </div>
          <ChargesChart
            charges={last12}
            next={nextDate && recurringItem ? { date: nextDate, value: Math.abs(recurringItem.amount ?? last12[last12.length - 1].value) } : null}
            locale={locale}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs leading-normal text-ink-3">
              {[
                recurringItem ? recurringItem.friendlyName || recurringItem.name : null,
                recurringItem
                  ? recurringItem.startDate && isValidISODate(recurringItem.startDate)
                    ? t("since", { frequency: frequencyLabel(recurringItem.frequency), date: fmtDay(recurringItem.startDate, { month: "long", year: "numeric" }) })
                    : frequencyLabel(recurringItem.frequency)
                  : null,
                paidThisYear > 0 ? t("paidInYear", { amount: formatEur(paidThisYear), year }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {recurringItem && (
              <button type="button" onClick={() => setRecurringDetailOpen(true)} className="shrink-0 text-[13px] font-semibold text-mustard-strong hover:underline">
                {t("editRecurring")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 5. Details */}
      <div className="-mx-[22px] h-px bg-line" />
      <span className="mono-label">{t("details")}</span>
      <div className="grid grid-cols-2 gap-2">
        <KvTile
          label={t("fields.category")}
          onClick={row.isInternalTransfer || row.isSplit ? undefined : () => setPickerOpen(true)}
          tone={!currentCat && !row.isSplit && !row.isInternalTransfer ? "warning" : undefined}
        >
          {row.isInternalTransfer
            ? (transferType && TRANSFER_TYPE_LABELS[transferType]) || t("internalTransfer")
            : row.isSplit
              ? row.splitSummary ?? t("splitInto", { count: row.splitCount })
              : currentCat?.name ?? t("choose")}
        </KvTile>
        <KvTile label={t("fields.budgetType")} onClick={currentCat?.budgetType ? () => setBudgetTypeOpen(true) : undefined}>
          {effectiveBudgetType && BUDGET_KEY[effectiveBudgetType] ? t(`budgetType.${BUDGET_KEY[effectiveBudgetType]}`) : "—"}
        </KvTile>
        <KvTile label={t("fields.savingsGoal")} onClick={savingsGoals.length > 0 && !row.isInternalTransfer ? () => setGoalOpen(true) : undefined}>
          {goal?.name ?? t("none")}
        </KvTile>
        <KvTile label={t("fields.note")} onClick={() => setNoteOpen(true)} muted={!notes}>
          {notes ?? t("addNote")}
        </KvTile>
      </div>
      {(infoFields.length > 0 || (row.rawDescription && row.rawDescription !== row.description)) && (
        <div className="flex flex-col gap-1">
          {infoFields.map((f) => (
            <span key={f.key} className="text-xs text-ink-3">
              {f.label}: <span className="font-semibold text-ink-2">{f.value}</span>
            </span>
          ))}
          {row.rawDescription && row.rawDescription !== row.description && (
            <p className="break-all font-mono text-[11px] text-ink-3">{row.rawDescription}</p>
          )}
        </div>
      )}

      {/* 6. The category this month, by merchant */}
      {showContext && currentCat && monthTotal > 0 && (
        <>
          <div className="-mx-[22px] h-px bg-line" />
          <div className="flex flex-col gap-2.5" data-tip-anchor="activityContext">
            <div className="flex items-center justify-between gap-3">
              <span className="mono-label">{t("thisMonth", { category: currentCat.name })}</span>
              <span className="text-xs font-bold tabular-nums text-ink">
                {contextBudget != null
                  ? t("budgetOf", { spent: formatEur(monthTotal), budget: compactEur(contextBudget) })
                  : formatEur(monthTotal)}
              </span>
            </div>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2">
              {segments.map((s, i) => {
                const own = s.name.toLowerCase() === ownMerchant;
                return (
                  <span
                    key={s.name}
                    title={`${s.name} ${formatEur(s.amount)}`}
                    style={{
                      width: `${Math.min(100, (s.amount / denominator) * 100).toFixed(1)}%`,
                      background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                      boxShadow: own ? "inset 0 0 0 2px var(--arca-accent)" : undefined,
                      opacity: own ? 1 : 0.75,
                    }}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {segments.map((s, i) => {
                const own = s.name.toLowerCase() === ownMerchant;
                return (
                  <span key={s.name} className={cn("inline-flex items-center gap-1.5 text-xs", own ? "font-bold text-ink" : "font-medium text-ink-2")}>
                    <span className="size-2 rounded-full" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                    {s.name} {formatEur(s.amount)}
                  </span>
                );
              })}
              {contextBudget != null && (
                <span className="text-xs text-ink-3">· {t("left", { amount: compactEur(Math.max(0, contextBudget - monthTotal)) })}</span>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      {layout === "card" ? (
        <div className="flex h-full min-h-0 flex-col" data-tip-anchor="activityDetail">
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] pb-[22px] pt-[18px] [scrollbar-width:thin]">{body}</div>
          <div className="shrink-0 border-t border-line bg-surface-2 px-[22px] py-3.5">{quickActions}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-[18px]" data-tip-anchor="activityDetail">
          {body}
          <div className="sticky bottom-0 -mx-6 mt-1 border-t border-line bg-surface-2 px-6 py-3.5">{quickActions}</div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={uploadReceipt} />

      {/* ── dialogs ─────────────────────────────────────────────────────────── */}
      <CategoryPickerSheet
        open={pickerOpen && !row.isSplit}
        onOpenChange={setPickerOpen}
        categories={categories}
        current={categoryId}
        onPick={applyCategory}
        title={t("fields.category")}
      />

      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent {...NESTED} title={t("chooseGoal")}>
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            <ChoiceRow active={goalId == null} onClick={() => applyGoal(null)}>
              {t("notLinked")}
            </ChoiceRow>
            {savingsGoals.map((g) => (
              <ChoiceRow key={g.id} active={goalId === g.id} onClick={() => applyGoal(g.id)}>
                <Icon iconKey={g.icon} color={g.color} size="xs" round />
                {g.name}
              </ChoiceRow>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={budgetTypeOpen} onOpenChange={setBudgetTypeOpen}>
        <DialogContent {...NESTED} title={t("fields.budgetType")}>
          <div className="flex flex-col gap-1">
            <ChoiceRow active={budgetTypeOverride == null} onClick={() => saveBudgetType(null)}>
              {t("budgetTypeDefault", {
                type: currentCat?.budgetType && BUDGET_KEY[normalizeBudgetType(currentCat.budgetType)]
                  ? t(`budgetType.${BUDGET_KEY[normalizeBudgetType(currentCat.budgetType)]}`)
                  : "—",
              })}
            </ChoiceRow>
            {(["nodig", "willen", "sparen"] as const).map((key) => (
              <ChoiceRow key={key} active={normalizeBudgetType(budgetTypeOverride) === key} onClick={() => saveBudgetType(key)}>
                {t(`budgetType.${BUDGET_KEY[key]}`)}
              </ChoiceRow>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent {...NESTED} title={t("fields.transferType")}>
          <div className="flex flex-col gap-1">
            <ChoiceRow active={transferType == null} onClick={() => saveTransferType(null)}>
              {t("transferAuto")}
            </ChoiceRow>
            {TRANSFER_TYPES.map((x) => (
              <ChoiceRow key={x.value} active={transferType === x.value} onClick={() => saveTransferType(x.value)}>
                {x.label}
              </ChoiceRow>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <NoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        initial={notes ?? ""}
        onSave={async (value) => {
          const next = value.trim() || null;
          await patchTransaction({ id: row.id, notes: next });
          setNotes(next);
          setNoteOpen(false);
          router.refresh();
        }}
      />

      <AmountDialog
        open={correctOpen}
        onOpenChange={setCorrectOpen}
        original={row.amount}
        initial={row.correctedAmount}
        onSave={async (value) => {
          await patchTransaction({ id: row.id, correctedAmount: value });
          setCorrectOpen(false);
          router.refresh();
        }}
      />

      <BrandIconDialog
        open={iconOpen}
        onOpenChange={setIconOpen}
        initial={row.brandIcon}
        onSave={async (key) => {
          await patchTransaction({ id: row.id, brandIcon: key, brandIconColor: null, brandIconBgColor: null });
          setIconOpen(false);
          router.refresh();
        }}
      />

      {splitOpen && (
        <SplitTransactionDialog
          open={splitOpen}
          onOpenChange={setSplitOpen}
          transactionId={row.id}
          description={row.description}
          totalAmount={total}
          categories={categories}
          initialSplits={row.splits}
        />
      )}

      {row.direction === "income" && (
        <LinkDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          tikkie={{ id: row.id, amount: row.amount, description: row.description, date: row.date, allocatedAmount: allocated }}
        />
      )}

      {recurringOpen && (
        <RecurringClient
          action="add"
          open
          onOpenChange={(v) => {
            setRecurringOpen(v);
            if (!v) router.refresh();
          }}
          onSaved={(item) => {
            setRecurringId(item.id);
            if (item.categoryId != null) setCategoryId(item.categoryId);
          }}
          prefill={buildRecurringPrefill(row, categories)}
        />
      )}

      <RecurringDetailDialog
        item={recurringDetailOpen ? recurringItem : null}
        category={categories.find((c) => c.id === recurringItem?.categoryId) ?? null}
        categories={categories}
        onClose={() => { setRecurringDetailOpen(false); router.refresh(); }}
      />

      <RuleDialog draft={rule} categories={categories} onClose={() => { setRule(null); router.refresh(); }} />

      <MerchantDetailPortal merchant={openMerchant} onClose={() => setOpenMerchant(null)} onChangeMerchant={() => setMerchantPickerOpen(true)} />
      <MerchantPickerDialog
        open={merchantPickerOpen}
        currentId={merchant?.id ?? null}
        suggestion={guessMerchant(row.description)}
        onOpenChange={setMerchantPickerOpen}
        onPick={pickMerchant}
      />

      {viewingReceipt && receiptUrl && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90" onClick={() => setViewingReceipt(false)}>
          <button
            type="button"
            onClick={() => setViewingReceipt(false)}
            aria-label={t("close")}
            className="absolute right-4 top-[calc(1rem+var(--sat))] flex size-10 items-center justify-center rounded-full text-white"
          >
            <IconX className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded receipt */}
          <img src={receiptUrl} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}

// ── tiles and charts ───────────────────────────────────────────────────────────

function KvTile({
  label,
  children,
  onClick,
  tone,
  muted,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "warning";
  muted?: boolean;
}) {
  const inner = (
    <>
      <span className="mono-label text-[10px]">{label}</span>
      <span className={cn("truncate text-sm font-bold", tone === "warning" ? "text-warning" : muted ? "text-ink-3" : "text-ink")}>{children}</span>
    </>
  );
  const cls = "flex min-w-0 flex-col gap-1 rounded-tile bg-surface-2 px-3.5 py-3 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:bg-line/60")}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function Ring({ pct, color, size = 44, stroke = 5 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--arca-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${((c * Math.min(pct, 100)) / 100).toFixed(1)} ${c.toFixed(1)}`}
        />
      </svg>
      <span className="font-mono text-[10px] text-ink">{Math.round(pct)}%</span>
    </span>
  );
}

/** Bars for the last 12 charges: the current price in mustard, older prices in
 *  surface-2, and the next charge as a dashed outline. Month initials underneath. */
function ChargesChart({
  charges,
  next,
  locale,
}: {
  charges: { date: string; value: number }[];
  next: { date: string; value: number } | null;
  locale: string;
}) {
  const bars = [...charges.map((c) => ({ ...c, next: false })), ...(next ? [{ ...next, next: true }] : [])];
  const values = bars.map((b) => b.value);
  const max = Math.max(...values, 0.01);
  const min = Math.min(...values);
  const lo = min === max ? 0 : Math.max(0, min - (max - min) * 1.5);
  const current = charges.length > 0 ? Math.round(charges[charges.length - 1].value * 100) : null;
  const w = 560;
  const h = 72;
  const gap = 6;
  const bw = (w - gap * (bars.length - 1)) / bars.length;
  return (
    <div className="flex flex-col gap-1.5">
      <svg viewBox={`0 0 ${w} ${h}`} aria-hidden className="block h-auto w-full overflow-visible">
        {bars.map((b, i) => {
          const hh = Math.max(4, ((b.value - lo) / (max - lo || 1)) * h);
          const x = i * (bw + gap);
          const isCurrent = !b.next && Math.round(b.value * 100) === current;
          return (
            <rect
              key={i}
              x={x.toFixed(1)}
              y={(h - hh).toFixed(1)}
              width={bw.toFixed(1)}
              height={hh.toFixed(1)}
              rx={4}
              fill={b.next ? "none" : isCurrent ? "var(--arca-accent)" : "var(--arca-surface-2)"}
              stroke={b.next ? "var(--arca-accent-strong)" : undefined}
              strokeDasharray={b.next ? "3 3" : undefined}
              strokeWidth={b.next ? 1.5 : undefined}
            />
          );
        })}
      </svg>
      <div className="flex justify-between">
        {bars.map((b, i) => (
          <span key={i} className={cn("text-center font-mono text-[9px]", b.next ? "text-mustard-strong" : "text-ink-3")} style={{ width: `${100 / bars.length}%` }}>
            {new Date(`${b.date}T12:00:00`).toLocaleDateString(locale, { month: "narrow" })}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── small building blocks ──────────────────────────────────────────────────────

function ChoiceRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-row px-3 py-2.5 text-left text-sm transition-colors",
        active ? "bg-surface-2 font-semibold text-ink" : "text-ink hover:bg-surface-2/60",
      )}
    >
      {children}
    </button>
  );
}

function CategoryPickerSheet({
  open,
  onOpenChange,
  categories,
  current,
  onPick,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  current: number | null;
  onPick: (value: string) => void;
  title: string;
}) {
  const { budgetType, showSubcategories, filterMenu } = useCategoryFilter({
    triggerClassName: "size-10 rounded-full border border-line bg-surface text-ink",
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...NESTED} fullHeight hideHandle headerAction={filterMenu} title={title}>
        <CategoryGrid
          categories={categories}
          current={current != null ? String(current) : undefined}
          isFormMode
          fill
          budgetType={budgetType}
          showSubcategories={showSubcategories}
          onChange={(v) => onPick(v === "none" ? "" : v)}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string;
  onSave: (value: string) => Promise<void>;
}) {
  const t = useTranslations("activity.detail");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...NESTED} title={t("fields.note")}>
        {open && <NoteBody initial={initial} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function NoteBody({ initial, onSave }: { initial: string; onSave: (value: string) => Promise<void> }) {
  const t = useTranslations("activity.detail");
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <textarea
        rows={4}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("notePlaceholder")}
        className="w-full resize-none rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink outline-none focus:ring-3 focus:ring-mustard/25"
      />
      <p className="text-xs text-ink-3">{t("noteHint")}</p>
      <Button
        className="w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await onSave(value);
          setSaving(false);
        }}
      >
        {saving ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

function AmountDialog({
  open,
  onOpenChange,
  original,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  original: number;
  initial: number | null;
  onSave: (value: number | null) => Promise<void>;
}) {
  const t = useTranslations("activity.detail");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...NESTED} title={t("menu.correctAmount")}>
        {open && <AmountBody original={original} initial={initial} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function AmountBody({ original, initial, onSave }: { original: number; initial: number | null; onSave: (value: number | null) => Promise<void> }) {
  const t = useTranslations("activity.detail");
  const [value, setValue] = useState(initial != null ? String(initial) : "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="rounded-[14px] bg-surface-2 px-4 py-3">
        <p className="mono-label">{t("originalAmount")}</p>
        <p className="amount mt-1 text-lg text-ink">{formatEur(original)}</p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="mono-label px-1">{t("correctedAmount")}</span>
        <span className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3">{currencySymbol()}</span>
          <input
            inputMode="decimal"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={String(original)}
            className="h-12 w-full rounded-[14px] bg-surface-2 pl-8 pr-4 font-semibold tabular-nums text-ink outline-none focus:ring-3 focus:ring-mustard/25"
          />
        </span>
      </label>
      <p className="text-xs text-ink-3">{t("correctHint")}</p>
      <Button
        className="w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const parsed = parseFloat(value.replace(",", "."));
          await onSave(value.trim() === "" || isNaN(parsed) ? null : parsed);
          setSaving(false);
        }}
      >
        {saving ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

function BrandIconDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string | null;
  onSave: (key: string | null) => Promise<void>;
}) {
  const t = useTranslations("activity.detail");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...NESTED} title={t("menu.brandIcon")}>
        {open && <BrandIconBody initial={initial} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function BrandIconBody({ initial, onSave }: { initial: string | null; onSave: (key: string | null) => Promise<void> }) {
  const t = useTranslations("activity.detail");
  const [value, setValue] = useState<string | null>(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <BrandIconPicker value={value} onChange={setValue} />
      <Button
        className="w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await onSave(value);
          setSaving(false);
        }}
      >
        {saving ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

// ── rules ──────────────────────────────────────────────────────────────────────

type RuleDraft = {
  mode: "afterChange" | "create";
  categoryId: number | null;
  pattern: string;
  matchType: "contains" | "word" | "exact";
  amountMode: "none" | "exact" | "range";
  amountExact: string;
  amountMin: string;
  amountMax: string;
};

function newRuleDraft(row: TransactionRow, categoryId: number | null, mode: RuleDraft["mode"]): RuleDraft {
  const amount = row.correctedAmount ?? row.amount;
  return {
    mode,
    categoryId,
    pattern: guessMerchant(row.description),
    matchType: "contains",
    amountMode: "none",
    amountExact: amount != null ? String(amount) : "",
    amountMin: "",
    amountMax: "",
  };
}

/**
 * Create a category rule from this transaction (and apply it). Opened by "Create a
 * rule", and after a category change as "also apply to other transactions?" — the same
 * flow the old detail sheet offered, now with a whole-word option too.
 */
function RuleDialog({ draft, categories, onClose }: { draft: RuleDraft | null; categories: Category[]; onClose: () => void }) {
  const t = useTranslations("activity.rule");
  return (
    <Dialog open={draft != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent {...NESTED} title={draft?.mode === "afterChange" ? t("titleAfterChange") : t("titleCreate")}>
        {draft && <RuleBody key={`${draft.mode}:${draft.categoryId}:${draft.pattern}`} initial={draft} categories={categories} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function RuleBody({ initial, categories, onClose }: { initial: RuleDraft; categories: Category[]; onClose: () => void }) {
  const t = useTranslations("activity.rule");
  const [d, setD] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<RuleDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const seg = (active: boolean) =>
    cn("flex-1 h-8 rounded-full px-2 text-[12px] font-semibold transition-colors", active ? "bg-ink text-bg" : "text-ink-2 hover:text-ink");
  const input = "h-11 w-full rounded-[14px] bg-surface-2 px-4 text-sm text-ink outline-none focus:ring-3 focus:ring-mustard/25";

  async function save() {
    if (!d.pattern.trim() || d.categoryId == null) return;
    setSaving(true);
    const num = (v: string) => (v.trim() ? parseFloat(v.replace(",", ".")) : null);
    const amountFields =
      d.amountMode === "exact"
        ? { amount: num(d.amountExact), amountMin: null, amountMax: null }
        : d.amountMode === "range"
          ? { amount: null, amountMin: num(d.amountMin), amountMax: num(d.amountMax) }
          : { amount: null, amountMin: null, amountMax: null };
    // Without an amount condition every name match is categorised straight away; with
    // one, the rule + apply-rules pass does the matching so the amount is respected.
    if (d.amountMode === "none" && d.matchType !== "word") {
      await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: d.pattern.trim(), categoryId: d.categoryId, matchType: d.matchType }),
      });
    }
    await fetch("/api/category-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: d.categoryId,
        namePattern: d.pattern.trim(),
        nameWildcard: d.matchType === "contains",
        nameWholeWord: d.matchType === "word",
        direction: null,
        bankId: null,
        ...amountFields,
      }),
    });
    await fetch("/api/apply-rules", { method: "POST" });
    setSaving(false);
    onClose();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-2">{t("intro")}</p>
      <input className={input} value={d.pattern} onChange={(e) => set({ pattern: e.target.value })} aria-label={t("pattern")} />
      <div className="flex gap-0.5 rounded-full bg-surface-2 p-[3px]">
        {(["contains", "word", "exact"] as const).map((m) => (
          <button key={m} type="button" className={seg(d.matchType === m)} onClick={() => set({ matchType: m })}>
            {t(`match.${m}`)}
          </button>
        ))}
      </div>
      <OptionDropdown
        value={d.categoryId != null ? String(d.categoryId) : ""}
        onChange={(v) => set({ categoryId: v ? Number(v) : null })}
        options={[{ value: "", label: t("chooseCategory") }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
        triggerClassName="h-11 w-full justify-between rounded-[14px] bg-surface-2 px-4 text-sm font-semibold text-ink"
      />
      <div className="flex gap-0.5 rounded-full bg-surface-2 p-[3px]">
        {(["none", "exact", "range"] as const).map((m) => (
          <button key={m} type="button" className={seg(d.amountMode === m)} onClick={() => set({ amountMode: m })}>
            {t(`amount.${m}`)}
          </button>
        ))}
      </div>
      {d.amountMode === "exact" && (
        <input className={input} inputMode="decimal" value={d.amountExact} onChange={(e) => set({ amountExact: e.target.value })} aria-label={t("amount.exact")} />
      )}
      {d.amountMode === "range" && (
        <div className="grid grid-cols-2 gap-2">
          <input className={input} inputMode="decimal" placeholder={t("min")} value={d.amountMin} onChange={(e) => set({ amountMin: e.target.value })} />
          <input className={input} inputMode="decimal" placeholder={t("max")} value={d.amountMax} onChange={(e) => set({ amountMax: e.target.value })} />
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          {initial.mode === "afterChange" ? t("onlyThis") : t("cancel")}
        </Button>
        <Button className="flex-1" onClick={save} disabled={saving || !d.pattern.trim() || d.categoryId == null}>
          {saving ? t("saving") : t("apply")}
        </Button>
      </div>
    </div>
  );
}
