"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconArrowUp,
  IconArrowDown,
  IconArrowRight,
  IconArrowsMinimize,
  IconBuildingBank,
  IconDownload,
  IconInfoCircle,
  IconZoomIn,
  IconZoomOut,
  IconArrowsLeftRight,
  IconBrandGoogle,
  IconBuildingStore,
  IconCamera,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconDots,
  IconEye,
  IconEyeOff,
  IconLink,
  IconPencil,
  IconPhoto,
  IconReceipt,
  IconReceiptRefund,
  IconRepeat,
  IconTrash,
  IconArrowsSplit2,
  IconBolt,
  IconCheck,
  IconCopy,
  IconTransfer,
  IconX,
} from "@tabler/icons-react";
import { refreshLayoutAction } from "@/app/actions/refresh-layout";
import { Icon } from "@/components/icon";
import { Amount } from "@/components/clear/amount";
import { ClearChip } from "@/components/clear/chip";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { IconTile } from "@/components/clear/icon-tile";
import { RuleDialog, emptyRuleDraft, fetchRuleMatches, toRuleAmountInput, type RuleDraft, type RuleFields } from "@/components/rule-dialog";
import { AnchoredTip } from "@/components/anchored-tip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryPickerSheet as SharedCategoryPickerSheet } from "@/components/category-picker";
import { IconPickerDialog } from "@/components/icon-picker";
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
import { TransactionMap } from "@/components/transaction-map";
import { ClearTile } from "@/components/clear/card";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { parseTransactionLocation } from "@/lib/parse-transaction-location";
import { LinkDialog } from "../link-dialog";
import { MerchantPickerDialog } from "./merchant-picker";
import { buildRecurringPrefill, guessMerchant } from "@/lib/recurring-prefill";
import type { TransactionRow } from "../transaction-types";
import { RowIcon, needsCategory } from "./activity-list";
import type { ActivityContext } from "./context";
import { MoneyText } from "@/components/clear/money";

// Loaded lazily, as in the old detail sheet: the recurring sheet lists linked
// transactions and can open transaction sheets in turn — a module cycle otherwise.
const RecurringDetailDialog = dynamic(
  () => import("@/components/settings/recurring/recurring-detail-dialog").then((m) => m.RecurringDetailDialog),
  { ssr: false },
);

// Nested sheets open above the phone detail sheet (z-50); harmless on desktop.
const NESTED = { sheetClassName: "z-[85]", overlayClassName: "z-[85] backdrop-blur-lg bg-clear-primary/20" } as const;

const BUDGET_KEY: Record<string, "needs" | "wants" | "save"> = { nodig: "needs", willen: "wants", sparen: "save" };

type ReimbursementLink = { amount: number; reimbursementTransactionId: number; originalTransactionId: number };
type Charge = { date: string; amount: number; correctedAmount: number | null };

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
 * The Activity transaction detail. Desktop renders it as the right-hand card — fixed
 * height, the body scrolling inside; phones render the same sections in a bottom sheet.
 *
 * Top to bottom: ↑/↓ navigation and position; the amount, merchant and status chips;
 * the field list (Category, Your share, Merchant, Budget type, Savings goal, Note,
 * Receipt), each row opening its editor; Budget impact; Next charge and the last 12
 * charges of a recurring item; this month's spend in the category, by merchant; bank
 * details and the map; the action tiles; and More actions / Delete.
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
  const tHistory = useTranslations("activity.detail.history");
  const tTags = useTranslations("activity.tags");
  const tFreq = useTranslations("activity.frequency");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();

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

  // What was spent at this merchant this calendar month, for the merchant row. Always
  // this month (also on an older transaction): the row answers "how am I doing there now".
  const merchantId = merchant?.id ?? null;
  const thisMonth = monthOf(isoToday());
  const [merchantPeriod, setMerchantPeriod] = useState<{ total: number; visits: number } | null>(null);
  useEffect(() => {
    if (merchantId == null) return;
    let cancelled = false;
    fetch(`/api/merchants/${merchantId}/detail?from=${thisMonth.from}&to=${thisMonth.to}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setMerchantPeriod({ total: d.totalSpent, visits: d.visitCount }); })
      .catch(() => { /* the row keeps its plain title */ });
    return () => { cancelled = true; };
  }, [merchantId, thisMonth.from, thisMonth.to]);

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [tab, setTab] = useState<"summary" | "details">("summary");
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentCat = categories.find((c) => c.id === categoryId) ?? null;
  const effectiveBudgetType = normalizeBudgetType(budgetTypeOverride ?? currentCat?.budgetType ?? null);
  const isExpense = row.direction === "expense" && !row.isReimbursement;
  const total = getTransactionSplitTotal(row.amount, row.correctedAmount);
  const lookupQuery = (guessMerchant(row.description) || resolveDisplayName(row)).trim();
  const infoFields = getMatchedTransactionInfoFields(row.rawDescription);
  const recurringItem = recurringId != null ? context.recurring[recurringId] ?? null : null;
  const goal = savingsGoals.find((g) => g.id === goalId) ?? null;
  const uncategorised = needsCategory({ ...row, categoryId });

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

  // ── The rows under Edit details: where it happened, and this month at the merchant
  //    (or, without a merchant, a recurring item's rhythm). Both open a popup.
  const isIncomeRow = isIncomeRowOf(row);
  const locationName = row.customName || row.description;
  // Only when the bank line names a place; without one there is nothing to show on a map.
  const parsedLocation = row.isInternalTransfer ? null : parseTransactionLocation(locationName);
  const location = parsedLocation ? { label: parsedLocation.label } : null;
  // "About €X a week" only means something with more than one visit; weeks so far this month.
  const weeks = Math.max(1, (daysUntilFrom(thisMonth.from) + 1) / 7);
  const visits = merchantPeriod?.visits ?? null;
  const merchantRow =
    merchant && !isIncomeRowOf(row)
      ? {
          title:
            merchantPeriod != null
              ? t("history.thisMonthAt", { name: merchant.name, amount: formatEur(merchantPeriod.total) })
              : t("history.thisMonthAtName", { name: merchant.name }),
          sub:
            visits == null
              ? ""
              : visits === 0
                ? t("history.noVisits")
                : visits === 1
                  ? t("history.oneVisit")
                  : t("history.visits", { count: visits, weekly: compactEur(Math.round(merchantPeriod!.total / weeks)) }),
        }
      : null;
  const historyRow: { title: string; sub: string } | null = merchantRow ?? (recurringItem
    ? {
        title: t("history.recurringTitle", {
          frequency: frequencyLabel(recurringItem.frequency),
          amount: formatEur(Math.abs(recurringItem.amount ?? shownAmountOf(row))),
        }),
        sub: nextDate
          ? t(isIncomeRow ? "history.nextPayment" : "history.nextCharge", {
              date: fmtDay(nextDate, { weekday: "short", day: "numeric", month: "short" }),
              when: t("inDays", { count: daysUntil(nextDate) }),
            })
          : t("history.noNext"),
      }
    : null);

  // ── actions
  // The merchant name and the Merchant row both open the profile, or the picker when
  // no merchant is known yet.
  function openMerchantOrPicker() {
    if (merchant) setOpenMerchant({ id: merchant.id, name: merchant.name });
    else setMerchantPickerOpen(true);
  }

  // The picker saved it (and, with "Also create a rule", the rule and the similar
  // transactions); this only mirrors the result here and in the list.
  function applyCategory(next: number | null) {
    setCategoryId(next);
    onCategorized(row.id, next);
    router.refresh();
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
    const ok = await confirm({
      title: t("confirmDelete"),
      body: t("confirmDeleteBody"),
      confirmLabel: t("confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
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
  const navBtn =
    "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-ground text-clear-ink transition-colors hover:bg-clear-line disabled:cursor-not-allowed disabled:opacity-40";
  const mutedValue = "truncate font-semibold text-clear-muted";

  // The amount as the list shows it (signedAmount): a reimbursement shows what came in,
  // anything else the corrected amount when there is one.
  const shownAmount = Math.abs(row.isReimbursement ? row.amount : row.correctedAmount ?? row.amount);
  const budgetLabel = effectiveBudgetType && BUDGET_KEY[effectiveBudgetType] ? t(`budgetType.${BUDGET_KEY[effectiveBudgetType]}`) : null;
  const overBy = showBudget ? budget!.spent - budget!.budget! : 0;
  // This payment's own part of the budget bar, when it falls in the budget period.
  const period = context.budgetPeriod;
  const inPeriod = !!period && row.date >= period.from && row.date <= period.to;
  const ownPart = showBudget && inPeriod ? Math.min(shownAmount, budget!.spent) : 0;

  const moreMenu = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="group flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1.5 bg-transparent text-xs font-bold text-clear-ink outline-none">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink transition-opacity group-hover:opacity-90 group-focus-visible:ring-3 group-focus-visible:ring-clear-ember/50 [&_svg]:size-5">
          <IconDots aria-hidden />
        </span>
        {t("more")}
      </DropdownMenuTrigger>
      {/* The four main actions are the buttons beside this one; the menu holds the rest. */}
      <DropdownMenuContent align="end" side="top" sideOffset={8} className="min-w-60">
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
        <DropdownMenuItem onClick={() => fileRef.current?.click()}>
          <IconCamera className="size-4" />
          {receiptUrl ? t("actions.replaceReceipt") : t("actions.receipt")}
        </DropdownMenuItem>
        {receiptUrl && (
          <DropdownMenuItem onClick={removeReceipt}>
            <IconX className="size-4" />
            {t("removeReceipt")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleExcluded}>
          {excluded ? <IconEye className="size-4" /> : <IconEyeOff className="size-4" />}
          {excluded ? t("actions.include") : t("actions.exclude")}
        </DropdownMenuItem>
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
        <DropdownMenuItem variant="destructive" onClick={remove}>
          <IconTrash className="size-4" />
          {t("menu.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const nameNode = row.isInternalTransfer ? (
    <h2 className="m-0 truncate text-[17px] font-extrabold tracking-[-0.02em] text-clear-ink">{resolveDisplayName(row)}</h2>
  ) : (
    <button
      type="button"
      onClick={openMerchantOrPicker}
      title={merchant ? t("openMerchant") : t("setMerchant")}
      className="min-w-0 cursor-pointer truncate text-left text-[17px] font-extrabold tracking-[-0.02em] text-clear-ink underline-offset-4 hover:underline"
    >
      {resolveDisplayName(row)}
    </button>
  );

  // What "Edit details" holds, as its one-line preview while closed.
  const fieldPreview = [
    !row.isInternalTransfer ? merchant?.name ?? t("fields.merchant") : null,
    goal ? goal.name : t("noGoal"),
    notes ? t("fields.note") : null,
    receiptUrl ? t("fields.receipt") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const header = (
    <>
      {/* 1. Position and ↑/↓ navigation. The phone sheet brings its own close button. */}
      {position && (
        <div className="flex items-center gap-2" data-tip-anchor="activityKeys">
          <button type="button" onClick={position.onPrev} disabled={!position.onPrev} aria-label={t("previous")} className={navBtn}>
            <IconChevronUp className="size-[18px]" stroke={2.2} />
          </button>
          <button type="button" onClick={position.onNext} disabled={!position.onNext} aria-label={t("next")} className={navBtn}>
            <IconChevronDown className="size-[18px]" stroke={2.2} />
          </button>
          <span className="min-w-0 flex-1 truncate pl-1 text-[13px] text-clear-muted">
            {t("position", { index: position.index, total: position.total })}
            {/* Arrow keys only exist on desktop. */}
            <span className="hidden lg:inline"> · {t("keysHint")}</span>
          </span>
        </div>
      )}

      {/* 2. Who it was with and the amount on one row, the status chips under it */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {/* The shared icon components draw circles; the panel wants the 12px-radius tile. */}
          <span className="inline-flex shrink-0 [&>*]:size-11! [&>*]:rounded-clear-icon!">
            {uncategorised ? (
              <RowIcon row={{ ...row, categoryId }} size="xl" />
            ) : (
              <Icon iconKey={icon.iconKey} color={icon.color} background={icon.background} initials={icon.initials} size="xl" glyphSize={22} soft />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {nameNode}
            <span className="truncate text-[13px] text-clear-muted">{[dateLabel, row.bankName].filter(Boolean).join(" · ")}</span>
          </div>
          <Amount
            value={isExpense ? -shownAmount : shownAmount}
            sign="always"
            className={cn("shrink-0 text-[30px] leading-none tracking-[-0.03em] lg:text-[34px]", isExpense ? "text-clear-ink" : "text-clear-positive")}
          />
        </div>
        {(row.isInternalTransfer || uncategorised || row.isSplit || row.isReimbursement || paidBack > 0 || recurringId != null || excluded || priceChange) && (
          <div className="flex flex-wrap gap-2">
            {!!row.isInternalTransfer && (
              <ClearChip icon={<IconTransfer aria-hidden />}>{(transferType && TRANSFER_TYPE_LABELS[transferType]) || t("internalTransfer")}</ClearChip>
            )}
            {uncategorised && <ClearChip tone="peach">{t("needsCategory")}</ClearChip>}
            {row.isSplit && (
              <ClearChip tone="lilac" icon={<IconArrowsSplit2 aria-hidden />}>
                {t("splitInto", { count: row.splitCount })}
              </ClearChip>
            )}
            {(row.isReimbursement || paidBack > 0) && (
              <ClearChip tone="mint" icon={<IconReceiptRefund aria-hidden />}>
                <MoneyText>{paidBack > 0 ? t("paidBackPill", { amount: formatEur(paidBack) }) : tTags("paidBack")}</MoneyText>
              </ClearChip>
            )}
            {recurringId != null && (
              <ClearChip tone="sky" icon={<IconRepeat aria-hidden />}>
                {recurringItem ? frequencyLabel(recurringItem.frequency) : tTags("recurring")}
              </ClearChip>
            )}
            {excluded && <ClearChip>{tTags("notInReports")}</ClearChip>}
            {priceChange && (
              <ClearChip
                tone={(priceChange.diff > 0) === isIncomeRow ? "mint" : "peach"}
                icon={priceChange.diff > 0 ? <IconArrowUp aria-hidden /> : <IconArrowDown aria-hidden />}
              >
                <MoneyText>{t(isIncomeRow ? (priceChange.diff > 0 ? "incomeUp" : "incomeDown") : priceChange.diff > 0 ? "priceUp" : "priceDown", {
                  amount: formatEur(Math.abs(priceChange.diff)),
                  month: fmtDay(priceChange.date, { month: "long" }),
                })}</MoneyText>
              </ClearChip>
            )}
          </div>
        )}
      </div>

      {/* 3. Summary | Details */}
      <div role="tablist" aria-label={t("tabs.label")} data-tip-anchor="activityDetailTabs" className="flex gap-1 rounded-full bg-clear-tile p-[5px]">
        {(["summary", "details"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tx-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`tx-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setTab(tab === "summary" ? "details" : "summary");
              }
            }}
            className={cn(
              "inline-flex h-9 flex-1 cursor-pointer items-center justify-center rounded-full text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50",
              tab === key ? "bg-clear-primary font-bold text-clear-primary-ink" : "font-semibold text-clear-ink-2 hover:text-clear-ink",
            )}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>
    </>
  );

  const summary = (
    <div role="tabpanel" id="tx-panel-summary" aria-labelledby="tx-tab-summary" className="flex flex-col gap-4">
      {/* What it is and what it did to the budget */}
      <section aria-label={t("tabs.summary")} className="flex flex-col gap-4 rounded-clear-tile bg-clear-tile p-4">
        <div className="flex items-center gap-3">
          {row.isInternalTransfer ? (
            <button type="button" onClick={() => setTransferOpen(true)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-semibold text-clear-muted">{t("fields.transferType")}</span>
                <span className="inline-flex items-center gap-1 truncate text-[15px] font-extrabold">
                  {(transferType && TRANSFER_TYPE_LABELS[transferType]) || t("transferAuto")}
                  <IconChevronDown className="size-3.5 shrink-0 text-clear-muted" stroke={2.2} aria-hidden />
                </span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={row.isSplit ? undefined : () => setPickerOpen(true)}
              disabled={!!row.isSplit}
              aria-label={t("categoryChange", { name: row.isSplit ? t("splitInto", { count: row.splitCount }) : currentCat?.name ?? t("choose") })}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left disabled:cursor-default"
            >
              {currentCat && !row.isSplit && (
                <span className="inline-flex shrink-0 [&>*]:size-10! [&>*]:rounded-clear-icon!">
                  <Icon iconKey={currentCat.icon} color={currentCat.color} size="md" glyphSize={18} soft />
                </span>
              )}
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-semibold text-clear-muted">{t("fields.category")}</span>
                <span className={cn("inline-flex min-w-0 items-center gap-1 text-[15px] font-extrabold", !currentCat && !row.isSplit && "text-clear-warning")}>
                  <span className="truncate">{row.isSplit ? row.splitSummary ?? t("splitInto", { count: row.splitCount }) : currentCat?.name ?? t("choose")}</span>
                  {!row.isSplit && <IconChevronDown className="size-3.5 shrink-0 text-clear-muted" stroke={2.2} aria-hidden />}
                </span>
              </span>
            </button>
          )}
          {budgetLabel && (
            <button
              type="button"
              onClick={currentCat?.budgetType ? () => setBudgetTypeOpen(true) : undefined}
              disabled={!currentCat?.budgetType}
              aria-label={t("budgetTypeChange", { type: budgetLabel })}
              className={cn(
                "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-[13px] font-extrabold disabled:cursor-default",
                effectiveBudgetType === "nodig" ? "bg-clear-sky text-clear-sky-ink" : effectiveBudgetType === "sparen" ? "bg-clear-mint text-clear-mint-ink" : "bg-clear-butter text-clear-butter-ink",
              )}
            >
              {budgetLabel}
              {currentCat?.budgetType && <IconChevronDown className="size-3.5" stroke={2.2} aria-hidden />}
            </button>
          )}
        </div>

        {showBudget && (
          <div className="flex flex-col gap-2 border-t border-clear-line pt-3.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-clear-ink-2">{t("budgetThisPeriod")}</span>
              <span className="tabular-nums text-clear-muted">
                <MoneyText>{t.rich("budgetOfRich", {
                  spent: formatEur(budget!.spent),
                  budget: compactEur(budget!.budget!),
                  b: (c) => <b className="text-[15px] text-clear-ink"><MoneyText>{c}</MoneyText></b>,
                })}</MoneyText>
              </span>
            </div>
            <div aria-hidden className="clear-hatch flex h-2.5 overflow-hidden rounded-full">
              <span
                className={overBy > 0 ? "bg-clear-negative-fill" : "bg-clear-primary"}
                style={{ width: `${Math.min(100, (Math.max(0, budget!.spent - ownPart) / budget!.budget!) * 100)}%` }}
              />
              <span className="bg-clear-ember" style={{ width: `${Math.min(100, (ownPart / budget!.budget!) * 100)}%` }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
              {ownPart > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-clear-ink-2">
                  <span aria-hidden className="size-2.5 rounded-[3px] bg-clear-ember" />
                  <MoneyText>{t("thisPayment", { amount: formatEur(ownPart) })}</MoneyText>
                </span>
              ) : (
                <span />
              )}
              <span className={cn(overBy > 0 ? "font-bold text-clear-negative" : "font-semibold text-clear-muted")}>
                <MoneyText>{overBy > 0
                  ? t("overBudget", { amount: compactEur(overBy) })
                  : period
                    ? t("leftDays", { amount: compactEur(Math.max(0, budget!.budget! - budget!.spent)), count: period.daysLeft })
                    : t("left", { amount: compactEur(Math.max(0, budget!.budget! - budget!.spent)) })}</MoneyText>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Edit details: the remaining fields, folded away until needed */}
      <div className="flex flex-col overflow-hidden rounded-clear-tile border border-clear-line">
        <button
          type="button"
          onClick={() => setFieldsOpen((o) => !o)}
          aria-expanded={fieldsOpen}
          aria-controls="tx-fields"
          className="flex min-h-[60px] w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors hover:bg-clear-tile"
        >
          <IconPencil className="size-[18px] shrink-0 text-clear-ink-2" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-bold">{t("editDetails")}</span>
            <span className="truncate text-xs text-clear-muted">{fieldPreview}</span>
          </span>
          <IconChevronDown className={cn("size-4 shrink-0 text-clear-muted transition-transform duration-200", fieldsOpen && "rotate-180")} stroke={2.2} aria-hidden />
        </button>
        <div
          id="tx-fields"
          className={cn("grid transition-[grid-template-rows] duration-200 ease-out", fieldsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
        >
          <div className="min-h-0 overflow-hidden" inert={!fieldsOpen}>
            <div className="flex flex-col border-t border-clear-line px-3">
              {/* What this cost you after a payback or correction; the correction is editable. */}
              {isExpense && (paidBack > 0 || row.correctedAmount != null) && (
                <FieldRow label={t("fields.yourShare")} onClick={paidBack > 0 ? undefined : () => setCorrectOpen(true)}>
                  <span className="truncate tabular-nums">
                    <MoneyText>{paidBack > 0
                      ? t("shareAfterPayback", { amount: formatEur(Math.max(0, total - paidBack)) })
                      : t("shareCorrected", { amount: formatEur(row.correctedAmount!), original: formatEur(row.amount) })}</MoneyText>
                  </span>
                </FieldRow>
              )}
              {!row.isInternalTransfer && (
                <FieldRow label={t("fields.merchant")} onClick={openMerchantOrPicker}>
                  {merchant ? <span className="truncate">{merchant.name}</span> : <span className={mutedValue}>{t("unknown")}</span>}
                </FieldRow>
              )}
              <FieldRow label={t("fields.savingsGoal")} onClick={savingsGoals.length > 0 && !row.isInternalTransfer ? () => setGoalOpen(true) : undefined}>
                {goal ? <span className="truncate">{goal.name}</span> : <span className={mutedValue}>{t("notLinked")}</span>}
              </FieldRow>
              <FieldRow label={t("fields.note")} onClick={() => setNoteOpen(true)}>
                {notes ? <span className="truncate">{notes}</span> : <span className={mutedValue}>{t("addNote")}</span>}
              </FieldRow>
              <FieldRow label={t("fields.receipt")} onClick={receiptUrl ? () => setViewingReceipt(true) : () => fileRef.current?.click()}>
                {receiptUrl ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-clear-ember-text">
                    <IconReceipt className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{t("viewReceipt")}</span>
                  </span>
                ) : (
                  <span className={mutedValue}>{t("actions.receipt")}</span>
                )}
              </FieldRow>
            </div>
          </div>
        </div>
      </div>

      {/* Where it happened: a button card; the map itself opens in a dialog */}
      {location && (
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="group flex w-full cursor-pointer items-center gap-3.5 text-left"
        >
          <MapThumb />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs font-semibold text-clear-muted">{t("location.label")}</span>
            <span className="truncate text-[15px] font-bold group-hover:underline group-hover:underline-offset-4">{location.label}</span>
            <span className="text-xs text-clear-muted">{t("location.open")}</span>
          </span>
          <IconChevronRight className="size-4 shrink-0 text-clear-muted" stroke={2.2} aria-hidden />
        </button>
      )}

      {/* This month at the merchant, or the recurring item's rhythm: opens the history */}
      {historyRow && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          data-tip-anchor="activityHistory"
          className="group flex min-h-14 w-full cursor-pointer items-center gap-3.5 border-t border-clear-line pt-3 text-left"
        >
          <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-clear-icon bg-clear-tile text-clear-ink-2">
            {merchantRow ? <ColumnsGlyph /> : <IconRepeat className="size-[18px]" stroke={1.9} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-bold group-hover:underline group-hover:underline-offset-4"><MoneyText>{historyRow.title}</MoneyText></span>
            <span className="truncate text-xs text-clear-muted"><MoneyText>{historyRow.sub}</MoneyText></span>
          </span>
          <IconChevronRight className="size-4 shrink-0 text-clear-muted" stroke={2.2} aria-hidden />
        </button>
      )}
    </div>
  );

  // The raw bank data, read-only, with copy buttons for the codes people paste elsewhere.
  const bankRows: { key: string; label: string; value: string; copy?: boolean }[] = [
    ...infoFields.map((f) => ({ key: f.key, label: f.label, value: f.value, copy: /iban|ref|kenmerk|id/i.test(`${f.key} ${f.label}`) })),
  ];
  const transactionRows: { key: string; label: string; value: string; copy?: boolean }[] = [
    { key: "date", label: t("bank.date"), value: dateLabel },
    ...(row.bankName ? [{ key: "account", label: t("bank.account"), value: row.bankName }] : []),
    { key: "amount", label: t("bank.amount"), value: formatEur(row.amount) },
    ...(row.correctedAmount != null ? [{ key: "corrected", label: t("bank.corrected"), value: formatEur(row.correctedAmount) }] : []),
    { key: "description", label: t("bank.description"), value: row.description },
  ];

  const details = (
    <div role="tabpanel" id="tx-panel-details" aria-labelledby="tx-tab-details" className="flex flex-col gap-4">
      {bankRows.length > 0 && <BankGroup title={t("bank.fromBank")} rows={bankRows} copyLabel={(label) => t("bank.copy", { label })} copiedLabel={t("bank.copied")} />}
      <BankGroup title={t("bank.transaction")} rows={transactionRows} copyLabel={(label) => t("bank.copy", { label })} copiedLabel={t("bank.copied")} />
      {row.rawDescription && row.rawDescription !== row.description && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-bold text-clear-muted">{t("bank.raw")}</h3>
          <p className="m-0 break-all rounded-clear-tile bg-clear-tile p-4 font-mono text-[13px] leading-relaxed text-clear-ink-2">{row.rawDescription}</p>
        </section>
      )}
    </div>
  );

  // The four main actions as round buttons, More (black) holding the rest and Delete.
  const actionBar = (
    <div role="toolbar" aria-label={t("actions.label")} className="flex items-start gap-1">
      <ActionButton
        icon={<IconArrowsSplit2 aria-hidden />}
        label={row.isSplit ? t("actions.adjustSplitShort") : t("actions.split")}
        disabled={!!row.isInternalTransfer}
        onClick={() => setSplitOpen(true)}
      />
      <ActionButton icon={<IconLink aria-hidden />} label={t("actions.reimburse")} title={t("actions.link")} disabled={row.direction !== "income"} onClick={() => setLinkOpen(true)} />
      <ActionButton icon={<IconRepeat aria-hidden />} label={t("actions.recurringShort")} title={t("actions.recurring")} disabled={recurringId != null} onClick={() => setRecurringOpen(true)} />
      <ActionButton icon={<IconBolt aria-hidden />} label={t("actions.ruleShort")} title={t("actions.rule")} onClick={() => setRule(newRuleDraft(row, categoryId))} />
      {moreMenu}
    </div>
  );

  // ── what the popups say about this transaction
  const txName = resolveDisplayName(row);
  const txWhen = fmtDay(row.date, { weekday: "short", day: "numeric", month: "short" });
  const txSubtitle = `${txName} · ${txWhen}`;
  const signedAmount = `${isExpense ? "−" : "+"}${formatEur(shownAmount)}`;
  // Correct amount: what the new figure does to the category's budget this period.
  const correctBudget: BudgetPreview | null =
    showBudget && inPeriod && currentCat
      ? { name: currentCat.name, icon: <TxIcon icon={{ iconKey: currentCat.icon, color: currentCat.color }} size="md" />, budget: budget!.budget!, spent: budget!.spent, current: shownAmount }
      : null;
  // Brand icon: the row as it would look with the picked icon.
  const brandPreview = (key: string | null) => (
    <div className="flex min-h-16 items-center gap-3.5 rounded-clear-tile bg-clear-tile py-2.5 pr-4 pl-2.5">
      <TxIcon
        icon={resolveTransactionIcon({
          ...row,
          categoryIcon: currentCat?.icon ?? row.categoryIcon,
          categoryColor: currentCat?.color ?? row.categoryColor,
          merchantIcon: merchant?.icon ?? row.merchantIcon,
          merchantColor: merchant?.color ?? row.merchantColor,
          transferType,
          brandIcon: key,
          brandIconColor: null,
          brandIconBgColor: null,
        })}
        size="lg"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold">{txName}</span>
        <span className="truncate text-[13px] text-clear-muted">{[currentCat?.name, row.bankName, txWhen].filter(Boolean).join(" · ")}</span>
      </span>
      <Amount value={isExpense ? -shownAmount : shownAmount} className="shrink-0 text-[15px]" />
    </div>
  );

  const body = (
    <>
      {header}
      {tab === "summary" ? summary : details}
    </>
  );

  return (
    <>
      {layout === "card" ? (
        <div className="flex h-full min-h-0 flex-col" data-tip-anchor="activityDetail">
          <div className="relative min-h-0 flex-1">
            <div className="clear-scrollbar flex h-full flex-col gap-5 overflow-y-auto p-6 pb-10">{body}</div>
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-clear-card" />
          </div>
          <div className="shrink-0 border-t border-clear-line px-4 pt-3 pb-4">{actionBar}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-5" data-tip-anchor="activityDetail">
          {body}
          <div className="sticky bottom-0 -mx-1 border-t border-clear-line bg-[var(--dialog-background)] px-1 pt-3 pb-[calc(0.5rem+var(--sab))]">{actionBar}</div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={uploadReceipt} />

      {/* ── dialogs ─────────────────────────────────────────────────────────── */}
      <SharedCategoryPickerSheet
        {...NESTED}
        open={pickerOpen && !row.isSplit}
        onOpenChange={setPickerOpen}
        categories={categories}
        current={categoryId != null ? String(categoryId) : undefined}
        apply={{
          ids: [row.id],
          names: [resolveDisplayName(row)],
          // A recurring item already decides this row's category; a rule would be redundant.
          allowRule: recurringId == null,
          onApplied: applyCategory,
        }}
      />

      <ChoiceDialog open={goalOpen} onOpenChange={setGoalOpen} title={t("chooseGoal")} subtitle={txSubtitle}>
        <ChoiceRow active={goalId == null} onClick={() => applyGoal(null)}>
          {t("notLinked")}
        </ChoiceRow>
        {savingsGoals.map((g) => (
          <ChoiceRow key={g.id} active={goalId === g.id} onClick={() => applyGoal(g.id)}>
            <span aria-hidden className="inline-flex shrink-0 [&>*]:size-9! [&>*]:rounded-clear-icon!">
              <Icon iconKey={g.icon} color={g.color} size="sm" glyphSize={16} soft />
            </span>
            <span className="truncate">{g.name}</span>
          </ChoiceRow>
        ))}
      </ChoiceDialog>

      <ChoiceDialog open={budgetTypeOpen} onOpenChange={setBudgetTypeOpen} title={t("fields.budgetType")} subtitle={currentCat?.name}>
        <ChoiceRow active={budgetTypeOverride == null} onClick={() => saveBudgetType(null)}>
          {t("budgetTypeDefault", {
            type: currentCat?.budgetType && BUDGET_KEY[normalizeBudgetType(currentCat.budgetType)]
              ? t(`budgetType.${BUDGET_KEY[normalizeBudgetType(currentCat.budgetType)]}`)
              : "—",
          })}
        </ChoiceRow>
        {(["nodig", "willen", "sparen"] as const).map((key) => (
          <ChoiceRow key={key} active={normalizeBudgetType(budgetTypeOverride) === key} onClick={() => saveBudgetType(key)}>
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", key === "nodig" ? "bg-clear-sky-ink" : key === "sparen" ? "bg-clear-mint-ink" : "bg-clear-butter-ink")} />
            {t(`budgetType.${BUDGET_KEY[key]}`)}
          </ChoiceRow>
        ))}
      </ChoiceDialog>

      <ChoiceDialog open={transferOpen} onOpenChange={setTransferOpen} title={t("fields.transferType")} subtitle={txSubtitle}>
        <ChoiceRow active={transferType == null} onClick={() => saveTransferType(null)}>
          {t("transferAuto")}
        </ChoiceRow>
        {TRANSFER_TYPES.map((x) => (
          <ChoiceRow key={x.value} active={transferType === x.value} onClick={() => saveTransferType(x.value)}>
            {x.label}
          </ChoiceRow>
        ))}
      </ChoiceDialog>

      <NoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        subtitle={txSubtitle}
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
        subtitle={txSubtitle}
        original={row.amount}
        isExpense={row.direction === "expense"}
        initial={row.correctedAmount}
        budget={correctBudget}
        onSave={async (value) => {
          await patchTransaction({ id: row.id, correctedAmount: value });
          setCorrectOpen(false);
          router.refresh();
        }}
      />

      <IconPickerDialog
        open={iconOpen}
        onOpenChange={setIconOpen}
        subject={{ kind: "transaction", name: merchant?.name ?? txName }}
        value={{ icon: row.brandIcon, color: null }}
        withColor={false}
        renderPreview={(c) => brandPreview(c.icon)}
        noneLabel={t("brand.useDefault")}
        onApply={async (c) => {
          await patchTransaction({ id: row.id, brandIcon: c.icon, brandIconColor: null, brandIconBgColor: null });
          router.refresh();
        }}
      />

      {splitOpen && (
        <SplitTransactionDialog
          open={splitOpen}
          onOpenChange={setSplitOpen}
          transactionId={row.id}
          subtitle={`${txSubtitle} · ${signedAmount}`}
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

      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title={merchant?.name ?? resolveDisplayName(row)}
        isIncome={isIncomeRow}
        merchantId={row.direction === "expense" ? merchantId : null}
        period={merchantPeriod}
        periodLabel={tHistory("thisMonth")}
        recurring={
          recurringItem && last12.length > 0
            ? {
                charges: last12,
                next: nextDate ? { date: nextDate, value: Math.abs(recurringItem.amount ?? last12[last12.length - 1].value) } : null,
                info: [
                  recurringItem.friendlyName || recurringItem.name,
                  recurringItem.startDate && isValidISODate(recurringItem.startDate)
                    ? t("since", { frequency: frequencyLabel(recurringItem.frequency), date: fmtDay(recurringItem.startDate, { month: "long", year: "numeric" }) })
                    : frequencyLabel(recurringItem.frequency),
                  paidThisYear > 0 ? t(isIncomeRow ? "receivedInYear" : "paidInYear", { amount: formatEur(paidThisYear), year }) : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }
            : null
        }
        onEditRecurring={recurringItem ? () => { setHistoryOpen(false); setRecurringDetailOpen(true); } : undefined}
        onOpenProfile={merchant ? () => { setHistoryOpen(false); setOpenMerchant({ id: merchant.id, name: merchant.name }); } : undefined}
        locale={locale}
      />

      {location && (
        <Dialog open={mapOpen} onOpenChange={setMapOpen}>
          <DialogContent {...NESTED} title={location.label}>
            {mapOpen && <TransactionMap name={locationName} />}
          </DialogContent>
        </Dialog>
      )}

      <TransactionRuleDialog draft={rule} categories={categories} onClose={() => { setRule(null); router.refresh(); }} />

      <MerchantDetailPortal merchant={openMerchant} onClose={() => setOpenMerchant(null)} onChangeMerchant={() => setMerchantPickerOpen(true)} />
      <MerchantPickerDialog
        open={merchantPickerOpen}
        currentId={merchant?.id ?? null}
        suggestion={guessMerchant(row.description)}
        subtitle={t("merchantFor", { name: txName, amount: signedAmount })}
        onOpenChange={setMerchantPickerOpen}
        onPick={pickMerchant}
      />

      <ReceiptViewer
        open={viewingReceipt}
        onOpenChange={setViewingReceipt}
        url={receiptUrl}
        name={txName}
        transaction={
          <div className="flex items-center gap-3 rounded-clear-tile border border-clear-line p-3">
            <TxIcon icon={icon} size="md" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-bold">{txName}</span>
              <span className="truncate text-[13px] text-clear-muted">{[txWhen, currentCat?.name].filter(Boolean).join(" · ")}</span>
            </span>
            <Amount value={isExpense ? -shownAmount : shownAmount} className="shrink-0 text-[15px]" />
          </div>
        }
        onReplace={() => fileRef.current?.click()}
        onRemove={async () => {
          setViewingReceipt(false);
          await removeReceipt();
        }}
      />
    </>
  );
}

// ── rows, tiles and charts ─────────────────────────────────────────────────────

/** A row of the field list: label left, value right, and a chevron when it opens
 *  something. Rows without an action keep the chevron's space so values line up. */
function FieldRow({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-clear-muted">{label}</span>
      <span className="flex min-w-0 max-w-[65%] items-center justify-end gap-2 text-right text-[15px] font-bold text-clear-ink">{children}</span>
      {onClick ? <IconChevronRight className="size-4 shrink-0 text-clear-placeholder" stroke={2.2} aria-hidden /> : <span aria-hidden className="size-4 shrink-0" />}
    </>
  );
  const cls = "flex min-h-[52px] w-full items-center gap-3 border-b border-clear-ground px-1 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:bg-clear-tile")}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** One of the round buttons in the panel's action bar: a 44px circle with its label under it. */
function ActionButton({
  icon,
  label,
  title,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  /** The longer name, as a tooltip, when the label is shortened. */
  title?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="group flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1.5 text-xs font-bold text-clear-ink outline-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-clear-tile transition-colors group-hover:bg-clear-line group-disabled:group-hover:bg-clear-tile group-focus-visible:ring-3 group-focus-visible:ring-clear-ember/50 [&_svg]:size-5">
        {icon}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

/** A group of read-only bank fields: label over value, with a copy button where useful. */
function BankGroup({
  title,
  rows,
  copyLabel,
  copiedLabel,
}: {
  title: string;
  rows: { key: string; label: string; value: string; copy?: boolean }[];
  copyLabel: (label: string) => string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // Clipboard blocked: nothing to do, the value is on screen to select by hand.
    }
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[13px] font-bold text-clear-muted">{title}</h3>
      <dl className="m-0 flex flex-col rounded-clear-tile bg-clear-tile px-4">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3 border-b border-clear-line py-2.5 last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <dt className="text-xs font-semibold text-clear-muted">{r.label}</dt>
              <dd className="m-0 break-words text-sm font-bold text-clear-ink"><MoneyText>{r.value}</MoneyText></dd>
            </div>
            {r.copy && (
              <button
                type="button"
                onClick={() => copy(r.key, r.value)}
                aria-label={copied === r.key ? copiedLabel : copyLabel(r.label)}
                title={copied === r.key ? copiedLabel : copyLabel(r.label)}
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink-2 transition-colors hover:text-clear-ink"
              >
                {copied === r.key ? <IconCheck className="size-3.5" stroke={2.6} /> : <IconCopy className="size-3.5" stroke={2} />}
              </button>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Bars for the last 12 charges: the current price in ember, older prices in the
 *  line grey, and the next charge as a dashed outline. Month initials underneath. */
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
              fill={b.next ? "none" : isCurrent ? "var(--clr-ember)" : "var(--clr-line)"}
              stroke={b.next ? "var(--clr-ember-text)" : undefined}
              strokeDasharray={b.next ? "3 3" : undefined}
              strokeWidth={b.next ? 1.5 : undefined}
            />
          );
        })}
      </svg>
      <div className="flex justify-between">
        {bars.map((b, i) => (
          <span key={i} className={cn("text-center text-xs", b.next ? "text-clear-ember-text" : "text-clear-muted")} style={{ width: `${100 / bars.length}%` }}>
            {new Date(`${b.date}T12:00:00`).toLocaleDateString(locale, { month: "narrow" })}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The calendar month a date falls in, as YYYY-MM-DD bounds. */
function monthOf(date: string) {
  const [y, m] = date.slice(0, 7).split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

function isIncomeRowOf(row: TransactionRow) {
  return row.direction === "income";
}

/** The mockup's column-chart glyph for the merchant row. */
function ColumnsGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20V12M10 20V6M16 20v-9M22 20H2" />
    </svg>
  );
}

/** Whole days from a date until today (0 on the day itself). */
function daysUntilFrom(date: string) {
  const a = new Date(`${date}T12:00:00`).getTime();
  const b = new Date(`${isoToday()}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function shownAmountOf(row: TransactionRow) {
  return Math.abs(row.isReimbursement ? row.amount : row.correctedAmount ?? row.amount);
}

/** A small drawn map for the location card — decorative, theme-aware. */
function MapThumb() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden className="shrink-0 overflow-hidden rounded-clear-icon">
      <rect width="72" height="72" fill="var(--clr-tile)" />
      <rect x="6" y="6" width="22" height="16" rx="3" fill="var(--clr-line)" />
      <rect x="6" y="30" width="22" height="14" rx="3" fill="var(--clr-mint)" />
      <rect x="40" y="6" width="26" height="22" rx="3" fill="var(--clr-line)" />
      <rect x="44" y="40" width="22" height="12" rx="3" fill="var(--clr-line)" />
      <path d="M0 26H72M34 0V72" stroke="var(--clr-card)" strokeWidth="5" />
      <path d="M0 62C20 54 46 66 72 56" stroke="var(--clr-sky)" strokeWidth="6" fill="none" />
      <path d="M34 42c-5-6-8-10-8-15a8 8 0 0 1 16 0c0 5-3 9-8 15z" fill="var(--clr-ember)" />
      <circle cx="34" cy="27" r="3" fill="var(--clr-card)" />
    </svg>
  );
}

type MerchantHistory = { chart: { date: string; actual: number | null }[]; recent: { id: number; date: string; amount: number }[]; visitCount: number; avgVisit: number | null };

/**
 * The history behind a transaction: a recurring item's last 12 charges or payments
 * (with the price change and the next one), and for a merchant the last 12 months of
 * spend there plus the latest visits. Opened from the history row of the panel.
 */
function HistoryDialog({
  open,
  onOpenChange,
  title,
  isIncome,
  merchantId,
  period,
  periodLabel,
  recurring,
  onEditRecurring,
  onOpenProfile,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  isIncome: boolean;
  merchantId: number | null;
  period: { total: number; visits: number } | null;
  /** "This month", or the transaction's month name. */
  periodLabel: string;
  recurring: { charges: { date: string; value: number }[]; next: { date: string; value: number } | null; info: string } | null;
  onEditRecurring?: () => void;
  onOpenProfile?: () => void;
  locale: string;
}) {
  const t = useTranslations("activity.detail.history");
  const tDetail = useTranslations("activity.detail");
  const [history, setHistory] = useState<MerchantHistory | null>(null);

  useEffect(() => {
    if (!open || merchantId == null) return;
    let cancelled = false;
    fetch(`/api/merchants/${merchantId}/detail`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setHistory(d); })
      .catch(() => { /* the section stays empty */ });
    return () => { cancelled = true; };
  }, [open, merchantId]);

  // The detail's chart is cumulative per month; the last 12 differences are the months.
  const months: { date: string; value: number }[] = [];
  if (history) {
    const pts = history.chart;
    for (let i = Math.max(1, pts.length - 12); i < pts.length; i++) {
      months.push({ date: pts[i].date, value: Math.max(0, (pts[i].actual ?? 0) - (pts[i - 1].actual ?? 0)) });
    }
  }
  const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00`).toLocaleDateString(locale, opts);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...NESTED} title={title}>
        <div className="flex flex-col gap-6 pb-1 font-clear text-clear-ink">
          {recurring && (
            <section className="flex flex-col gap-3">
              <h3 className="m-0 text-sm font-bold text-clear-muted">{tDetail(isIncome ? "last12Income" : "last12")}</h3>
              <ChargesChart charges={recurring.charges} next={recurring.next} locale={locale} />
              {recurring.next && (
                <ClearTile className="flex items-center justify-between gap-3 py-3">
                  <span className="text-[13px] font-semibold text-clear-muted">{tDetail(isIncome ? "nextPayment" : "nextCharge")}</span>
                  <span className="text-sm font-bold">
                    <MoneyText>{fmt(recurring.next.date, { weekday: "short", day: "numeric", month: "short" })}</MoneyText> · <MoneyText>{formatEur(recurring.next.value)}</MoneyText>
                  </span>
                </ClearTile>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs leading-normal text-clear-muted"><MoneyText>{recurring.info}</MoneyText></span>
                {onEditRecurring && (
                  <button type="button" onClick={onEditRecurring} className="shrink-0 cursor-pointer text-[13px] font-bold text-clear-ember-text hover:underline">
                    {tDetail("editRecurring")}
                  </button>
                )}
              </div>
            </section>
          )}

          {merchantId != null && (
            <section className="flex flex-col gap-3">
              <h3 className="m-0 text-sm font-bold text-clear-muted">{t("last12Months")}</h3>
              <div className="grid grid-cols-3 gap-2">
                <ClearTile className="flex flex-col gap-0.5 p-3">
                  <span className="text-xs text-clear-muted">{periodLabel}</span>
                  <span className="clear-amount text-base"><MoneyText>{formatEur(period?.total ?? 0)}</MoneyText></span>
                </ClearTile>
                <ClearTile className="flex flex-col gap-0.5 p-3">
                  <span className="text-xs text-clear-muted">{t("visitsLabel")}</span>
                  <span className="clear-amount text-base">{period?.visits ?? 0}</span>
                </ClearTile>
                <ClearTile className="flex flex-col gap-0.5 p-3">
                  <span className="text-xs text-clear-muted">{t("avgVisit")}</span>
                  <span className="clear-amount text-base"><MoneyText>{history?.avgVisit != null ? formatEur(history.avgVisit) : "—"}</MoneyText></span>
                </ClearTile>
              </div>
              {months.length > 0 && <MonthBars months={months} locale={locale} />}
              {history && history.recent.length > 0 && (
                <ul className="m-0 flex list-none flex-col p-0">
                  {history.recent.slice(0, 6).map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 border-b border-clear-line py-2.5 text-sm last:border-b-0">
                      <span className="text-clear-ink-2">{fmt(v.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                      <span className="font-bold tabular-nums"><MoneyText>{formatEur(v.amount)}</MoneyText></span>
                    </li>
                  ))}
                </ul>
              )}
              {onOpenProfile && (
                <button type="button" onClick={onOpenProfile} className={cn(clearButtonVariants({ variant: "secondary" }), "w-full")}>
                  {t("openProfile")}
                </button>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Spend per month at a merchant: the current month in ember, the others in line grey. */
function MonthBars({ months, locale }: { months: { date: string; value: number }[]; locale: string }) {
  const max = Math.max(...months.map((m) => m.value), 0.01);
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden className="flex h-20 items-end gap-1.5">
        {months.map((m, i) => (
          <span
            key={m.date}
            title={formatEur(m.value)}
            className={cn("flex-1 rounded-[4px]", i === months.length - 1 ? "bg-clear-ember" : "bg-clear-line")}
            style={{ height: `${Math.max(4, (m.value / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex gap-1.5">
        {months.map((m) => (
          <span key={m.date} className="flex-1 text-center text-xs text-clear-muted">
            {new Date(`${m.date.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, { month: "narrow" })}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── small building blocks ──────────────────────────────────────────────────────

/** A transaction, category or merchant icon as the Clear 12px-radius tile. */
function TxIcon({
  icon,
  size,
}: {
  icon: { iconKey?: string | null; color?: string | null; background?: string | null; initials?: string | null };
  size: "md" | "lg";
}) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 [&>*]:rounded-clear-icon!", size === "md" ? "[&>*]:size-10!" : "[&>*]:size-11!")}>
      <Icon
        iconKey={icon.iconKey}
        color={icon.color}
        background={icon.background}
        initials={icon.initials}
        size={size === "md" ? "md" : "xl"}
        glyphSize={size === "md" ? 18 : 22}
        soft
      />
    </span>
  );
}

/** "12.5" → "12,50": amount inputs take a comma as the decimal separator. */
const toAmountInput = (n: number) => n.toFixed(2).replace(".", ",");
const parseAmountInput = (v: string) => parseFloat(v.replace(",", "."));
const AMOUNT_INPUT_CHARS = /[^0-9.,]/g;

/** A short choice list (savings goal, budget type, transfer type) in a Clear dialog. */
function ChoiceDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("activity.detail");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...NESTED} hideHeaderRow title={title} className="gap-5 pt-7 font-clear text-clear-ink">
        <ClearDialogHeader title={title} subtitle={subtitle} onClose={() => onOpenChange(false)} closeLabel={t("close")} />
        <div role="listbox" aria-label={title} className="clear-scrollbar -mx-1 flex max-h-[60vh] flex-col gap-1 overflow-y-auto px-1 py-0.5">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex min-h-14 w-full shrink-0 cursor-pointer items-center gap-3 rounded-clear-row px-3 text-left text-[15px] text-clear-ink transition-colors",
        active ? "bg-clear-tile font-bold ring-2 ring-clear-ink ring-inset" : "font-semibold hover:bg-clear-tile",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3 truncate">{children}</span>
      {active && (
        <span aria-hidden className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink">
          <IconCheck className="size-4" stroke={2.6} />
        </span>
      )}
    </button>
  );
}

function NoteDialog({
  open,
  onOpenChange,
  subtitle,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtitle: string;
  initial: string;
  onSave: (value: string) => Promise<void>;
}) {
  const t = useTranslations("activity.detail");
  const formId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...NESTED}
        hideHeaderRow
        title={t("fields.note")}
        className="gap-5 pt-7 font-clear text-clear-ink"
        footer={
          <ClearDialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} className={clearButtonVariants({ variant: "secondary" })}>
              {t("cancel")}
            </button>
            <button type="submit" form={formId} className={clearButtonVariants()}>
              {t("save")}
            </button>
          </ClearDialogFooter>
        }
      >
        <ClearDialogHeader title={t("fields.note")} subtitle={subtitle} onClose={() => onOpenChange(false)} closeLabel={t("close")} />
        {open && <NoteBody formId={formId} initial={initial} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function NoteBody({ formId, initial, onSave }: { formId: string; initial: string; onSave: (value: string) => Promise<void> }) {
  const t = useTranslations("activity.detail");
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (saving) return;
    setSaving(true);
    await onSave(value);
    setSaving(false);
  }
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-1.5"
    >
      <label htmlFor={`${formId}-note`} className="sr-only">
        {t("fields.note")}
      </label>
      <textarea
        id={`${formId}-note`}
        rows={4}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Enter saves; Shift+Enter starts a new line.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={t("notePlaceholder")}
        className="w-full resize-none rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 py-3 text-[15px] text-clear-ink outline-none transition-colors placeholder:text-clear-placeholder focus:border-clear-ink"
      />
      <p className="m-0 text-[13px] text-clear-muted">{t("noteHint")}</p>
    </form>
  );
}

type BudgetPreview = { name: string; icon: React.ReactNode; budget: number; spent: number; current: number };

function AmountDialog({
  open,
  onOpenChange,
  subtitle,
  original,
  isExpense,
  initial,
  budget,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtitle: string;
  original: number;
  isExpense: boolean;
  initial: number | null;
  /** The category's budget this period, when this payment counts in it. */
  budget: BudgetPreview | null;
  onSave: (value: number | null) => Promise<void>;
}) {
  const t = useTranslations("activity.detail");
  const formId = useId();
  const [saving, setSaving] = useState(false);
  async function save(value: number | null) {
    setSaving(true);
    await onSave(value);
    setSaving(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...NESTED}
        hideHeaderRow
        title={t("menu.correctAmount")}
        className="gap-5 pt-7 font-clear text-clear-ink"
        footer={
          <ClearDialogFooter
            destructive={
              initial != null ? (
                <button type="button" onClick={() => save(null)} disabled={saving} className={clearButtonVariants({ variant: "danger" })}>
                  {t("correct.remove")}
                </button>
              ) : undefined
            }
          >
            <button type="button" onClick={() => onOpenChange(false)} className={clearButtonVariants({ variant: "secondary" })}>
              {t("cancel")}
            </button>
            <button type="submit" form={formId} disabled={saving} className={clearButtonVariants()}>
              {saving ? t("saving") : t("save")}
            </button>
          </ClearDialogFooter>
        }
      >
        <ClearDialogHeader
          title={t("menu.correctAmount")}
          subtitle={subtitle}
          icon={
            <IconTile tone="peach">
              <IconPencil stroke={1.9} />
            </IconTile>
          }
          onClose={() => onOpenChange(false)}
          closeLabel={t("close")}
        />
        {open && <AmountBody formId={formId} original={original} isExpense={isExpense} initial={initial} budget={budget} onSave={save} />}
        <AnchoredTip id="correctAmountPreview" anchor="correctAmountPreview" active={open && budget != null} />
      </DialogContent>
    </Dialog>
  );
}

function AmountBody({
  formId,
  original,
  isExpense,
  initial,
  budget,
  onSave,
}: {
  formId: string;
  original: number;
  isExpense: boolean;
  initial: number | null;
  budget: BudgetPreview | null;
  onSave: (value: number | null) => Promise<void>;
}) {
  const t = useTranslations("activity.detail");
  const [value, setValue] = useState(initial != null ? toAmountInput(initial) : "");
  const parsed = parseAmountInput(value);
  const valid = value.trim() !== "" && !isNaN(parsed);
  const next = valid ? parsed : original;
  const diff = Math.round((next - original) * 100) / 100;

  // The budget before and after: the spend loses what this payment counts for now
  // and gains the new figure.
  const after = budget ? budget.spent - budget.current + next : 0;

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(valid ? parsed : null);
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5 rounded-clear-tile bg-clear-tile p-4">
          <span className="text-[13px] font-bold text-clear-ink-2">{t("originalAmount")}</span>
          <Amount value={isExpense ? -original : original} className="text-[28px] leading-none tracking-[-0.03em] text-clear-ink-2" />
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-clear-muted">
            <IconBuildingBank className="size-4 shrink-0" stroke={1.9} aria-hidden />
            {t("correct.fromBank")}
          </span>
        </div>
        <span aria-hidden className="hidden size-7 items-center justify-center self-center rounded-full bg-clear-ground text-clear-ink-2 sm:inline-flex">
          <IconArrowRight className="size-4" stroke={2.2} />
        </span>
        <div className="flex flex-col justify-center gap-2">
          <label htmlFor={`${formId}-amount`} className="text-[13px] font-bold text-clear-ink-2">
            {t("correctedAmount")}
          </label>
          <div className="flex h-[60px] items-center gap-1 rounded-clear-row border-[1.5px] border-clear-line bg-clear-card px-4 transition-colors focus-within:border-clear-ink focus-within:ring-4 focus-within:ring-clear-ink/8">
            <span aria-hidden className="clear-amount text-[26px] text-clear-muted">
              {currencySymbol()}
            </span>
            <input
              id={`${formId}-amount`}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value.replace(AMOUNT_INPUT_CHARS, ""))}
              placeholder={toAmountInput(original)}
              aria-describedby={`${formId}-help`}
              className="clear-amount h-full min-w-0 flex-1 bg-transparent p-0 text-[26px] tracking-[-0.02em] text-clear-ink outline-none placeholder:text-clear-placeholder"
            />
          </div>
          {valid && (
            <span className={cn("text-[13px] font-semibold", diff === 0 ? "text-clear-muted" : (diff < 0) === isExpense ? "text-clear-positive" : "text-clear-warning")}>
              <MoneyText>{diff === 0 ? t("correct.same") : diff < 0 ? t("correct.less", { amount: formatEur(-diff) }) : t("correct.more", { amount: formatEur(diff) })}</MoneyText>
            </span>
          )}
        </div>
      </div>

      <p id={`${formId}-help`} className="m-0 flex gap-2.5 text-sm leading-normal text-clear-ink-2">
        <IconInfoCircle className="mt-0.5 size-[18px] shrink-0" stroke={2} aria-hidden />
        <span>{t("correct.help")}</span>
      </p>

      {budget && (
        <div data-tip-anchor="correctAmountPreview" className="flex items-center gap-3 rounded-clear-tile bg-clear-tile px-4 py-3.5">
          {budget.icon}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] font-bold">{t("correct.previewTitle", { category: budget.name })}</span>
            <span className="text-[13px] text-clear-muted">
              <MoneyText>{after > budget.budget
                ? t("correct.previewOver", { over: formatEur(after - budget.budget), budget: compactEur(budget.budget) })
                : t("correct.previewLeft", { left: formatEur(budget.budget - after), budget: compactEur(budget.budget) })}</MoneyText>
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 text-[15px] font-extrabold whitespace-nowrap tabular-nums">
            <span className="font-bold text-clear-muted"><MoneyText>{formatEur(budget.spent)}</MoneyText></span>
            <IconArrowRight className="size-3.5 text-clear-muted" stroke={2.2} aria-hidden />
            <span><MoneyText>{formatEur(after)}</MoneyText></span>
          </span>
        </div>
      )}
    </form>
  );
}

/**
 * The receipt, big: zoomable on the left (desktop) or on top (phone), with the linked
 * transaction and Download / Replace / Remove beside it.
 */
function ReceiptViewer({
  open,
  onOpenChange,
  url,
  name,
  transaction,
  onReplace,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  name: string;
  /** The transaction card: icon, name, meta line and amount, already rendered. */
  transaction: React.ReactNode;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("activity.detail");
  const [zoom, setZoom] = useState(1);
  const ZOOMS = [1, 1.5, 2, 3, 4];
  const level = ZOOMS.indexOf(zoom);
  const roundBtn =
    "inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-clear-ground text-clear-ink transition-colors hover:bg-clear-line disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <Dialog
      open={open && !!url}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setZoom(1);
      }}
    >
      <DialogContent
        hideHeaderRow
        title={t("receipt.title")}
        sheetClassName={cn(NESTED.sheetClassName, "lg:max-w-[1000px]")}
        overlayClassName={NESTED.overlayClassName}
        className="gap-5 pt-7 font-clear text-clear-ink lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-x-2 lg:gap-y-5 lg:p-3.5"
      >
        <div className="lg:col-start-2 lg:row-start-1 lg:px-3.5 lg:pt-3.5">
          <ClearDialogHeader title={t("receipt.title")} subtitle={t("receipt.subtitle")} onClose={() => onOpenChange(false)} closeLabel={t("close")} />
        </div>

        <div className="relative flex h-[52dvh] min-h-0 overflow-hidden rounded-clear-tile bg-clear-tile lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-[min(720px,82dvh)]">
          <div className="clear-scrollbar flex min-h-0 flex-1 overflow-auto p-6 pb-20">
            {url && (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded receipt
              <img
                src={url}
                alt={t("receipt.alt", { name })}
                className={cn("m-auto shadow-clear-dialog", zoom === 1 && "max-h-full max-w-full object-contain")}
                style={zoom === 1 ? undefined : { width: `${zoom * 100}%`, maxWidth: "none" }}
              />
            )}
          </div>
          <div
            role="toolbar"
            aria-label={t("receipt.zoom")}
            data-tip-anchor="receiptZoom"
            className="absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-clear-card p-1.5 shadow-clear-float"
          >
            <button type="button" onClick={() => setZoom(ZOOMS[level - 1])} disabled={level <= 0} aria-label={t("receipt.zoomOut")} className={roundBtn}>
              <IconZoomOut className="size-[18px]" stroke={2} />
            </button>
            <output aria-label={t("receipt.zoomLevel")} className="min-w-[58px] text-center text-sm font-extrabold tabular-nums">
              {Math.round(zoom * 100)}%
            </output>
            <button type="button" onClick={() => setZoom(ZOOMS[level + 1])} disabled={level >= ZOOMS.length - 1} aria-label={t("receipt.zoomIn")} className={roundBtn}>
              <IconZoomIn className="size-[18px]" stroke={2} />
            </button>
            <span aria-hidden className="mx-1 h-6 w-px bg-clear-line" />
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label={t("receipt.fit")}
              title={t("receipt.fit")}
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink transition-opacity hover:opacity-90"
            >
              <IconArrowsMinimize className="size-[18px]" stroke={2} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-2 lg:px-3.5 lg:pb-3.5">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold text-clear-ink-2">{t("receipt.linked")}</span>
            {transaction}
          </div>
          <div className="mt-auto flex flex-col gap-2">
            {url && (
              <a href={url} download className={cn(clearButtonVariants(), "w-full")}>
                <IconDownload aria-hidden />
                {t("receipt.download")}
              </a>
            )}
            <button type="button" onClick={onReplace} className={cn(clearButtonVariants({ variant: "secondary" }), "w-full")}>
              <IconCamera aria-hidden />
              {t("actions.replaceReceipt")}
            </button>
            <button type="button" onClick={onRemove} className={cn(clearButtonVariants({ variant: "danger" }), "w-full")}>
              <IconTrash aria-hidden />
              {t("removeReceipt")}
            </button>
          </div>
        </div>
        <AnchoredTip id="receiptViewer" anchor="receiptZoom" active={open && !!url} />
      </DialogContent>
    </Dialog>
  );
}

// ── rules ──────────────────────────────────────────────────────────────────────

/** A rule from this transaction: its merchant-ish description and, for "This amount",
 *  its own amount. */
function newRuleDraft(row: TransactionRow, categoryId: number | null): RuleDraft {
  const amount = row.correctedAmount ?? row.amount;
  return {
    ...emptyRuleDraft(categoryId),
    pattern: guessMerchant(row.description),
    amountExact: amount != null ? toRuleAmountInput(amount) : "",
  };
}

/**
 * "Create a rule" from this transaction: the shared rule dialog over this panel. Saving
 * creates the rule, moves every transaction it matches now (hand-categorised ones too —
 * what the preview promises) and runs the rules pass so future imports follow.
 */
function TransactionRuleDialog({ draft, categories, onClose }: { draft: RuleDraft | null; categories: Category[]; onClose: () => void }) {
  const t = useTranslations("activity.rule");
  // Keep the last draft through the close animation.
  const [last, setLast] = useState(draft);
  if (draft && draft !== last) setLast(draft);

  async function save(fields: RuleFields, categoryId: number | null) {
    if (categoryId == null) return;
    const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await fetch("/api/category-rules", json("POST", { categoryId, ...fields }));
    const { ids = [] } = await fetchRuleMatches(fields, { ids: true }).catch(() => ({ ids: [] as number[] }));
    if (ids.length > 0) await fetch("/api/transactions", json("PATCH", { ids, categoryId }));
    await fetch("/api/apply-rules", { method: "POST" });
    onClose();
  }

  return (
    <RuleDialog
      {...NESTED}
      open={draft != null}
      onOpenChange={(v) => !v && onClose()}
      initial={last}
      title={t("titleCreate")}
      categories={categories}
      moveAll
      onSubmit={save}
    />
  );
}
