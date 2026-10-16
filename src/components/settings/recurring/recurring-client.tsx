"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconChevronDown, IconDotsVertical, IconPlus, IconRepeat, IconSearch, IconTrash } from "@tabler/icons-react";
import type { RecurringItem, Category } from "@/db/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ClearSwitch } from "@/components/clear/switch";
import { Segmented } from "@/components/clear/segmented";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { Icon } from "@/components/icon";
import { DatePicker } from "@/components/date-picker";
import { ContextualTip } from "@/components/contextual-tip";
import { CategoryPickerSheet } from "@/components/category-picker";
import { AnchoredTip } from "@/components/anchored-tip";
import { RecurringCharges, useLinkedTransactions, useMatchPreview, type MatchCriteria } from "./recurring-charges";
import { currencySymbol, formatEur } from "@/lib/format";
import { evaluateExpression } from "@/lib/amount-expression";
import { isValidISODate } from "@/lib/date-valid";
import { PLAN_MAX_PARTS, PLAN_MIN_PARTS, planPartAmount, planSchedule } from "@/lib/payment-plan";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

/** Starting values for a new recurrence, for callers that already know some of them —
 *  "make this transaction recurring" fills in the name, amount, category and so on.
 *  Everything is optional; anything absent falls back to the same defaults a blank form
 *  would use. Strings throughout, because they seed form fields verbatim. */
export interface RecurringPrefill {
  name?: string;
  type?: string;
  amount?: string;
  budgetType?: string;
  /** ISO date the recurrence starts on. The editor derives dueDay from it on save, so
   *  passing the source transaction's own date is both the honest value and the one that
   *  makes the due day read correctly. Defaults to today. */
  startDate?: string;
  matchPattern?: string;
  matchAmount?: string;
  categoryId?: string;
}

interface AddProps {
  action: "add";
  variant?: "default" | "icon" | "fab";
  prefill?: RecurringPrefill;
  /** Already translated; overrides "New recurring item" / "Make recurring" (Home's "Set your salary"). */
  title?: string;
  /** Controlled open, for callers with their own trigger (the transaction detail
   *  panel's "Make recurring"). When set, no built-in trigger button is rendered. */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** The row as saved, for callers that need to reflect it in their own state. */
  onSaved?: (item: RecurringItem) => void;
}
interface EditProps {
  action: "edit";
  item: RecurringItem;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  onSaved?: (item: RecurringItem) => void;
  /** Hide the end-date editor — used when this bill is linked to a debt, whose own
   *  computed "last payment on" date is the source of truth for the end date. */
  lockEndDate?: boolean;
}
type Props = AddProps | EditProps;

const TYPES = ["bill", "subscription", "income", "debt", "plan", "savings"] as const;
const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;
const BUDGET_TYPES = [
  { value: "nodig", key: "needs" },
  { value: "willen", key: "wants" },
  { value: "sparen", key: "savings" },
] as const;

const FIELD_BOX =
  "flex h-12 items-center gap-1.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 transition-colors focus-within:border-clear-ink";
const FIELD_INPUT =
  "min-w-0 w-full flex-1 border-none bg-transparent p-0 font-clear text-[15px] font-extrabold tabular-nums text-clear-ink outline-none placeholder:font-semibold placeholder:text-clear-placeholder";
const LABEL = "text-[13px] font-bold text-clear-ink-2";
const DATE_TRIGGER =
  "mt-0 mb-0 h-12 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 font-clear text-[15px] font-bold text-clear-ink focus-visible:border-clear-ink focus-visible:ring-0";
const OPERATOR = /\d\s*[+\-*/×÷−]\s*\d/;

/** Typed amounts: whichever of "," and "." comes last is the decimal separator, the
 *  other a thousands separator; sums ("12+3") still work like the old keypad. */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/[\s€$£]/g, "");
  if (!s) return null;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  const cleaned = comma > dot ? s.replace(/\./g, "") : comma !== -1 ? s.replace(/,/g, "") : s;
  return evaluateExpression(cleaned);
}

/** Your own share of a shared bill: the gross charge minus what everyone else pays back. */
function ownShare(amount: number | null, reimbursed: string): number | null {
  if (amount == null) return null;
  const back = parseFloat(reimbursed.replace(",", "."));
  if (!Number.isFinite(back) || back <= 0) return amount;
  return Math.max(0, Math.round((amount - back) * 100) / 100);
}

/** An even split of `amount` across `people` (you included) — what the others pay back. */
function evenShareBack(amount: number, people: number): number {
  return Math.round((amount * (people - 1)) / people * 100) / 100;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/** A typed match amount as a number, the way save() sends it; null when empty. */
function matchNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// For a debt-linked bill whose end date is fixed-duration (end = start + N months), keep
// the end date in step the instant the start date changes — so the UI reflects it without
// waiting for the server round-trip + refresh. Preserves the original month-span and lands
// on the new start's day-of-month (clamped to the month's length).
function shiftEndDate(origStart: string, origEnd: string, newStart: string): string {
  const [oy, om] = origStart.split("-").map(Number);
  const [ey, em] = origEnd.split("-").map(Number);
  const durationMonths = (ey - oy) * 12 + (em - om);
  const [ny, nm, nd] = newStart.split("-").map(Number);
  const d = new Date(ny, (nm - 1) + durationMonths, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(nd || 1, lastDay));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Add or edit a recurring item (Popup-Recurring) — one Clear form, every field on the
 * page: name and friendly name; amount, start date (the due day) and category; type,
 * budget type and frequency; end date; auto-match with the last 12 charges it matches
 * (live while you type the rule, linked ones for a saved item); shared cost; notes;
 * active. "Make recurring" on a transaction opens it with a prefill.
 */
export function RecurringClient(props: Props) {
  const t = useTranslations("recurringForm");
  const controlled = props.open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? props.open! : internalOpen;
  const setOpen = (v: boolean) => {
    if (controlled) props.onOpenChange?.(v);
    else setInternalOpen(v);
  };

  // A fresh form for every opening, seeded from the item as saved (or the prefill).
  const [session, setSession] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSession((s) => s + 1);
  }

  const isEdit = props.action === "edit";
  const editTrigger = props.action === "edit" ? props.trigger : undefined;
  const title = isEdit ? t("editTitle") : props.title ?? (props.prefill ? t("makeRecurring") : t("newTitle"));

  return (
    <>
      {!controlled && (isEdit ? (
        editTrigger ? (
          <button type="button" onClick={() => setOpen(true)} className="block w-full cursor-pointer text-left">
            {editTrigger}
          </button>
        ) : (
          <button type="button" onClick={() => setOpen(true)} aria-label={t("editTitle")} className={clearButtonVariants({ variant: "secondary", size: "icon" })}>
            <IconDotsVertical aria-hidden />
          </button>
        )
      ) : props.variant === "fab" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("add")}
          className={cn(clearButtonVariants({ variant: "ember", size: "lg" }), "fixed right-4 bottom-[calc(var(--nav-clearance,0px)+16px)] z-40 shadow-clear-float")}
        >
          <IconPlus aria-hidden />
          {t("add")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("add")}
          className={clearButtonVariants({ variant: props.variant === "icon" ? "surface" : "secondary", size: props.variant === "icon" ? "icon-lg" : "icon" })}
        >
          <IconPlus aria-hidden />
        </button>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideHeaderRow title={title} className="gap-4 pt-6">
          <RecurringForm key={session} {...props} title={title} open={open} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function RecurringForm(props: Props & { title: string; open: boolean; onClose: () => void }) {
  const t = useTranslations("recurringForm");
  const tShared = useTranslations("sharedCost");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const { title, open, onClose } = props;
  const isEdit = props.action === "edit";
  const item = isEdit ? props.item : null;
  const prefill = props.action === "add" ? props.prefill : undefined;
  // End date is owned by a linked debt when explicitly told (opened from the debt detail)
  // or for any debt-type bill (auto-created from a debt) — its end mirrors the debt's
  // computed last-payment date and must not be edited here.
  const endDateLocked = isEdit && ((props.lockEndDate ?? false) || item?.type === "debt");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const txs = useLinkedTransactions(item?.id ?? null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/categories")
      .then((r) => r.json())
      .then((c) => { if (!cancelled) setCats(Array.isArray(c) ? c : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // A payment plan is edited by its total; every other type by the amount per charge.
  const initialAmount = item?.type === "plan" && item.planTotal != null ? item.planTotal : item?.amount;
  const [amountExpr, setAmountExpr] = useState(
    initialAmount != null ? String(initialAmount).replace(".", ",") : (prefill?.amount ?? "").replace(".", ","),
  );

  const [form, setForm] = useState({
    name: item?.name ?? prefill?.name ?? "",
    type: item?.type ?? prefill?.type ?? "bill",
    frequency: item?.frequency ?? "monthly",
    budgetType: item?.budgetType ?? prefill?.budgetType ?? "nodig",
    active: item?.active ?? true,
    notes: item?.notes ?? "",
    dueDay: item?.dueDay?.toString() ?? "",
    startDate: item?.startDate ?? (isEdit ? "" : (prefill?.startDate || todayISO())),
    endDate: item?.endDate ?? "",
    matchPattern: item?.matchPattern ?? prefill?.matchPattern ?? "",
    matchWholeWord: item?.matchWholeWord ?? false,
    matchAmount: item?.matchAmount?.toString() ?? prefill?.matchAmount ?? "",
    matchMode: (item?.matchAmountMin != null || item?.matchAmountMax != null ? "range" : "exact") as "exact" | "range",
    matchAmountMin: item?.matchAmountMin?.toString() ?? "",
    matchAmountMax: item?.matchAmountMax?.toString() ?? "",
    categoryId: item?.categoryId != null ? String(item.categoryId) : (prefill?.categoryId ?? ""),
    friendlyName: item?.friendlyName ?? "",
    shared: item?.sharedReimbursedAmount != null,
    sharedReimbursedAmount: item?.sharedReimbursedAmount?.toString() ?? "",
    sharedWithCount: item?.sharedWithCount?.toString() ?? "",
    isReimbursement: item?.isReimbursement ?? false,
    planParts: item?.planParts?.toString() ?? "3",
  });
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const amountVal = parseAmount(amountExpr);
  const isIncome = form.type === "income";
  // Payment plan: the amount typed is the total, split over the parts; the end date is
  // the last part's date. Stored as one part per occurrence (see recurringItems.planTotal).
  const isPlan = form.type === "plan";
  const planParts = parseInt(form.planParts, 10);
  const validParts = Number.isInteger(planParts) && planParts >= PLAN_MIN_PARTS && planParts <= PLAN_MAX_PARTS;
  const partAmount = isPlan && validParts && amountVal != null ? planPartAmount(amountVal, planParts) : null;
  const schedule = isPlan && validParts ? planSchedule(form.startDate || todayISO(), form.frequency, planParts) : null;
  /** What one charge costs: a plan's part, else the amount itself. */
  const chargeAmount = isPlan ? partAmount : amountVal;
  // Sharing a cost is about money leaving your account; an income recurrence gets the
  // mirror-image option ("this is the payback") instead.
  const isSharedCost = !isIncome && form.shared;
  const myShare = ownShare(chargeAmount, form.sharedReimbursedAmount);
  const canSave = !loading && !!form.name.trim() && amountVal != null && (!isPlan || validParts);

  // The rule as typed. A new item (or an edited one whose rule changed) previews what it
  // would match; an untouched saved item shows the transactions actually linked to it.
  const criteria: MatchCriteria = {
    pattern: form.matchPattern.trim(),
    wholeWord: form.matchWholeWord,
    amount: form.matchMode === "exact" ? matchNumber(form.matchAmount) : null,
    min: form.matchMode === "range" ? matchNumber(form.matchAmountMin) : null,
    max: form.matchMode === "range" ? matchNumber(form.matchAmountMax) : null,
  };
  const ruleChanged =
    !item ||
    criteria.pattern !== (item.matchPattern ?? "").trim() ||
    criteria.wholeWord !== (item.matchWholeWord ?? false) ||
    criteria.amount !== (item.matchAmountMin == null && item.matchAmountMax == null ? item.matchAmount ?? null : null) ||
    criteria.min !== (item.matchAmountMin ?? null) ||
    criteria.max !== (item.matchAmountMax ?? null);
  const preview = useMatchPreview(ruleChanged ? criteria : null);
  const charges = ruleChanged ? (criteria.pattern ? preview?.rows ?? null : null) : txs;

  async function save() {
    if (!canSave) return;
    setLoading(true);
    setError(null);
    // Start date is the recurrence's due date — derive dueDay from it (fall back to a
    // manually-entered dueDay if no start date was set).
    const dueDay = form.startDate ? Number(form.startDate.slice(8, 10)) : (form.dueDay ? parseInt(form.dueDay) : null);
    const payload = {
      name: form.name,
      type: form.type,
      frequency: form.frequency,
      budgetType: isIncome ? null : form.budgetType,
      active: form.active,
      notes: form.notes || null,
      amount: chargeAmount,
      dueDay,
      startDate: form.startDate || (isPlan ? todayISO() : null),
      endDate: isPlan ? schedule?.at(-1) ?? null : form.endDate || null,
      planTotal: isPlan ? amountVal : null,
      planParts: isPlan ? planParts : null,
      matchPattern: form.matchPattern || null,
      matchWholeWord: form.matchWholeWord,
      matchAmount: form.matchMode === "exact" && form.matchAmount ? parseFloat(form.matchAmount.replace(",", ".")) : null,
      matchAmountMin: form.matchMode === "range" && form.matchAmountMin ? parseFloat(form.matchAmountMin.replace(",", ".")) : null,
      matchAmountMax: form.matchMode === "range" && form.matchAmountMax ? parseFloat(form.matchAmountMax.replace(",", ".")) : null,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      friendlyName: form.friendlyName.trim() || null,
      // Shared costs only apply to money going out; the payback flag only to money coming in.
      sharedReimbursedAmount: isSharedCost && form.sharedReimbursedAmount ? parseFloat(form.sharedReimbursedAmount.replace(",", ".")) : null,
      sharedWithCount: isSharedCost && form.sharedWithCount ? parseInt(form.sharedWithCount) : null,
      isReimbursement: isIncome && form.isReimbursement,
      ...(isEdit ? { id: item!.id } : {}),
    };
    const res = await fetch("/api/recurring", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.status === 409) {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? t("duplicate"));
      return;
    }
    // Hand the saved row back before closing, so a caller that opened this editor from
    // somewhere else (the transaction panel's "Make recurring") can update itself.
    const saved = res.ok ? await res.json().catch(() => null) : null;
    if (saved) props.onSaved?.(saved as RecurringItem);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!item) return;
    const ok = await confirm({
      title: t("confirmDelete", { name: item.name }),
      body: t("confirmDeleteBody"),
      confirmLabel: t("confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
    setLoading(true);
    await fetch("/api/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    setLoading(false);
    onClose();
    router.refresh();
  }

  const catObj = cats.find((c) => String(c.id) === form.categoryId);
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const dateLabel = (iso: string) => (isValidISODate(iso) ? dateFmt.format(new Date(`${iso}T12:00:00`)) : iso);
  const sumResult = OPERATOR.test(amountExpr) ? amountVal : null;

  const subtitle = prefill
    ? [
        prefill.name ? t("fromName", { name: prefill.name }) : null,
        prefill.amount
          ? prefill.startDate && isValidISODate(prefill.startDate)
            ? t("amountOn", { amount: `${isIncome ? "+" : "−"}${formatEur(Math.abs(parseFloat(prefill.amount)))}`, date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${prefill.startDate}T12:00:00`)) })
            : `${isIncome ? "+" : "−"}${formatEur(Math.abs(parseFloat(prefill.amount)))}`
          : null,
      ].filter(Boolean).join(" · ")
    : isEdit
      ? item!.friendlyName || item!.name
      : t("newSubtitle");

  return (
    <>
      <ContextualTip id="recurringWholeWord" active={open} />
      <ContextualTip id="sharedCost" active={open} />
      <AnchoredTip id="recurringMatchPreview" anchor="recurringMatchPreview" active={open && ruleChanged && (charges?.length ?? 0) >= 2} />
      {/* Payment plans are a type here, next to bills and debts: point at the switch once. */}
      <AnchoredTip id="paymentPlan" anchor="recurringType" active={open && !isPlan} />

      <ClearDialogHeader
        title={title}
        subtitle={<MoneyText>{subtitle}</MoneyText>}
        icon={
          catObj ? (
            <Icon iconKey={catObj.icon} color={catObj.color} size="xl" soft />
          ) : (
            <IconTile tone="butter" className="size-12"><IconRepeat aria-hidden /></IconTile>
          )
        }
        onClose={onClose}
        closeLabel={t("close")}
      />

      {error && (
        <p role="alert" className="m-0 rounded-clear-tile bg-clear-rose px-4 py-3 text-sm font-semibold text-clear-rose-ink">{error}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <ClearField label={t("name")} htmlFor="rec-name">
          <ClearInput id="rec-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("namePlaceholder")} className="font-semibold" />
        </ClearField>
        <ClearField label={t("friendlyName")} htmlFor="rec-friendly" hint={t("friendlyHint")}>
          <ClearInput id="rec-friendly" value={form.friendlyName} onChange={(e) => set("friendlyName", e.target.value)} placeholder={t("friendlyPlaceholder")} className="font-semibold" />
        </ClearField>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
        <ClearField label={isPlan ? t("planTotal") : t("amount")} htmlFor="rec-amount">
          <div className={FIELD_BOX}>
            <span aria-hidden className="text-[15px] font-bold text-clear-muted">{currencySymbol()}</span>
            <input
              id="rec-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amountExpr}
              onChange={(e) => setAmountExpr(e.target.value)}
              placeholder="0,00"
              className={FIELD_INPUT}
            />
            {sumResult != null && <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap text-clear-muted">= <MoneyText>{formatEur(sumResult)}</MoneyText></span>}
          </div>
        </ClearField>

        <div role="group" aria-labelledby="rec-start-label" className="flex min-w-0 flex-col gap-1.5">
          <span id="rec-start-label" className={LABEL}>{t("startDate")}</span>
          <DatePicker
            value={form.startDate || todayISO()}
            label={dateLabel(form.startDate || todayISO())}
            onChange={(v) => {
              set("startDate", v);
              // A locked (debt-linked) end date follows the start date immediately.
              if (endDateLocked && item?.startDate && item?.endDate) set("endDate", shiftEndDate(item.startDate, item.endDate, v));
            }}
            triggerClassName={DATE_TRIGGER}
          />
          <span className="text-[13px] text-clear-muted">{t("startHint", { day: Number((form.startDate || todayISO()).slice(8, 10)) })}</span>
        </div>

        <div role="group" aria-labelledby="rec-category-label" className="flex min-w-0 flex-col gap-1.5">
          <span id="rec-category-label" className={LABEL}>{t("category")}</span>
          <button
            type="button"
            onClick={() => setCategoryOpen(true)}
            className="flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-3 pl-2 text-left font-clear text-[15px] font-bold text-clear-ink outline-none transition-colors focus-visible:border-clear-ink"
          >
            {catObj ? <Icon iconKey={catObj.icon} color={catObj.color} size="sm" soft /> : <span aria-hidden className="size-8 shrink-0 rounded-clear-icon bg-clear-line" />}
            <span className={cn("min-w-0 flex-1 truncate", !catObj && "font-semibold text-clear-placeholder")}>{catObj?.name ?? t("noCategory")}</span>
            <IconChevronDown size={16} stroke={2.2} aria-hidden className="shrink-0 text-clear-muted" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span id="rec-type-label" className={LABEL}>{t("type")}</span>
        <div data-tip-anchor="recurringType" className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <Segmented
            label={t("type")}
            surface="tile"
            value={form.type}
            onChange={(v) => set("type", v)}
            className="flex w-full min-w-max [&>button]:flex-1"
            items={TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
          />
        </div>
      </div>

      {!isIncome && (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>{t("budgetType")}</span>
          <Segmented
            label={t("budgetType")}
            surface="tile"
            value={form.budgetType}
            onChange={(v) => set("budgetType", v)}
            className="flex w-full [&>button]:flex-1"
            items={BUDGET_TYPES.map((b) => ({ value: b.value, label: t(`budgetTypes.${b.key}`) }))}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className={LABEL}>{t("frequency")}</span>
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <Segmented
            label={t("frequency")}
            surface="tile"
            value={form.frequency}
            onChange={(v) => set("frequency", v)}
            className="flex w-full min-w-max [&>button]:flex-1"
            items={[
              // A legacy one-time item keeps its value selectable.
              ...(form.frequency === "once" ? [{ value: "once", label: t("frequencies.once") }] : []),
              ...FREQUENCIES.map((v) => ({ value: v as string, label: t(`frequencies.${v}`) })),
            ]}
          />
        </div>
      </div>

      {isPlan ? (
        <div className="flex flex-col gap-3 rounded-clear-tile border border-clear-line px-4 py-3">
          <ClearField label={t("planParts")} htmlFor="rec-parts" hint={t("planPartsHint", { min: PLAN_MIN_PARTS, max: PLAN_MAX_PARTS })}>
            <ClearInput
              id="rec-parts"
              type="number"
              min={PLAN_MIN_PARTS}
              max={PLAN_MAX_PARTS}
              step="1"
              inputMode="numeric"
              value={form.planParts}
              onChange={(e) => set("planParts", e.target.value)}
              className="font-bold tabular-nums sm:max-w-40"
            />
          </ClearField>
          <span className="text-sm font-semibold text-clear-ink-2">
            {partAmount != null && schedule ? (
              <MoneyText>{t("planSummary", { count: schedule.length, amount: formatEur(partAmount), date: dateLabel(schedule[schedule.length - 1]) })}</MoneyText>
            ) : (
              t("planHint")
            )}
          </span>
        </div>
      ) : (
      <div className="flex flex-col gap-2 rounded-clear-tile border border-clear-line px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span id="rec-end-label" className="text-[15px] font-bold">{t("endDate")}</span>
            <span className="text-[13px] text-clear-muted">
              {endDateLocked
                ? form.endDate ? t("endLockedOn", { date: dateLabel(form.endDate) }) : t("endLocked")
                : form.endDate ? t("endHint") : t("noEnd")}
            </span>
          </span>
          {!endDateLocked && (
            <ClearSwitch checked={!!form.endDate} onCheckedChange={(v) => set("endDate", v ? todayISO() : "")} labelledBy="rec-end-label" />
          )}
        </div>
        {!endDateLocked && form.endDate && (
          <DatePicker value={form.endDate} label={dateLabel(form.endDate)} onChange={(v) => set("endDate", v)} triggerClassName={DATE_TRIGGER} />
        )}
      </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <ClearField label={t("matchPattern")} htmlFor="rec-pattern">
            <div className={cn(FIELD_BOX, "gap-2.5 text-clear-muted")}>
              <IconSearch size={18} stroke={2} aria-hidden className="shrink-0" />
              <input
                id="rec-pattern"
                type="text"
                autoComplete="off"
                value={form.matchPattern}
                onChange={(e) => set("matchPattern", e.target.value)}
                placeholder={t("matchPlaceholder")}
                className={cn(FIELD_INPUT, "tracking-[0.04em]")}
              />
            </div>
          </ClearField>
          <div className="flex h-12 items-center justify-between gap-3.5 rounded-clear-row bg-clear-tile pr-3 pl-4">
            <span id="rec-whole-label" className="text-sm font-bold">{t("wholeWord")}</span>
            <ClearSwitch checked={form.matchWholeWord} onCheckedChange={(v) => set("matchWholeWord", v)} labelledBy="rec-whole-label" />
          </div>
        </div>
        <span className="text-xs font-semibold text-clear-muted">
          {form.matchWholeWord ? t("wholeWordHint") : t("containsHint")}{" "}
          {ruleChanged
            ? criteria.pattern && preview ? t("matchesHint", { count: preview.total }) : t("autoHint")
            : txs && txs.length > 0 ? t("linkedHint", { count: txs.length }) : t("autoHint")}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={LABEL}>{t("matchAmount")}</span>
          <Segmented
            label={t("matchAmount")}
            surface="tile"
            size="sm"
            value={form.matchMode}
            onChange={(v) => set("matchMode", v)}
            items={[
              { value: "exact", label: t("exact") },
              { value: "range", label: t("between") },
            ]}
          />
        </div>
        {form.matchMode === "exact" ? (
          <ClearInput
            aria-label={t("exact")}
            inputMode="decimal"
            value={form.matchAmount}
            onChange={(e) => set("matchAmount", e.target.value)}
            placeholder={t("anyAmount")}
            className="font-bold tabular-nums"
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <ClearInput aria-label={t("min")} inputMode="decimal" value={form.matchAmountMin} onChange={(e) => set("matchAmountMin", e.target.value)} placeholder={t("min")} className="font-bold tabular-nums" />
            <ClearInput aria-label={t("max")} inputMode="decimal" value={form.matchAmountMax} onChange={(e) => set("matchAmountMax", e.target.value)} placeholder={t("max")} className="font-bold tabular-nums" />
          </div>
        )}
        {/* The recurrence's own amount, for reference: the match amount is a separate
            filter, and without this you'd have to scroll up to check the bill's amount. */}
        {chargeAmount != null && (
          <span className="text-xs font-semibold text-clear-muted">
            <MoneyText>{t("setTo", { amount: formatEur(chargeAmount) })}</MoneyText>
            {form.matchMode === "exact" && (
              <button type="button" onClick={() => set("matchAmount", String(chargeAmount))} className="ml-1.5 cursor-pointer font-bold text-clear-ember-text hover:underline">
                {t("useIt")}
              </button>
            )}
          </span>
        )}
      </div>

      {/* The last 12 charges — of what the rule as typed would match, live while you edit. */}
      {charges && <RecurringCharges txs={charges} tipAnchor={ruleChanged ? "recurringMatchPreview" : "recurringCharges"} />}

      <div className="flex flex-col gap-3 rounded-clear-tile border border-clear-line px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span id="rec-shared-label" className="text-[15px] font-bold">{isIncome ? tShared("paybackToggle") : tShared("sharedToggle")}</span>
            <span className="text-[13px] text-clear-muted">{isIncome ? tShared("paybackHint") : tShared("sharedHint")}</span>
          </span>
          <ClearSwitch
            checked={isIncome ? form.isReimbursement : form.shared}
            onCheckedChange={(v) => (isIncome ? set("isReimbursement", v) : set("shared", v))}
            labelledBy="rec-shared-label"
          />
        </div>
        {isSharedCost && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <ClearField label={tShared("paidBackLabel")} htmlFor="rec-paidback">
                <ClearInput id="rec-paidback" inputMode="decimal" value={form.sharedReimbursedAmount} onChange={(e) => set("sharedReimbursedAmount", e.target.value)} placeholder="0,00" className="font-bold tabular-nums" />
              </ClearField>
              <ClearField label={tShared("peopleLabel")} htmlFor="rec-people">
                <div className="flex gap-2">
                  <ClearInput id="rec-people" type="number" min="2" step="1" inputMode="numeric" value={form.sharedWithCount} onChange={(e) => set("sharedWithCount", e.target.value)} placeholder="4" className="font-bold tabular-nums" />
                  <button
                    type="button"
                    disabled={chargeAmount == null || !(parseInt(form.sharedWithCount) >= 2)}
                    onClick={() => {
                      const people = parseInt(form.sharedWithCount);
                      if (chargeAmount == null || !(people >= 2)) return;
                      set("sharedReimbursedAmount", String(evenShareBack(chargeAmount, people)));
                    }}
                    className={cn(clearButtonVariants({ variant: "secondary", size: "lg" }), "px-4")}
                  >
                    {tShared("splitEvenly")}
                  </button>
                </div>
              </ClearField>
            </div>
            {chargeAmount != null && myShare != null && (
              <span className="text-sm font-semibold text-clear-ink-2"><MoneyText>{tShared("preview", { share: formatEur(myShare), total: formatEur(chargeAmount) })}</MoneyText></span>
            )}
          </>
        )}
      </div>

      <ClearField label={t("notes")} htmlFor="rec-notes">
        <ClearInput id="rec-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t("notesPlaceholder")} />
      </ClearField>

      <div className="flex items-center justify-between gap-4 rounded-clear-tile border border-clear-line px-4 py-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span id="rec-active-label" className="text-[15px] font-bold">{t("active")}</span>
          <span className="text-[13px] text-clear-muted">{t("activeHint")}</span>
        </span>
        <ClearSwitch checked={form.active} onCheckedChange={(v) => set("active", v)} labelledBy="rec-active-label" />
      </div>

      <div className="border-t border-clear-ground pt-4 pb-1">
        <ClearDialogFooter
          destructive={
            isEdit ? (
              <button type="button" onClick={remove} disabled={loading} className={clearButtonVariants({ variant: "danger" })}>
                <IconTrash aria-hidden />
                {t("delete")}
              </button>
            ) : undefined
          }
        >
          <button type="button" onClick={onClose} className={clearButtonVariants({ variant: "secondary" })}>
            {t("cancel")}
          </button>
          <button type="button" onClick={save} disabled={!canSave} className={clearButtonVariants()}>
            {loading ? t("saving") : t("save")}
          </button>
        </ClearDialogFooter>
      </div>

      {/* The app's one category picker, stacked on this sheet. */}
      <CategoryPickerSheet
        categories={cats}
        current={form.categoryId || undefined}
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        // "none" is the picker's Uncategorized row — this form stores "no category" as
        // an empty string, which the API turns into null.
        onChange={(v) => set("categoryId", v === "none" ? "" : v)}
      />
    </>
  );
}

/** Brings a dismissed auto-detected item back: clears the dismissed flag and reactivates it. */
export function RecurringRestoreButton({ item }: { item: RecurringItem }) {
  const t = useTranslations("recurringForm");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function restore() {
    setLoading(true);
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, dismissed: false, active: true }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button type="button" onClick={restore} disabled={loading} className={clearButtonVariants({ variant: "outline", size: "sm" })}>
      {loading ? t("restoring") : t("restore")}
    </button>
  );
}
