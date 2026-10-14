"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  IconPlusFilled as Plus,
  IconDotsVerticalFilled as EllipsisVertical,
  IconTrashFilled as Trash2,
  IconChevronRight as ChevronRight,
  IconCircleCheckFilled as CheckCircle,
  IconCheck as Check,
  IconCoinEuro as Coin,
  IconReload as Repeat,
  IconCalendarEvent as Calendar,
  IconTag as TagIcon,
  IconCategory2 as CategoryIcon,
  IconNote as Note,
  IconAdjustments as Adjust,
  IconUsers as Users,
} from "@tabler/icons-react";
import type { RecurringItem, Category } from "@/db/schema";
import { FloatingAddButton } from "@/components/floating-add-button";
import { Icon } from "@/components/icon";
import { DatePicker } from "@/components/date-picker";
import { AmountKeypad } from "@/components/amount-keypad";
import { WarningBanner } from "@/components/warning-banner";
import { SubSheet } from "@/components/sub-sheet";
import { OptionList } from "@/components/option-list";
import { ContextualTip } from "@/components/contextual-tip";
import { useTranslations } from "next-intl";
import { CategoryGrid, useCategoryFilter } from "@/components/category-picker";
import { formatEur } from "@/lib/format";
import { evaluateExpression } from "@/lib/amount-expression";
import { cn } from "@/lib/utils";

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
   *  makes the Period row read correctly. Defaults to today. */
  startDate?: string;
  matchPattern?: string;
  matchAmount?: string;
  categoryId?: string;
}

interface AddProps {
  action: "add";
  variant?: "default" | "icon" | "fab";
  prefill?: RecurringPrefill;
  /** Controlled open, for callers with their own trigger (the transaction detail
   *  dialog's "Make recurring"). When set, no built-in trigger button is rendered. */
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

const TYPE_OPTIONS = [
  { value: "income",       label: "Income" },
  { value: "bill",         label: "Bill" },
  { value: "subscription", label: "Subscription" },
  { value: "debt",         label: "Debt" },
  { value: "savings",      label: "Savings" },
];

const BUDGET_TYPE_OPTIONS = [
  { value: "nodig",  label: "Needs" },
  { value: "willen", label: "Wants" },
  { value: "sparen", label: "Savings" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily",     label: "Daily" },
  { value: "weekly",    label: "Weekly" },
  { value: "monthly",   label: "Monthly" },
  { value: "quarterly", label: "Per quarter" },
  { value: "yearly",    label: "Yearly" },
];

const SUB_TITLES: Record<string, string> = {
  amount: "Amount", period: "Period", frequency: "Frequency", category: "Category",
  name: "Name", type: "Type", notes: "Notes & Friendly Name", match: "Auto-match",
};

/** Your own share of a shared bill: the gross charge minus what everyone else pays back. */
function ownShare(amount: number | null, reimbursed: string): number | null {
  if (amount == null) return null;
  const back = parseFloat(reimbursed.replace(",", "."));
  if (!Number.isFinite(back) || back <= 0) return amount;
  return Math.max(0, Math.round((amount - back) * 100) / 100);
}

/** An even split of `amount` across `people` (you included) — your one share of it. */
function evenShareBack(amount: number, people: number): number {
  return Math.round((amount * (people - 1)) / people * 100) / 100;
}

/** "Bill • Needs" — the row summaries show every value the subpage behind them edits,
 *  so nothing has to be opened just to find out what it's set to. Parts that are empty
 *  drop out; an entirely empty summary reads as "—". */
function summarise(...parts: (string | null | undefined | false)[]): string {
  const kept = parts.filter((p): p is string => !!p && p.trim() !== "");
  return kept.length ? kept.join(" • ") : "—";
}

const todayISO = () => new Date().toISOString().slice(0, 10);
function fmtShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

export function RecurringClient(props: Props) {
  const router = useRouter();
  const tShared = useTranslations("sharedCost");
  const controlled = props.open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? props.open! : internalOpen;
  const setOpen = (v: boolean) => {
    if (controlled) props.onOpenChange?.(v);
    else setInternalOpen(v);
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.action === "edit";
  const item = isEdit ? props.item : null;
  const prefill = props.action === "add" ? props.prefill : undefined;
  // End date is owned by a linked debt when explicitly told (opened from the debt detail)
  // or for any debt-type bill (auto-created from a debt) — its end mirrors the debt's
  // computed last-payment date and must not be edited here.
  const endDateLocked = isEdit && (((props as EditProps).lockEndDate ?? false) || item?.type === "debt");

  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    if (!open || cats.length) return;
    fetch("/api/categories").then((r) => r.json()).then(setCats).catch(() => {});
  }, [open, cats.length]);

  // Filter state for the shared category grid rendered in the "category" subpage —
  // the menu itself is pinned in that subpage's header (see SubSheet's `action`).
  const {
    budgetType: categoryBudgetFilter,
    showSubcategories,
    filterMenu: categoryFilterMenu,
  } = useCategoryFilter({ triggerClassName: "size-11 rounded-full bg-white dark:bg-white/7 text-foreground" });

  const [amountExpr, setAmountExpr] = useState(
    item?.amount != null ? String(item.amount).replace(".", ",") : (prefill?.amount ?? "").replace(".", ","),
  );
  const [calcEnabled, setCalcEnabled] = useState(true);
  const [subpage, setSubpage] = useState<string | null>(null);
  const [subVisible, setSubVisible] = useState(false);

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
    matchMode: (item?.matchAmountMin != null || item?.matchAmountMax != null) ? "range" : "exact",
    matchAmountMin: item?.matchAmountMin?.toString() ?? "",
    matchAmountMax: item?.matchAmountMax?.toString() ?? "",
    categoryId: item?.categoryId != null ? String(item.categoryId) : (prefill?.categoryId ?? ""),
    friendlyName: item?.friendlyName ?? "",
    shared: item?.sharedReimbursedAmount != null,
    sharedReimbursedAmount: item?.sharedReimbursedAmount?.toString() ?? "",
    sharedWithCount: item?.sharedWithCount?.toString() ?? "",
    isReimbursement: item?.isReimbursement ?? false,
  });
  function set(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Reset the subpage stack whenever the dialog closes.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) { setSubVisible(false); setSubpage(null); }
    setError(null);
  }

  function openSub(k: string) {
    setSubpage(k);
    requestAnimationFrame(() => setSubVisible(true));
  }
  function closeSub() {
    setSubVisible(false);
    setTimeout(() => setSubpage(null), 300);
  }

  const amountVal = evaluateExpression(amountExpr);

  async function save() {
    if (!form.name.trim() || amountVal == null) return;
    setLoading(true);
    setError(null);
    // Start date is the recurrence's due date — derive dueDay from it (fall back to a
    // manually-entered dueDay if no start date was set).
    const dueDay = form.startDate ? Number(form.startDate.slice(8, 10)) : (form.dueDay ? parseInt(form.dueDay) : null);
    const payload = {
      name: form.name,
      type: form.type,
      frequency: form.frequency,
      budgetType: form.type === "income" ? null : form.budgetType,
      active: form.active,
      notes: form.notes || null,
      amount: amountVal,
      dueDay,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      matchPattern: form.matchPattern || null,
      matchWholeWord: form.matchWholeWord,
      matchAmount: form.matchMode === "exact" && form.matchAmount ? parseFloat(form.matchAmount) : null,
      matchAmountMin: form.matchMode === "range" && form.matchAmountMin ? parseFloat(form.matchAmountMin) : null,
      matchAmountMax: form.matchMode === "range" && form.matchAmountMax ? parseFloat(form.matchAmountMax) : null,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      friendlyName: form.friendlyName.trim() || null,
      // Shared costs only apply to money going out; the payback flag only to money coming in.
      sharedReimbursedAmount: isSharedCost && form.sharedReimbursedAmount ? parseFloat(form.sharedReimbursedAmount.replace(",", ".")) : null,
      sharedWithCount: isSharedCost && form.sharedWithCount ? parseInt(form.sharedWithCount) : null,
      isReimbursement: form.type === "income" && form.isReimbursement,
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
      setError(data?.message ?? "A recurring item with this name already exists.");
      return;
    }
    // Hand the saved row back before closing, so a caller that opened this editor from
    // somewhere else (the transaction sheet's "Make recurring") can update itself —
    // the server has already re-run the rules, but that caller's own copy of the
    // transaction is a snapshot taken before this existed.
    const saved = res.ok ? await res.json().catch(() => null) : null;
    if (saved) props.onSaved?.(saved as RecurringItem);
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete "${item?.name}"?`)) return;
    setLoading(true);
    await fetch("/api/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item!.id }),
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  const editTrigger = props.action === "edit" ? props.trigger : undefined;
  const catObj = cats.find((c) => String(c.id) === form.categoryId);
  const typeLabel = TYPE_OPTIONS.find((t) => t.value === form.type)?.label ?? form.type;
  const budgetTypeLabel = BUDGET_TYPE_OPTIONS.find((b) => b.value === form.budgetType)?.label;
  const freqLabel = FREQUENCY_OPTIONS.find((f) => f.value === form.frequency)?.label ?? form.frequency;
  // Income has no budget type (it's nulled on save), so only expense-ish types show one.
  const typeRowValue = summarise(typeLabel, form.type !== "income" && budgetTypeLabel);
  const notesRowValue = summarise(form.notes, form.friendlyName);
  const matchAmountLabel =
    form.matchMode === "range"
      ? (form.matchAmountMin || form.matchAmountMax
          ? `${form.matchAmountMin || "…"}–${form.matchAmountMax || "…"}`
          : "")
      : form.matchAmount;
  const matchRowValue = summarise(
    form.matchPattern,
    form.matchPattern && form.matchWholeWord && "whole word",
    matchAmountLabel,
  );
  const periodLabel = form.startDate
    ? (form.endDate ? `${fmtShort(form.startDate)} – ${fmtShort(form.endDate)}` : `From ${fmtShort(form.startDate)}`)
    : "—";

  // Sharing a cost is about money leaving your account; an income recurrence gets the
  // mirror-image option ("this is the payback") in the same row instead.
  const isSharedCost = form.type !== "income" && form.shared;
  const myShare = ownShare(amountVal, form.sharedReimbursedAmount);
  const sharedRowValue = form.type === "income"
    ? (form.isReimbursement ? tShared("rowPayback") : tShared("rowNotShared"))
    : isSharedCost && myShare != null
      ? tShared("rowYourShare", { amount: formatEur(myShare) })
      : tShared("rowNotShared");

  return (
    <>
      {!controlled && (isEdit ? (
        editTrigger ? (
          <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
            {editTrigger}
          </button>
        ) : (
          <button className="flex items-center justify-center p-1.5 hover:bg-foreground/10 text-foreground rounded-sm bg-foreground/3 hover:text-foreground shrink-0 size-9" onClick={() => setOpen(true)}>
            <EllipsisVertical className="size-4" />
          </button>
        )
      ) : props.variant === "fab" ? (
        <FloatingAddButton onClick={() => setOpen(true)} ariaLabel="Add fixed cost" />
      ) : props.variant === "icon" ? (
        <button onClick={() => setOpen(true)} className="glass-icon-btn size-12" aria-label="Add fixed cost">
          <Plus className="size-5 text-foreground dark:text-gray-300" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="size-11 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center text-foreground active:scale-[0.97] transition-transform shrink-0"
          aria-label="Add recurrence"
        >
          <Plus className="size-5" />
        </button>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="px-0"
          title={isEdit ? "Edit Recurrence" : "New recurrence"}
          headerAction={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set("active", !form.active)}
                aria-label={form.active ? "Enabled" : "Disabled"}
                className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center active:scale-[0.95] transition-transform"
              >
                <Check className={cn("size-5", form.active ? "text-[#1fb651]" : "text-foreground/30")} /> 
              </button>
              {isEdit && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={loading}
                  aria-label="Delete"
                  className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
                >
                  <Trash2 className="size-4.5" />
                </button>
              )}
            </div>
          }
          footer={
            <Button
              onClick={save}
              disabled={loading || !form.name.trim() || amountVal == null}
              className="w-full h-13 rounded-full bg-foreground text-background hover:bg-foreground/90 text-base font-semibold"
            >
              {loading ? "Saving..." : "Save"}
            </Button>
          }
        >
          <div className="space-y-3 px-5 pb-2">
            {error && (
              <WarningBanner severity="danger">
                <span>{error}</span>
              </WarningBanner>
            )}
            <Row icon={<Coin className="size-5" />} label="Amount" value={amountVal != null ? formatEur(amountVal) : "—"} onClick={() => openSub("amount")} />
            <Row icon={<Calendar className="size-5" />} label="Period" value={periodLabel} onClick={() => openSub("period")} />
            <Row icon={<Repeat className="size-5" />} label="Frequency" value={freqLabel} onClick={() => openSub("frequency")} />
            <Row
              icon={<CategoryIcon className="size-5" />}
              label="Category"
              value={catObj?.name ?? "—"}
              valueIcon={catObj ? <Icon iconKey={catObj.icon} color={catObj.color} size="xs" round /> : null}
              onClick={() => openSub("category")}
            />
            <Row icon={<TagIcon className="size-5" />} label="Name" value={form.name || "—"} onClick={() => openSub("name")} />
            <Row icon={<Adjust className="size-5" />} label="Type" value={typeRowValue} onClick={() => openSub("type")} />
            <Row icon={<Note className="size-5" />} label="Notes & Friendly Name" value={notesRowValue} onClick={() => openSub("notes")} />
            <Row icon={<Adjust className="size-5" />} label="Auto-match" value={matchRowValue} onClick={() => openSub("match")} />
            <Row icon={<Users className="size-5" />} label={tShared("row")} value={sharedRowValue} onClick={() => openSub("shared")} />
          </div>

          {/* Slide-in subpage — fixed against the (transformed) dialog panel */}
          {subpage && (
            <SubSheet
              title={subpage === "shared" ? tShared("row") : SUB_TITLES[subpage]}
              visible={subVisible}
              onClose={closeSub}
              // The category subpage is the shared picker grid: it brings the same
              // filter menu the transaction sheet puts in its header, and manages its
              // own scrolling, so it gets the full remaining height instead of the
              // default scrolling body.
              action={subpage === "category" ? categoryFilterMenu : undefined}
              contentClassName={
                subpage === "category"
                  ? "flex-1 min-h-0 flex flex-col px-6 pb-[calc(1.5rem+var(--sab))]"
                  : undefined
              }
            >
                {subpage === "amount" && (
                  <AmountKeypad expr={amountExpr} onChange={setAmountExpr} onEnter={closeSub} sign={form.type === "income" ? "+" : "−"} calcEnabled={calcEnabled} onToggleCalc={() => setCalcEnabled((c) => !c)} />
                )}

                {subpage === "period" && (
                  <div className="space-y-5 pt-2">
                    <div>
                      <p className="text-sm font-medium mb-1.5">Start date</p>
                      <DatePicker
                        value={form.startDate || todayISO()}
                        onChange={(v) => {
                          set("startDate", v);
                          // Locked (debt-linked) end date follows the start date immediately.
                          if (endDateLocked && item?.startDate && item?.endDate) set("endDate", shiftEndDate(item.startDate, item.endDate, v));
                        }}
                        triggerClassName="w-full justify-between border rounded-xl px-4 h-12 bg-[var(--dialog-content-background)]"
                      />
                      <p className="text-xs text-foreground/50 mt-1.5">This becomes the due date of the recurrence.</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-medium">End date</p>
                        {!endDateLocked && (
                          <button type="button" onClick={() => set("endDate", form.endDate ? "" : todayISO())} className="text-sm font-medium">
                            {form.endDate ? "Remove" : "Add"}
                          </button>
                        )}
                      </div>
                      {endDateLocked ? (
                        <p className="text-sm text-foreground/45">
                          {form.endDate ? `Ends ${fmtShort(form.endDate)} — ` : ""}managed by the linked debt&apos;s last-payment date.
                        </p>
                      ) : form.endDate ? (
                        <>
                          <DatePicker value={form.endDate} onChange={(v) => set("endDate", v)} triggerClassName="w-full justify-between border rounded-xl px-4 h-12 bg-[var(--dialog-content-background)]" />
                          <p className="text-xs text-foreground/50 mt-1.5">After this date the recurrence is automatically disabled.</p>
                        </>
                      ) : (
                        <p className="text-sm text-foreground/45">No end date — runs indefinitely.</p>
                      )}
                    </div>
                  </div>
                )}

                {subpage === "frequency" && (
                  <OptionList options={FREQUENCY_OPTIONS} value={form.frequency} onSelect={(v) => { set("frequency", v); closeSub(); }} />
                )}

                {subpage === "type" && (
                  <div className="space-y-5 pt-1">
                    <OptionList options={TYPE_OPTIONS} value={form.type} onSelect={(v) => set("type", v)} />
                    {form.type !== "income" && (
                      <div>
                        <p className="text-sm font-medium mb-2 px-1">Budget type</p>
                        <OptionList options={BUDGET_TYPE_OPTIONS} value={form.budgetType} onSelect={(v) => set("budgetType", v)} />
                      </div>
                    )}
                  </div>
                )}

                {subpage === "category" && (
                  <CategoryGrid
                    categories={cats}
                    current={form.categoryId || undefined}
                    isFormMode
                    fill
                    budgetType={categoryBudgetFilter}
                    showSubcategories={showSubcategories}
                    // "none" is the grid's Uncategorized row — this form stores "no
                    // category" as an empty string, which is what the API turns into null.
                    onChange={(v) => set("categoryId", v === "none" ? "" : v)}
                    onClose={closeSub}
                  />
                )}

                {subpage === "name" && (
                  <div className="pt-2">
                    <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Rent" data-autofocus data-no-keyboard-scroll className="h-12" />
                  </div>
                )}

                {subpage === "shared" && (
                  <div className="space-y-4 pt-2">
                    {/* First look at shared costs — anchored here so it lands the moment
                        the option is actually on screen, dismissed-all or not. */}
                    <ContextualTip id="sharedCost" active={subVisible} />
                    {form.type === "income" ? (
                      <div>
                        <ToggleRow
                          label={tShared("paybackToggle")}
                          checked={form.isReimbursement}
                          onChange={(v) => set("isReimbursement", v)}
                        />
                        <p className="text-xs text-foreground/50 mt-2 px-1">{tShared("paybackHint")}</p>
                      </div>
                    ) : (
                      <>
                        <ToggleRow
                          label={tShared("sharedToggle")}
                          checked={form.shared}
                          onChange={(v) => set("shared", v)}
                        />
                        {form.shared && (
                          <>
                            <div>
                              <p className="text-sm font-medium mb-1.5">{tShared("paidBackLabel")}</p>
                              <Input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                value={form.sharedReimbursedAmount}
                                onChange={(e) => set("sharedReimbursedAmount", e.target.value)}
                                placeholder="0.00"
                                className="h-12"
                              />
                            </div>
                            <div>
                              <p className="text-sm font-medium mb-1.5">{tShared("peopleLabel")}</p>
                              <div className="flex gap-3">
                                <Input
                                  type="number"
                                  min="2"
                                  step="1"
                                  inputMode="numeric"
                                  value={form.sharedWithCount}
                                  onChange={(e) => set("sharedWithCount", e.target.value)}
                                  placeholder="4"
                                  className="h-12"
                                />
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="h-12 shrink-0 px-4"
                                  disabled={amountVal == null || !(parseInt(form.sharedWithCount) >= 2)}
                                  onClick={() => {
                                    if (amountVal == null) return;
                                    const people = parseInt(form.sharedWithCount);
                                    if (!(people >= 2)) return;
                                    set("sharedReimbursedAmount", String(evenShareBack(amountVal, people)));
                                  }}
                                >
                                  {tShared("splitEvenly")}
                                </Button>
                              </div>
                            </div>
                            {amountVal != null && myShare != null && (
                              <p className="text-sm text-foreground/60 px-1">
                                {tShared("preview", { share: formatEur(myShare), total: formatEur(amountVal) })}
                              </p>
                            )}
                            <p className="text-xs text-foreground/50 px-1">{tShared("sharedHint")}</p>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {subpage === "notes" && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <p className="text-sm font-medium mb-1.5">Notes</p>
                      <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes" className="h-12" />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1.5">Friendly name</p>
                      <Input value={form.friendlyName} onChange={(e) => set("friendlyName", e.target.value)} placeholder="e.g. Amazon Prime" className="h-12" />
                      <p className="text-xs text-foreground/50 mt-1.5">Overrides name cleanup on matched transactions.</p>
                    </div>
                  </div>
                )}

                {subpage === "match" && (
                  <div className="space-y-4 pt-2">
                    {/* One-time explainer for whole-word matching. Anchored to this
                        subpage so it appears the first time the option is actually seen. */}
                    <ContextualTip id="recurringWholeWord" active={subVisible} />
                    <div>
                      <p className="text-sm font-medium mb-1.5">Match pattern</p>
                      <Input value={form.matchPattern} onChange={(e) => set("matchPattern", e.target.value)} placeholder="Text in the description, e.g. Netflix" className="h-12" />
                      <MatchModePicker value={form.matchWholeWord} onChange={(v) => set("matchWholeWord", v)} />
                    </div>
                    <div>
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-foreground/5 p-1 mb-2">
                        {(["exact", "range"] as const).map((m) => (
                          <button key={m} type="button" onClick={() => set("matchMode", m)} className={cn("rounded-md py-2 text-sm transition-colors", form.matchMode === m ? "bg-background shadow-sm font-medium" : "text-foreground/60")}>
                            {m === "exact" ? "Exact amount" : "Between"}
                          </button>
                        ))}
                      </div>
                      {form.matchMode === "exact" ? (
                        <Input type="number" step="0.01" value={form.matchAmount} onChange={(e) => set("matchAmount", e.target.value)} placeholder="e.g. 12.99" className="h-12" />
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <Input type="number" step="0.01" value={form.matchAmountMin} onChange={(e) => set("matchAmountMin", e.target.value)} placeholder="Min" className="h-12" />
                          <Input type="number" step="0.01" value={form.matchAmountMax} onChange={(e) => set("matchAmountMax", e.target.value)} placeholder="Max" className="h-12" />
                        </div>
                      )}
                      {/* The recurrence's own amount, for reference: the match amount is a
                          separate filter, and without this you'd have to leave the subpage
                          to check what the bill is actually set to. */}
                      {amountVal != null && (
                        <button
                          type="button"
                          onClick={() => {
                            if (form.matchMode === "exact") set("matchAmount", String(amountVal));
                          }}
                          className="mt-2 text-xs text-foreground/50 text-left"
                        >
                          This recurrence is set to {formatEur(amountVal)}
                          {form.matchMode === "exact" && <span className="underline underline-offset-2 ml-1">use it</span>}
                        </button>
                      )}
                    </div>
                  </div>
                )}
            </SubSheet>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Contains vs whole word for the auto-match pattern — the same choice the category
 *  rules offer (MatchTypePicker in settings/categories/category-client.tsx). There's no
 *  "exact" here: a recurring pattern is matched against a bank description that always
 *  carries extra noise around it, so an exact-equals mode would never fire. */
/** Plain on/off row — the app has no shared Switch primitive, and the two-button picker
 *  used for match modes reads oddly for a yes/no question. */
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl bg-foreground/5 px-4 py-3 text-left"
    >
      <span className="text-sm font-medium">{label}</span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-foreground" : "bg-foreground/20")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-background transition-all", checked ? "left-[1.125rem]" : "left-0.5")} />
      </span>
    </button>
  );
}

function MatchModePicker({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const options = [
    { wholeWord: false, label: "Contains", hint: "Matches anywhere in the description, even inside a word." },
    { wholeWord: true, label: "Whole word", hint: "Only as a separate word — “NS” won't match “NSPCC”." },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-foreground/5 p-1 mt-2">
        {options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt.wholeWord)}
            className={cn(
              "rounded-md py-2 text-sm transition-colors",
              value === opt.wholeWord ? "bg-background shadow-sm font-medium" : "text-foreground/60",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-foreground/50 mt-1.5">
        {options.find((o) => o.wholeWord === value)!.hint}
      </p>
    </>
  );
}

function Row({
  icon,
  label,
  value,
  valueIcon,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueIcon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 rounded-2xl bg-[var(--dialog-content-background)] px-4 py-4 text-left active:bg-foreground/[0.04] transition-colors">
      <span className="text-foreground/40 shrink-0">{icon}</span>
      <span className="flex-1 font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-foreground/60 min-w-0">
        {valueIcon}
        <span className="truncate max-w-[45vw]">{value}</span>
      </span>
      <ChevronRight className="size-5 text-foreground/30 shrink-0" />
    </button>
  );
}

/** Brings a dismissed auto-detected item back: clears the dismissed flag and reactivates it. */
export function RecurringRestoreButton({ item }: { item: RecurringItem }) {
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
    <Button variant="outline" size="sm" onClick={restore} disabled={loading} className="shrink-0">
      {loading ? "…" : "Restore"}
    </Button>
  );
}
