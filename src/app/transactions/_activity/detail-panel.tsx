"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconArrowsLeftRight,
  IconBrandGoogle,
  IconCamera,
  IconChevronRight,
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
  IconBuildingStore,
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
import { MerchantDetailPortal, merchantIcon, type MerchantRef } from "@/components/merchant-detail-portal";
import { RecurringClient } from "@/components/settings/recurring/recurring-client";
import { TransactionMap } from "@/components/transaction-map";
import { formatEur, normalizeBudgetType, currencySymbol } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import { resolveDisplayName } from "@/lib/friendly-names";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { getMatchedTransactionInfoFields } from "@/lib/transaction-info-fields";
import { TRANSFER_TYPES, TRANSFER_TYPE_LABELS } from "@/lib/transfer-types";
import { getTransactionSplitTotal } from "@/lib/transaction-splits";
import { cn } from "@/lib/utils";
import type { Category, Goal, Merchant } from "@/db/schema";
import { SplitTransactionDialog } from "../split-transaction-dialog";
import { LinkDialog } from "../link-dialog";
import {
  MerchantPickerDialog,
  RecurrenceCard,
  buildRecurringPrefill,
  guessMerchant,
} from "../transaction-detail-dialog";
import type { TransactionRow } from "../transaction-types";
import { RowIcon, needsCategory, signedAmount } from "./activity-list";

// Nested sheets open above the phone detail sheet (z-50); harmless on desktop.
const NESTED = { sheetClassName: "z-[85]", overlayClassName: "z-[85] backdrop-blur-lg bg-foreground/20" } as const;

const BUDGET_KEY: Record<string, "needs" | "wants" | "save"> = { nodig: "needs", willen: "wants", sparen: "save" };

type ReimbursementLink = { amount: number; reimbursementTransactionId: number; originalTransactionId: number };

async function patchTransaction(body: Record<string, unknown>) {
  await fetch("/api/transactions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * The transaction detail panel of the redesigned Activity page. Desktop shows it inline
 * in the right column for the selected row; phones show the same component in a bottom
 * sheet. Everything the old detail sheet could do is here: category (with "apply to
 * others"), merchant, budget type, transfer type, savings goal, note, receipt, recurrence,
 * plus the action grid (Split, Link reimbursement, Make recurring, Create a rule, Add
 * receipt, Exclude from reports) and an overflow menu for the rest (correct amount,
 * change merchant, brand icon, reimbursement / internal-transfer marks, look up, delete).
 */
export function TransactionDetailPanel({
  row,
  categories,
  savingsGoals,
  onCategorized,
  onDeleted,
}: {
  row: TransactionRow;
  categories: Category[];
  savingsGoals: Goal[];
  onCategorized: (id: number, categoryId: number | null) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("activity.detail");
  const tTags = useTranslations("activity.tags");
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
  const [recurring, setRecurring] = useState<{ id: number; name: string } | null>(
    row.recurringItemId != null ? { id: row.recurringItemId, name: row.recurringFriendlyName || row.recurringName || "" } : null,
  );

  // ── fetched per transaction
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [merchantVersion, setMerchantVersion] = useState(0);
  const [links, setLinks] = useState<ReimbursementLink[] | null>(null);

  useEffect(() => {
    if (row.isInternalTransfer) return;
    let cancelled = false;
    fetch(`/api/merchants/for-transaction?transactionId=${row.id}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMerchant(d.merchant ?? null); })
      .catch(() => { /* leave the field empty rather than break the panel */ });
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

  const paidBack = (links ?? []).filter((l) => l.originalTransactionId === row.id).reduce((s, l) => s + l.amount, 0);
  const allocated = (links ?? []).filter((l) => l.reimbursementTransactionId === row.id).reduce((s, l) => s + l.amount, 0);

  // ── sheets and dialogs
  const [pickerOpen, setPickerOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
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

  const icon = resolveTransactionIcon({
    ...row,
    categoryIcon: currentCat?.icon ?? row.categoryIcon,
    categoryColor: currentCat?.color ?? row.categoryColor,
    merchantIcon: merchant?.icon ?? row.merchantIcon,
    merchantColor: merchant?.color ?? row.merchantColor,
    transferType,
  });

  const dateLabel = isValidISODate(row.date)
    ? new Date(`${row.date}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : row.date;

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
    if (next != null && recurring == null) setRule(newRuleDraft(row, next, "afterChange"));
  }

  async function saveBudgetType(value: string) {
    const next = value || null;
    setBudgetTypeOverride(next);
    await patchTransaction({ id: row.id, budgetTypeOverride: next });
    router.refresh();
  }

  async function saveTransferType(value: string) {
    const next = value || null;
    setTransferType(next);
    await patchTransaction({ id: row.id, transferType: next });
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

  // ── render
  const actionClass =
    "flex h-[42px] items-center gap-2.5 rounded-full border border-line bg-surface px-3.5 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div data-tip-anchor="activityDetail" className="flex flex-col gap-[18px]">
      {/* Header: icon, merchant, date · account, amount, overflow menu */}
      <div className="flex items-center gap-3.5">
        {needsCategory({ ...row, categoryId }) ? (
          <RowIcon row={{ ...row, categoryId }} size="xl" />
        ) : (
          <Icon iconKey={icon.iconKey} color={icon.color} background={icon.background} initials={icon.initials} round size="xl" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h2 className="heading truncate text-xl text-ink">{resolveDisplayName(row)}</h2>
          <span className="truncate text-[13px] text-ink-3">{[dateLabel, row.bankName].filter(Boolean).join(" · ")}</span>
        </div>
        <span className={cn("amount shrink-0 text-[26px]", isExpense ? "text-ink" : "text-positive")}>{signedAmount(row)}</span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            aria-label={t("more")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-surface-2"
          >
            <IconDots className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
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
            <DropdownMenuItem onClick={() => setIconOpen(true)}>
              <IconPhoto className="size-4" />
              {t("menu.brandIcon")}
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
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={remove} className="text-negative">
              <IconTrash className="size-4" />
              {t("menu.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pills: category, budget type, split / paid back / recurring / transfer */}
      <div className="flex flex-wrap gap-2">
        {row.isInternalTransfer ? (
          <Pill tone="info">{(transferType && TRANSFER_TYPE_LABELS[transferType]) || t("internalTransfer")}</Pill>
        ) : currentCat ? (
          <button type="button" onClick={() => !row.isSplit && setPickerOpen(true)} className="inline-flex">
            <Pill>{currentCat.name}</Pill>
          </button>
        ) : row.isSplit ? null : (
          <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex">
            <Pill tone="warning">{t("needsCategory")}</Pill>
          </button>
        )}
        {effectiveBudgetType && BUDGET_KEY[effectiveBudgetType] && (
          <Pill tone={effectiveBudgetType === "nodig" ? "info" : effectiveBudgetType === "sparen" ? "positive" : "accent"}>
            {t(`budgetType.${BUDGET_KEY[effectiveBudgetType]}`)}
          </Pill>
        )}
        {row.isSplit && <Pill>{t("splitInto", { count: row.splitCount })}</Pill>}
        {paidBack > 0 && <Pill tone="positive" icon={<IconReceiptRefund />}>{t("paidBackPill", { amount: formatEur(paidBack) })}</Pill>}
        {row.isReimbursement && <Pill tone="positive">{tTags("paidBack")}</Pill>}
        {recurring && <Pill icon={<IconRepeat />}>{tTags("recurring")}</Pill>}
        {excluded && <Pill>{tTags("notInReports")}</Pill>}
      </div>

      {/* Fields */}
      <div className="flex flex-col">
        {!row.isInternalTransfer && !row.isSplit && (
          <FieldButton label={t("fields.category")} onClick={() => setPickerOpen(true)}>
            {currentCat ? (
              <span className="flex items-center gap-1.5">
                <Icon iconKey={currentCat.icon} color={currentCat.color} size="xs" round />
                {currentCat.name}
              </span>
            ) : (
              <span className="text-warning">{t("choose")}</span>
            )}
          </FieldButton>
        )}
        {isExpense && (
          <Field
            label={t("fields.yourShare")}
            tone={paidBack > 0 ? "positive" : undefined}
          >
            {paidBack > 0
              ? t("shareAfterPayback", { amount: formatEur(Math.max(0, total - paidBack)) })
              : row.correctedAmount != null
                ? t("shareCorrected", { amount: formatEur(row.correctedAmount), original: formatEur(row.amount) })
                : formatEur(total)}
          </Field>
        )}
        {!row.isInternalTransfer && (
          <FieldButton
            label={t("fields.merchant")}
            onClick={() => (merchant ? setOpenMerchant({ id: merchant.id, name: merchant.name }) : setMerchantPickerOpen(true))}
          >
            {merchant ? (
              <span className="flex min-w-0 items-center gap-1.5">
                {(() => {
                  const mi = merchantIcon(merchant);
                  return <Icon iconKey={mi.iconKey} color={mi.color} background={mi.background} size="xs" round />;
                })()}
                <span className="truncate text-mustard-strong">{merchant.name}</span>
              </span>
            ) : (
              <span className="text-ink-3">{t("unknown")}</span>
            )}
          </FieldButton>
        )}
        {!row.isInternalTransfer && currentCat?.budgetType && (
          <Field label={t("fields.budgetType")}>
            <OptionDropdown
              value={budgetTypeOverride ?? ""}
              onChange={saveBudgetType}
              options={[
                {
                  value: "",
                  label: t("budgetTypeDefault", {
                    type: BUDGET_KEY[normalizeBudgetType(currentCat.budgetType)]
                      ? t(`budgetType.${BUDGET_KEY[normalizeBudgetType(currentCat.budgetType)]}`)
                      : currentCat.budgetType,
                  }),
                },
                { value: "nodig", label: t("budgetType.needs") },
                { value: "willen", label: t("budgetType.wants") },
                { value: "sparen", label: t("budgetType.save") },
              ]}
              triggerClassName="h-8 w-auto text-[13px] font-semibold text-ink"
            />
          </Field>
        )}
        {!!row.isInternalTransfer && (
          <Field label={t("fields.transferType")}>
            <OptionDropdown
              value={transferType ?? ""}
              onChange={saveTransferType}
              options={[{ value: "", label: t("transferAuto") }, ...TRANSFER_TYPES.map((x) => ({ value: x.value, label: x.label }))]}
              triggerClassName="h-8 w-auto text-[13px] font-semibold text-ink"
            />
          </Field>
        )}
        {!row.isInternalTransfer && savingsGoals.length > 0 && (
          <FieldButton label={t("fields.savingsGoal")} onClick={() => setGoalOpen(true)}>
            {(() => {
              const goal = savingsGoals.find((g) => g.id === goalId);
              return goal ? goal.name : <span className="text-ink-3">{t("notLinked")}</span>;
            })()}
          </FieldButton>
        )}
        <FieldButton label={t("fields.note")} onClick={() => setNoteOpen(true)}>
          {notes ? <span className="line-clamp-1 break-all">{notes}</span> : <span className="text-ink-3">{t("addNote")}</span>}
        </FieldButton>
        {receiptUrl && (
          <Field label={t("fields.receipt")}>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewingReceipt(true)}
                className="size-9 overflow-hidden rounded-lg border border-line"
                aria-label={t("viewReceipt")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded receipt */}
                <img src={receiptUrl} alt="" className="size-full object-cover" />
              </button>
              <button type="button" onClick={removeReceipt} aria-label={t("removeReceipt")} className="rounded-full p-1.5 text-negative hover:bg-negative-soft">
                <IconTrash className="size-3.5" />
              </button>
            </span>
          </Field>
        )}
        {infoFields.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.value}
          </Field>
        ))}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={actionClass} disabled={!!row.isInternalTransfer} onClick={() => setSplitOpen(true)}>
          <IconArrowsSplit2 className="size-4 shrink-0" />
          {row.isSplit ? t("actions.adjustSplit") : t("actions.split")}
        </button>
        <button
          type="button"
          className={actionClass}
          disabled={row.direction !== "income"}
          title={row.direction !== "income" ? t("actions.linkHint") : undefined}
          onClick={() => setLinkOpen(true)}
        >
          <IconLink className="size-4 shrink-0" />
          {t("actions.link")}
        </button>
        <button type="button" className={actionClass} disabled={recurring != null} onClick={() => setRecurringOpen(true)}>
          <IconRepeat className="size-4 shrink-0" />
          {t("actions.recurring")}
        </button>
        <button
          type="button"
          className={actionClass}
          onClick={() => setRule(newRuleDraft(row, categoryId, "create"))}
        >
          <IconBolt className="size-4 shrink-0" />
          {t("actions.rule")}
        </button>
        <button type="button" className={actionClass} onClick={() => fileRef.current?.click()}>
          <IconCamera className="size-4 shrink-0" />
          {receiptUrl ? t("actions.replaceReceipt") : t("actions.receipt")}
        </button>
        <button type="button" className={actionClass} onClick={toggleExcluded} aria-pressed={excluded}>
          {excluded ? <IconEye className="size-4 shrink-0" /> : <IconEyeOff className="size-4 shrink-0" />}
          {excluded ? t("actions.include") : t("actions.exclude")}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={uploadReceipt} />

      {/* Recurrence — the rule behind a linked transaction, pausable in place. */}
      {recurring && <RecurrenceCard recurringItemId={recurring.id} fallbackName={recurring.name} categories={categories} />}

      {!row.isInternalTransfer && <TransactionMap name={row.customName || row.description} />}

      {row.rawDescription && row.rawDescription !== row.description && (
        <p className="break-all font-mono text-[11px] text-ink-3">{row.rawDescription}</p>
      )}

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
            {savingsGoals.map((goal) => (
              <ChoiceRow key={goal.id} active={goalId === goal.id} onClick={() => applyGoal(goal.id)}>
                <Icon iconKey={goal.icon} color={goal.color} size="xs" round />
                {goal.name}
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
            setRecurring({ id: item.id, name: item.friendlyName || item.name });
            if (item.categoryId != null) setCategoryId(item.categoryId);
          }}
          prefill={buildRecurringPrefill(row, categories)}
        />
      )}

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

    </div>
  );
}

// ── small building blocks ──────────────────────────────────────────────────────

function Field({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "positive" }) {
  return (
    <div className="flex min-h-[42px] items-center justify-between gap-3 border-b border-line py-1.5">
      <span className="shrink-0 text-[13px] text-ink-3">{label}</span>
      <span className={cn("min-w-0 text-right text-[13px] font-semibold", tone === "positive" ? "text-positive" : "text-ink")}>{children}</span>
    </div>
  );
}

function FieldButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[42px] items-center justify-between gap-3 border-b border-line py-1.5 text-left transition-colors hover:bg-surface-2/50"
    >
      <span className="shrink-0 text-[13px] text-ink-3">{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-[13px] font-semibold text-ink">
        {children}
        <IconChevronRight className="size-3.5 shrink-0 text-ink-3" />
      </span>
    </button>
  );
}

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
