"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon, parseImgKey } from "@/components/icon";
import { formatEur, formatDate, BUDGET_TYPE_LABELS } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import { RecurringClient, type RecurringPrefill } from "@/components/settings/recurring/recurring-client";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { getMatchedTransactionInfoFields } from "@/lib/transaction-info-fields";
import { getDominantImageColor } from "@/lib/dominant-color";
import { ContextualTip } from "@/components/contextual-tip";
import dynamic from "next/dynamic";
import type { Category, Goal, Merchant, RecurringItem } from "@/db/schema";
import { MerchantDetailPortal, merchantIcon, type MerchantRef } from "@/components/merchant-detail-portal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransactionMap } from "@/components/transaction-map";
import { CategoryGrid, useCategoryFilter } from "@/components/category-picker";
import { OptionDropdown } from "@/components/option-dropdown";
import { TRANSFER_TYPES } from "@/lib/transfer-types";
import { FREQUENCY_LABELS, nextOccurrence } from "@/lib/recurring-occurrence";
import { acquireNavHidden } from "@/lib/nav-visibility";
import {
  IconTrashFilled as Trash2,
  IconXFilled as X,
  IconCameraFilled as Camera,
  IconMessageFilled as MessageSquare,
  IconReload,
  IconBrandGoogle,
} from "@tabler/icons-react";
import type { TransactionDetail } from "./transaction-types";

// Loaded lazily to break a module cycle: the recurring detail sheet lists its linked
// transactions and opens *this* dialog for them. A static import would leave one of the
// two undefined at render time depending on which module initialises first.
const RecurringDetailDialog = dynamic(
  () => import("@/components/settings/recurring/recurring-detail-dialog").then((m) => m.RecurringDetailDialog),
  { ssr: false },
);

// Always-mounted, controlled wrapper. Keeping the <Dialog> (which becomes a vaul
// bottom-sheet on mobile) mounted and toggling `open` is what makes it animate in —
// conditionally mounting it already-open never opens the mobile sheet. The inner body
// is keyed by row id so its category state resets per transaction, and a "last row"
// keeps content visible through the close animation.
export function TransactionDetailDialog({
  row,
  categories,
  savingsGoals = [],
  onClose,
  onCategorized,
  sheetClassName,
  overlayClassName,
}: {
  row: TransactionDetail | null;
  categories: Category[];
  savingsGoals?: Goal[];
  onClose: () => void;
  onCategorized: (previousCategoryId: number | null, newCategoryName: string, newCategoryId: number | null) => void;
  /** Layering escape hatch for callers that open this sheet from a full-screen body
   *  portal, which sits above the sheet's default z-50 (the merchant profile is z-70).
   *  Every sheet this one opens in turn is at z-85/z-88, so it stays on top of an
   *  elevated base. See TransactionDetailByIdDialog, which is what passes these. */
  sheetClassName?: string;
  overlayClassName?: string;
}) {
  const router = useRouter();
  // Remembers the last opened transaction so content stays visible through the close
  // animation. Synced during render (the same pattern BrandIconsClient uses for its
  // props) rather than by writing a ref mid-render, which React forbids. Compared by
  // id, not identity: while the sheet is open `row` is used directly, so a new object
  // for the same transaction would only cost a wasted render pass.
  const [lastRow, setLastRow] = useState<TransactionDetail | null>(null);
  // Fields this sheet has changed itself since `row` was handed to it. The list that
  // opened the sheet keeps its own snapshot of the transaction, so a router.refresh()
  // re-renders the list but never reaches the object already passed down here —
  // "Make recurring" would leave the open sheet showing a transaction with no
  // recurrence. `patchVersion` re-keys the body so its own field state re-seeds too.
  const [rowPatch, setRowPatch] = useState<Partial<TransactionDetail> | null>(null);
  const [patchVersion, setPatchVersion] = useState(0);
  if (row && row.id !== lastRow?.id) {
    setLastRow(row);
    if (rowPatch) setRowPatch(null);
  }
  const baseRow = row ?? lastRow;
  const shown = baseRow && rowPatch ? { ...baseRow, ...rowPatch } : baseRow;
  const [washColor, setWashColor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Drilled-down merchant profile. The transaction sheet deliberately stays open
  // underneath it (the profile is a full-screen portal that covers it anyway), so
  // reassigning the merchant from the profile's ⋯ menu returns to this sheet with the
  // new merchant already applied instead of dumping you back on the list.
  const [openMerchant, setOpenMerchant] = useState<MerchantRef | null>(null);
  // Picker state lives here, not in the body, because reassignment can be started from
  // the merchant profile — which is rendered by this wrapper.
  // `merchantVersion` tells the body to re-read the field after a pick.
  const [merchantPickerOpen, setMerchantPickerOpen] = useState(false);
  const [merchantVersion, setMerchantVersion] = useState(0);
  // "Make recurring" — opens the same recurrence editor used everywhere else (Settings →
  // Recurring), prefilled from this transaction, rather than navigating away to the old
  // routed "Add fixed cost" form. This sheet stays open underneath: the editor is a
  // dialog above it, so cancelling returns you to the transaction you started from.
  const [recurringOpen, setRecurringOpen] = useState(false);
  function makeRecurring() {
    if (!shown) return;
    setRecurringOpen(true);
  }

  // "What even was this charge?" — searches the cleaned-up merchant guess rather than
  // the raw bank description, which is both a better query and keeps the counterparty's
  // IBAN and payment references out of a URL sent to Google. Opens in a new tab, so an
  // installed PWA hands off to the browser instead of navigating away from the app.
  const lookupQuery = shown ? (guessMerchant(shown.description) || resolveDisplayName(shown)).trim() : "";
  function lookUpOnGoogle() {
    if (!lookupQuery) return;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(lookupQuery)}`, "_blank", "noopener,noreferrer");
  }

  async function pickMerchant(name: string) {
    if (!shown) return;
    const created = await fetch("/api/merchants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!created.ok) return;
    const next: Merchant = await created.json();
    setMerchantPickerOpen(false);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shown.id, merchantId: next.id }),
    });
    setMerchantVersion((v) => v + 1);
    // Reassigning from an open merchant profile re-points that profile at the merchant
    // just picked (the portal refetches on id change), rather than closing it.
    setOpenMerchant((current) => (current ? { id: next.id, name: next.name } : null));
    router.refresh();
  }

  async function remove() {
    if (!shown) return;
    if (!confirm("Delete this transaction?")) return;
    setDeleting(true);
    await fetch("/api/transactions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shown.id }),
    });
    setDeleting(false);
    onClose();
    router.refresh();
  }

  return (
    <>
    {/* One-time explainer for the Google lookup in the header. Only while the sheet is
        genuinely up — not while the merchant profile has it suspended, which has its
        own tip. */}
    <ContextualTip id="googleLookup" active={row != null && openMerchant == null} />

    {/* Suspended (not closed) while the merchant profile is up: that profile is a
        full-screen body portal, and leaving this sheet *open* underneath it means its
        focus trap keeps yanking focus back out of the profile's own inputs — the rename
        field was impossible to type in. `row` is untouched, so the sheet slides back
        with the same transaction (and the refreshed merchant) when the profile closes.
        The onOpenChange guard keeps that from being reported as a real dismissal. */}
    <Dialog
      open={row != null && openMerchant == null}
      onOpenChange={(open) => { if (!open && openMerchant == null) onClose(); }}
    >
      <DialogContent
        accentColor={washColor}
        sheetClassName={sheetClassName}
        overlayClassName={overlayClassName}
        headerAction={
          shown ? (
            <div className="flex items-center gap-2">
              {lookupQuery && (
                <button
                  type="button"
                  onClick={lookUpOnGoogle}
                  aria-label={`Look up "${lookupQuery}" on Google`}
                  title="Look up on Google"
                  className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
                >
                  <IconBrandGoogle className="size-4.5" stroke={2.5} />
                </button>
              )}
              {/* Only offered for transactions that aren't already driven by a recurring
                  rule — for those the recurrence card below is the way in, and creating
                  a second rule off the same transaction would just duplicate it. */}
              {shown.recurringItemId == null && (
              <button
                type="button"
                onClick={makeRecurring}
                aria-label="Make recurring"
                className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
              >
                <IconReload className="size-4.5" />
              </button>
              )}
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                aria-label="Delete"
                className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
              >
                <Trash2 className="size-4.5" />
              </button>
            </div>
          ) : undefined
        }
      >
        <DialogTitle className="sr-only">Transaction details</DialogTitle>
        {shown && (
          <TransactionDetailBody
            key={`${shown.id}:${patchVersion}`}
            row={shown}
            categories={categories}
            savingsGoals={savingsGoals}
            onCategorized={onCategorized}
            onWashColor={setWashColor}
            onOpenMerchant={setOpenMerchant}
            onChangeMerchant={() => setMerchantPickerOpen(true)}
            merchantVersion={merchantVersion}
          />
        )}
      </DialogContent>
    </Dialog>

    <MerchantDetailPortal
      merchant={openMerchant}
      onClose={() => setOpenMerchant(null)}
      // Reassigning *this transaction* is a transaction-level action, so it's offered
      // from the profile's menu (the field itself is now a plain drill-down row).
      onChangeMerchant={() => setMerchantPickerOpen(true)}
    />

    {/* A sibling of both, not a child: it has to be openable from the merchant profile,
        which is up at a point where the transaction sheet is suspended. */}
    <MerchantPickerDialog
      open={merchantPickerOpen}
      currentId={null}
      suggestion={shown ? guessMerchant(shown.description) : ""}
      onOpenChange={setMerchantPickerOpen}
      onPick={pickMerchant}
    />

    {/* The app's one recurrence editor, opened in "add" mode with this transaction's
        details filled in. Mounted only while open so it re-seeds from whichever
        transaction the sheet is showing — its form state is initialised once. */}
    {recurringOpen && shown && (
      <RecurringClient
        action="add"
        open
        onOpenChange={(v) => {
          setRecurringOpen(v);
          // Saving refreshes the route; closing the transaction sheet too would drop the
          // user back on the list, so it deliberately stays put.
          if (!v) router.refresh();
        }}
        // The API re-runs the rules on save, so this transaction is now linked to the
        // new item server-side — mirror that here so the open sheet shows the
        // recurrence card (and its category) straight away instead of after a reopen.
        onSaved={(item) => {
          const cat = item.categoryId != null ? categories.find((c) => c.id === item.categoryId) : undefined;
          setRowPatch({
            recurringItemId: item.id,
            recurringName: item.name,
            recurringFriendlyName: item.friendlyName,
            ...(cat
              ? {
                  categoryId: cat.id,
                  categoryName: cat.name,
                  categoryColor: cat.color,
                  categoryIcon: cat.icon,
                  categoryBudgetType: cat.budgetType,
                }
              : {}),
          });
          setPatchVersion((v) => v + 1);
        }}
        prefill={buildRecurringPrefill(shown, categories)}
      />
    )}
    </>
  );
}

function TransactionDetailBody({
  row,
  categories,
  savingsGoals,
  onCategorized,
  onWashColor,
  onOpenMerchant,
  onChangeMerchant,
  merchantVersion,
}: {
  row: TransactionDetail;
  categories: Category[];
  savingsGoals: Goal[];
  onCategorized: (previousCategoryId: number | null, newCategoryName: string, newCategoryId: number | null) => void;
  onWashColor: (color: string | null) => void;
  onOpenMerchant: (merchant: MerchantRef) => void;
  onChangeMerchant: () => void;
  merchantVersion: number;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string | null>(row.categoryId != null ? String(row.categoryId) : null);
  const [goalId, setGoalId] = useState<number | null>(row.goalId ?? null);
  const [goalSaving, setGoalSaving] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  // The filter button sits in the sheet's header row next to the close button, so it
  // takes the close button's styling.
  const { budgetType, showSubcategories, filterMenu } = useCategoryFilter({
    triggerClassName: "size-11 rounded-full bg-white dark:bg-white/7 shadow-lg text-foreground",
  });
  const [excluded, setExcluded] = useState(!!row.excludeFromReports);
  type BulkPrompt = {
    newCatId: number | null;
    newCatName: string;
    matchPattern: string;
    matchType: "contains" | "exact";
    amountMode: "none" | "exact" | "range";
    amountExact: string;
    amountMin: string;
    amountMax: string;
  };
  const [bulkPrompt, setBulkPrompt] = useState<BulkPrompt | null>(null);
  const [budgetTypeOverride, setBudgetTypeOverride] = useState<string | null>(row.budgetTypeOverride ?? null);
  const [transferType, setTransferType] = useState<string | null>(row.transferType ?? null);
  // Merchant — fetched per transaction rather than carried on every row shape, so the
  // field works from every place that opens this dialog (transactions list, dashboard,
  // needs-review). The endpoint derives and links one on the fly if the row has none.
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [notes, setNotes] = useState<string | null>(row.notes ?? null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteValue, setNoteValue] = useState(row.notes ?? "");
  const [noteSaving, setNoteSaving] = useState(false);

  // Hide the mobile bottom nav while the category picker sheet is open.
  useEffect(() => {
    if (!showPicker) return;
    return acquireNavHidden();
  }, [showPicker]);

  useEffect(() => {
    if (row.isInternalTransfer) return;
    let cancelled = false;
    fetch(`/api/merchants/for-transaction?transactionId=${row.id}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMerchant(d.merchant ?? null); })
      .catch(() => { /* leave the field empty rather than break the sheet */ });
    return () => { cancelled = true; };
    // merchantVersion: the picker lives in the wrapper (so it outlives this sheet when
    // reassignment is started from the merchant profile) — a bump means re-read.
  }, [row.id, row.isInternalTransfer, merchantVersion]);

  const currentCat = categories.find((c) => c.id === parseInt(categoryId ?? ""));
  const merchantPattern = guessMerchant(row.description);
  const infoFields = getMatchedTransactionInfoFields(row.rawDescription);

  async function toggleExcluded() {
    const next = !excluded;
    setExcluded(next);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, excludeFromReports: next }),
    });
    router.refresh();
  }

  // Overrides the budget type for this one transaction only — the category's own
  // budgetType is left untouched, so this never affects any other transaction.
  async function saveBudgetTypeOverride(value: string) {
    const next = value || null;
    setBudgetTypeOverride(next);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, budgetTypeOverride: next }),
    });
    router.refresh();
  }

  // Manual override for the internal-transfer sub-type; null resets to the
  // auto-detected value inherited from the opposite account (see effectiveTransferTypeExpr).
  async function saveTransferType(value: string) {
    const next = value || null;
    setTransferType(next);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, transferType: next }),
    });
    router.refresh();
  }

  async function applyCategory(value: string) {
    const newCatId = value ? parseInt(value, 10) : null;
    const newCatName = categories.find((c) => c.id === newCatId)?.name ?? "No category";
    setSaving(true);
    setCategoryId(value || null);
    setShowPicker(false);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, categoryId: newCatId }),
    });
    setSaving(false);
    onCategorized(row.categoryId, newCatName, newCatId);
    router.refresh();
    // Transactions linked to a recurring item already get their category from the
    // recurring rule, so don't nag to bulk-apply — it's redundant here.
    if (row.recurringItemId == null) {
      const rowAmount = row.correctedAmount ?? row.amount;
      setBulkPrompt({
        newCatId,
        newCatName,
        matchPattern: merchantPattern,
        matchType: "contains",
        amountMode: "none",
        amountExact: rowAmount != null ? String(rowAmount) : "",
        amountMin: "",
        amountMax: "",
      });
    }
  }

  // Linking a transaction to a savings goal adds/removes its amount from that goal's
  // currentAmount server-side (see /api/transactions PATCH + src/lib/goal-contributions.ts).
  async function saveNote() {
    setNoteSaving(true);
    const next = noteValue.trim() || null;
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, notes: next }),
    });
    setNotes(next);
    setNoteSaving(false);
    setNoteOpen(false);
    router.refresh();
  }

  async function applyGoal(value: number | null) {
    setGoalSaving(true);
    setGoalId(value);
    setShowGoalPicker(false);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, goalId: value }),
    });
    setGoalSaving(false);
    router.refresh();
  }

  async function applyBulk() {
    if (!bulkPrompt) return;
    const amountFields =
      bulkPrompt.amountMode === "exact"
        ? { amount: bulkPrompt.amountExact ? parseFloat(bulkPrompt.amountExact) : null, amountMin: null, amountMax: null }
        : bulkPrompt.amountMode === "range"
          ? {
              amount: null,
              amountMin: bulkPrompt.amountMin ? parseFloat(bulkPrompt.amountMin) : null,
              amountMax: bulkPrompt.amountMax ? parseFloat(bulkPrompt.amountMax) : null,
            }
          : { amount: null, amountMin: null, amountMax: null };

    // Without an amount constraint, immediately categorize every name match. With one,
    // skip that broad pass and let the rule + apply-rules do the matching so the amount
    // filter is actually respected (a plain name PATCH can't filter on amount).
    if (bulkPrompt.amountMode === "none") {
      await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: bulkPrompt.matchPattern, categoryId: bulkPrompt.newCatId, matchType: bulkPrompt.matchType }),
      });
    }
    if (bulkPrompt.newCatId !== null) {
      await fetch("/api/category-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: bulkPrompt.newCatId,
          namePattern: bulkPrompt.matchPattern,
          nameWildcard: bulkPrompt.matchType === "contains",
          nameWholeWord: false,
          direction: null,
          bankId: null,
          ...amountFields,
        }),
      });
      await fetch("/api/apply-rules", { method: "POST" });
    }
    setBulkPrompt(null);
    router.refresh();
  }

  const isExpense = row.direction === "expense";
  const displayAmount = row.correctedAmount ?? row.amount;
  const signedAmount = isExpense && !row.isReimbursement ? -displayAmount : displayAmount;

  // resolveTransactionIcon() already applies the white-logo-backdrop fallback.
  const detailIcon = resolveTransactionIcon({
    ...row,
    categoryIcon: currentCat?.icon ?? row.categoryIcon,
    categoryColor: currentCat?.color ?? row.categoryColor,
    // Prefer the merchant fetched for this sheet over the one baked into the row, so
    // reassigning the merchant re-skins the hero without waiting for a page refresh.
    merchantIcon: merchant?.icon ?? row.merchantIcon,
    merchantColor: merchant?.color ?? row.merchantColor,
    transferType,
  });
  const detailIconBg = detailIcon.background;

  // Wash color: explicit brand/category color first, then (for uploaded images) the
  // image's own dominant color, then a configured icon backdrop, then a neutral tint —
  // so every icon type gets a header wash, not just ones with an explicit brand color.
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const isImgIcon = !!detailIcon.iconKey?.startsWith("img:");
  const isCustomIcon = !!detailIcon.iconKey?.startsWith("custom:");

  useEffect(() => {
    if (!isImgIcon || !detailIcon.iconKey) { setDominantColor(null); return; }
    const { src } = parseImgKey(detailIcon.iconKey);
    let cancelled = false;
    getDominantImageColor(src).then((c) => { if (!cancelled) setDominantColor(c); });
    return () => { cancelled = true; };
  }, [isImgIcon, detailIcon.iconKey]);

  const washColor = detailIcon.color
    ?? (isImgIcon ? dominantColor : null)
    ?? (isCustomIcon && row.brandIconBgColor && row.brandIconBgColor.toLowerCase() !== "#ffffff" ? row.brandIconBgColor : null)
    ?? (isCustomIcon ? "#64748b" : null);

  useEffect(() => {
    onWashColor(washColor);
    return () => onWashColor(null);
  }, [washColor]);

  return (
    <>
      <div className="space-y-4">
        {/* Hero: centered icon + name + amount + date. The color wash renders at the
            sheet level (see DialogContent's accentColor prop) so it isn't clipped by
            the drag-handle chrome above this component on mobile. */}
        <div className="relative -mx-6 -mt-2 lg:-mx-7 lg:-mt-7 px-6 lg:px-7 pt-2 lg:pt-7">
          <div className="relative flex flex-col items-center text-center gap-1 pb-2">
            {/* Recurring badge on the icon's top-right, same marker the transaction
                lists draw (see mobile-transaction-list.tsx), scaled to the xxl chip.
                mt-1 is what keeps it visible: the hero's -mt-2 is exactly cancelled by
                its own pt-2, so the icon starts flush with the top of the sheet's
                scroll area — and a badge offset above that edge is clipped away. */}
            <div className="relative mt-1">
              <Icon iconKey={detailIcon.iconKey} color={detailIcon.color} background={detailIconBg} initials={detailIcon.initials} round size="xxl" />
              {row.recurringItemId != null && (
                <span
                  aria-label="Recurring bill"
                  className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-foreground dark:bg-foreground"
                >
                  <IconReload className="size-3.5 text-background" stroke={2.5} />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-3 px-4">
              <span className="font-semibold text-lg leading-snug">{resolveDisplayName(row)}</span>
            </div>
            <p className={cn(
              "text-3xl font-bold tabular-nums mt-1",
              row.isReimbursement ? "text-amber-600" : isExpense ? "text-foreground" : "text-foreground dark:text-emerald-400"
            )}>
              {formatEur(Math.abs(signedAmount))}
            </p>
            <p className="text-sm text-foreground/50 mt-1">{formatDate(row.date)}</p>
          </div>
        </div>

        {/* Transaction info — parsed from the raw bank description via
            src/config/transactionInfoFields.ts. Absent entirely (no card, no gap)
            unless at least one configured field actually matched this transaction. */}
        {infoFields.length > 0 && (
          <div className="rounded-xl bg-[var(--dialog-content-background)] backdrop-blur-xs text-sm py-2">
            {infoFields.map((field) => (
              <DetailRow key={field.key} label={field.label} value={field.value} />
            ))}
          </div>
        )}

        {/* Map */}
        {!row.isInternalTransfer && (
          <TransactionMap name={row.customName || row.description} />
        )}
          {/* Category — tappable, opens picker dialog */}
          {!row.isInternalTransfer && (
            <>
              <div className="rounded-full bg-[var(--dialog-content-background)] backdrop-blur-xs text-sm py-2">
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-md active:bg-foreground/[0.04] transition-colors"
                onClick={() => !row.isSplit && setShowPicker(true)}
                disabled={!!row.isSplit}
              >
                <span className="text-muted-foreground shrink-0">Category</span>
                <div className="flex items-center gap-1.5">
                  {currentCat ? (
                    <>
                      <Icon iconKey={currentCat.icon} color={currentCat.color} size="xs" round />
                      <span className="font-medium text-foreground">{currentCat.name}</span>
                    </>
                  ) : (
                    <span className="font-medium text-muted-foreground/50">Uncategorized</span>
                  )}
                </div>
              </button>
              </div>

              {/* Nothing categorized yet — a filled call-to-action right under the row,
                  since an uncategorized transaction is the one thing worth fixing here
                  and the row itself reads as a value, not an action. */}
              {!currentCat && !row.isSplit && (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="w-full rounded-full bg-foreground text-background py-3.5 text-md font-medium active:scale-[0.98] transition-transform"
                >
                  Select category
                </button>
              )}

              <Dialog open={showPicker && !row.isSplit} onOpenChange={(v) => !v && setShowPicker(false)}>
                {/* sheetClassName must match the overlay's z-index: the overlay is
                    lifted to 65 to sit above the parent sheet (z-50), and without the
                    same lift here the content stays at 50 — i.e. *under* its own
                    blurred overlay, which then frosts the picker along with the page. */}
                <DialogContent
                  sheetClassName="z-[85]"
                  overlayClassName="z-[85] backdrop-blur-lg bg-foreground/20"
                  fullHeight
                  hideHandle
                  headerAction={filterMenu}
                  title="Category"
                >
                  <CategoryGrid
                    categories={categories}
                    current={categoryId ?? undefined}
                    isFormMode={true}
                    fill
                    budgetType={budgetType}
                    showSubcategories={showSubcategories}
                    onChange={(v) => applyCategory(v === "none" ? "" : v)}
                    onClose={() => setShowPicker(false)}
                  />
                  {saving && <p className="text-xs text-muted-foreground text-center -mt-1">Saving...</p>}
                </DialogContent>
              </Dialog>
            </>
          )}
        {/* Merchant — same row treatment as Category above: icon + name, whole row
            tappable. Tapping drills into the merchant's profile once one is set;
            with no merchant yet it opens the picker, since there'd be nothing to
            drill into. Reassigning an existing one lives in the profile's ⋯ menu. */}
        {!row.isInternalTransfer && (
          <div className="rounded-full bg-[var(--dialog-content-background)] backdrop-blur-xs text-sm py-2">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-md active:bg-foreground/[0.04] transition-colors"
              onClick={() =>
                merchant
                  ? onOpenMerchant({ id: merchant.id, name: merchant.name })
                  : onChangeMerchant()
              }
            >
              <span className="text-muted-foreground shrink-0">Merchant</span>
              <div className="flex items-center gap-1.5 min-w-0">
                {merchant ? (
                  <>
                    {(() => {
                      const icon = merchantIcon(merchant);
                      return <Icon iconKey={icon.iconKey} color={icon.color} background={icon.background} size="xs" round />;
                    })()}
                    <span className="font-medium text-foreground truncate">{merchant.name}</span>
                  </>
                ) : (
                  <>
                    <Icon iconKey={null} color={null} size="xs" round />
                    <span className="font-medium text-muted-foreground/50">Unknown</span>
                  </>
                )}
              </div>
            </button>
          </div>
        )}

        {/* Details grid */}
        <div className="rounded-xl bg-[var(--dialog-content-background)] backdrop-blur-xs text-sm py-2">
                    {/* Exclude from reports toggle */}
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm active:bg-foreground/[0.04] transition-colors"
            onClick={toggleExcluded}
          >
            <span className="text-muted-foreground">Not in reports</span>
            <div className={cn(
              "relative w-11 h-6 rounded-full transition-colors shrink-0",
              excluded ? "bg-primary" : "bg-foreground/20"
            )}>
              <div className={cn(
                "absolute top-0.5 size-5 bg-[var(--dialog-content-background)] rounded-full shadow-sm transition-transform",
                excluded ? "translate-x-[22px]" : "translate-x-0.5"
              )} />
            </div>
          </button>
          {row.bankName && <DetailRow label="Bank" value={row.bankName} />}

          {/* Savings goal — links this transaction's amount to a goal's currentAmount */}
          {!row.isInternalTransfer && savingsGoals.length > 0 && (
            <>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm active:bg-foreground/[0.04] transition-colors"
                onClick={() => setShowGoalPicker(true)}
              >
                <span className="text-muted-foreground shrink-0">Savings goal</span>
                {(() => {
                  const goal = savingsGoals.find((g) => g.id === goalId);
                  return goal ? (
                    <span className="flex items-center gap-1.5">
                      <Icon iconKey={goal.icon} color={goal.color} size="xs" round />
                      <span className="font-medium text-foreground">{goal.name}</span>
                    </span>
                  ) : (
                    <span className="font-medium text-muted-foreground/50">None</span>
                  );
                })()}
              </button>

              <Dialog open={showGoalPicker} onOpenChange={setShowGoalPicker}>
                <DialogContent sheetClassName="z-[85]" overlayClassName="z-[85] backdrop-blur-lg bg-foreground/20">
                  <DialogTitle>Choose savings goal</DialogTitle>
                  <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => applyGoal(null)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-left transition-colors",
                        goalId == null ? "bg-foreground/8 font-semibold" : "hover:bg-foreground/5",
                      )}
                    >
                      None
                    </button>
                    {savingsGoals.map((goal) => (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => applyGoal(goal.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-left transition-colors",
                          goalId === goal.id ? "bg-foreground/8 font-semibold" : "hover:bg-foreground/5",
                        )}
                      >
                        <Icon iconKey={goal.icon} color={goal.color} size="xs" round />
                        {goal.name}
                      </button>
                    ))}
                  </div>
                  {goalSaving && <p className="text-xs text-muted-foreground text-center">Saving...</p>}
                </DialogContent>
              </Dialog>
            </>
          )}

          {/* Budget type — per-transaction override; falls back to the category's own budget type */}
          {currentCat?.budgetType && (
            <div className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground shrink-0">Budget type</span>
              <OptionDropdown
                value={budgetTypeOverride ?? ""}
                onChange={saveBudgetTypeOverride}
                options={[
                  { value: "", label: `Standaard (${BUDGET_TYPE_LABELS[currentCat.budgetType] ?? currentCat.budgetType})` },
                  ...Object.entries(BUDGET_TYPE_LABELS).map(([value, label]) => ({ value, label })),
                ]}
                triggerClassName="h-9 w-auto text-sm text-foreground"
              />
            </div>
          )}

          {!!row.isInternalTransfer && (
            <div className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground shrink-0">Transfer type</span>
              <OptionDropdown
                value={transferType ?? ""}
                onChange={saveTransferType}
                options={[
                  { value: "", label: "Auto (from account)" },
                  ...TRANSFER_TYPES.map((t) => ({ value: t.value, label: t.label })),
                ]}
                triggerClassName="h-9 w-auto text-sm text-foreground"
              />
            </div>
          )}
          {!!row.isReimbursement && <DetailRow label="Type" value="Reimbursement" />}
          {row.correctedAmount != null && (
            <DetailRow label="Original amount" value={formatEur(row.amount)} />
          )}
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm active:bg-foreground/[0.04] transition-colors"
            onClick={() => { setNoteValue(notes ?? ""); setNoteOpen(true); }}
          >
            <span className="text-muted-foreground shrink-0">Note</span>
            {notes ? (
              <span className="font-medium text-right break-all line-clamp-1">{notes}</span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <MessageSquare className="size-3.5" />
                Add note
              </span>
            )}
          </button>

          <ReceiptSection transactionId={row.id} receiptUrl={row.receiptUrl ?? null} />
        </div>

        {/* Recurrence — set when this transaction matched a recurring item's pattern
            (see src/lib/recurring-match.ts). Its own card rather than a detail row, so
            the schedule can be read and paused/cancelled without leaving the sheet. */}
        {row.recurringItemId != null && (
          <RecurrenceCard
            recurringItemId={row.recurringItemId}
            fallbackName={row.recurringFriendlyName || row.recurringName || "Recurring"}
            categories={categories}
          />
        )}

        {/* Split summary */}
        {!!row.isSplit && row.splitSummary && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Split ({row.splitCount} shares)</p>
            <p className="text-xs text-muted-foreground">{row.splitSummary}</p>
          </div>
        )}

        {/* Raw description */}
        {row.rawDescription && row.rawDescription !== row.description && (
          <p className="text-xs text-muted-foreground break-all text-center">
            {row.rawDescription}
          </p>
        )}
      </div>

      {/* Note editor */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent sheetClassName="z-[85]" overlayClassName="z-[85] backdrop-blur-lg bg-foreground/20">
          <DialogHeader>
            <DialogTitle>Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-5 focus:ring-primary/50"
              rows={4}
              placeholder="Add a note…"
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Leave empty to remove the note.</p>
            <Button onClick={saveNote} disabled={noteSaving} className="w-full">
              {noteSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk-categorize dialog */}
      <Dialog open={!!bulkPrompt} onOpenChange={(v) => !v && (setBulkPrompt(null), router.refresh())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Also apply to other transactions?</DialogTitle>
            <DialogDescription>
              Assign <strong>{bulkPrompt?.newCatName}</strong> to all transactions matching:
            </DialogDescription>
          </DialogHeader>
          {bulkPrompt && (
            <div className="space-y-3">
              <input
                type="text"
                value={bulkPrompt.matchPattern}
                onChange={(e) => setBulkPrompt((p) => p ? { ...p, matchPattern: e.target.value } : p)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              />
              <div className="flex rounded-md overflow-hidden text-xs">
                {(["contains", "exact"] as const).map((t, i) => (
                  <button key={t} type="button"
                    onClick={() => setBulkPrompt((p) => p ? { ...p, matchType: t } : p)}
                    className={`flex-1 px-3 py-2.5 transition-colors ${bulkPrompt.matchType === t ? "bg-foreground text-primary-foreground font-medium" : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"} ${i > 0 ? "border-l border-foreground/10" : ""}`}
                  >
                    {t === "contains" ? "Name contains" : "Exact name"}
                  </button>
                ))}
              </div>

              {/* Amount condition — no filter, this transaction's amount, or a range. */}
              <div>
                <div className="flex rounded-md overflow-hidden text-xs">
                  {([
                    { v: "none", label: "Any amount" },
                    { v: "exact", label: "This amount" },
                    { v: "range", label: "Between" },
                  ] as const).map((opt, i) => (
                    <button key={opt.v} type="button"
                      onClick={() => setBulkPrompt((p) => p ? { ...p, amountMode: opt.v } : p)}
                      className={`flex-1 px-3 py-2.5 transition-colors ${bulkPrompt.amountMode === opt.v ? "bg-foreground text-primary-foreground font-medium" : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"} ${i > 0 ? "border-l border-foreground/10" : ""}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {bulkPrompt.amountMode === "exact" && (
                  <input
                    type="number"
                    step="0.01"
                    value={bulkPrompt.amountExact}
                    onChange={(e) => setBulkPrompt((p) => p ? { ...p, amountExact: e.target.value } : p)}
                    placeholder="Bedrag"
                    className="mt-2 w-full border rounded-lg px-3 py-2 text-sm bg-background"
                  />
                )}
                {bulkPrompt.amountMode === "range" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={bulkPrompt.amountMin}
                      onChange={(e) => setBulkPrompt((p) => p ? { ...p, amountMin: e.target.value } : p)}
                      placeholder="Min"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={bulkPrompt.amountMax}
                      onChange={(e) => setBulkPrompt((p) => p ? { ...p, amountMax: e.target.value } : p)}
                      placeholder="Max"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setBulkPrompt(null); router.refresh(); }}>
                  Alleen deze
                </Button>
                <Button className="flex-1" onClick={applyBulk} disabled={!bulkPrompt.matchPattern}>
                  Alle toepassen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Merchant picker: pick one of the merchants already in use, or type a new name.
// Both paths go through POST /api/merchants, which get-or-creates by normalized name —
// so typing "albert heijn" when "Albert Heijn" exists reuses that profile.
function MerchantPickerDialog({
  open,
  currentId,
  suggestion,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  currentId: number | null;
  suggestion: string;
  onOpenChange: (open: boolean) => void;
  onPick: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* z-[80]: reassignment can be started from the merchant profile, a body portal at
          z-70 that now stays open behind this picker — without it the sheet opens
          underneath the profile and looks like nothing happened. */}
      <DialogContent sheetClassName="z-[88]" overlayClassName="z-[88] backdrop-blur-lg bg-foreground/20">
        <DialogHeader>
          <DialogTitle>Merchant</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open so the search box and merchant list reset per
            opening, instead of an effect resetting them on every `open` flip. */}
        {open && <MerchantPickerBody currentId={currentId} suggestion={suggestion} onPick={onPick} />}
      </DialogContent>
    </Dialog>
  );
}

function MerchantPickerBody({
  currentId,
  suggestion,
  onPick,
}: {
  currentId: number | null;
  suggestion: string;
  onPick: (name: string) => void;
}) {
  const [all, setAll] = useState<Array<{ id: number; name: string; icon: string | null; color: string | null; transactionCount: number }>>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/merchants")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAll(Array.isArray(d) ? d : []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const term = query.trim().toLowerCase();
  const matches = term ? all.filter((m) => m.name.toLowerCase().includes(term)) : all;
  const exact = all.some((m) => m.name.toLowerCase() === term);

  return (
        <div className="space-y-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={suggestion ? `Search or add — e.g. ${suggestion}` : "Search or add a merchant"}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
          />
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {term && !exact && (
              <button
                type="button"
                onClick={() => onPick(query.trim())}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-left hover:bg-foreground/5 transition-colors"
              >
                <span className="font-medium">Add “{query.trim()}”</span>
              </button>
            )}
            {loading && <p className="text-xs text-muted-foreground px-3 py-2">Loading…</p>}
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onPick(m.name)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-left transition-colors",
                  m.id === currentId ? "bg-foreground/8 font-semibold" : "hover:bg-foreground/5",
                )}
              >
                <Icon iconKey={m.icon} color={m.color} size="xs" round />
                <span className="flex-1 truncate">{m.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{m.transactionCount}</span>
              </button>
            ))}
            {!loading && matches.length === 0 && !term && (
              <p className="text-xs text-muted-foreground px-3 py-2">No merchants yet.</p>
            )}
          </div>
        </div>
  );
}

// Extract the likely merchant/brand name from a raw transaction description.
// Stops at the first token that contains a digit (store numbers, postal codes, etc.)
// so "ALDI CUL009 TIEL TIEL NLD" → "ALDI", "Albert Heijn 1177 DOORN NLD" → "Albert Heijn".
function guessMerchant(description: string): string {
  const tokens = description.trim().split(/\s+/);
  const brand: string[] = [];
  for (const t of tokens) {
    if (/\d/.test(t)) break;
    brand.push(t);
    if (brand.length >= 3) break;
  }
  return brand.join(" ") || description;
}

// Everything a recurring item can inherit from a single transaction: name, amount, the
// date it starts from, match pattern and category. Anything not derivable (frequency,
// notes) keeps the editor's own defaults.
function buildRecurringPrefill(row: TransactionDetail, categories: Category[]): RecurringPrefill {
  const category = categories.find((c) => c.id === row.categoryId);
  const amount = row.correctedAmount ?? row.amount;
  const budgetType = row.budgetTypeOverride ?? category?.budgetType ?? null;

  return {
    name: resolveDisplayName(row),
    type: row.direction === "income" ? "income" : "bill",
    amount: amount != null ? String(Math.abs(amount)) : undefined,
    budgetType: budgetType && ["nodig", "willen", "sparen"].includes(budgetType) ? budgetType : undefined,
    // The editor turns this into dueDay on save. A transaction whose date never parsed
    // (a mis-mapped CSV import) is left out, so the form falls back to today.
    startDate: isValidISODate(row.date) ? row.date : undefined,
    matchPattern: guessMerchant(row.description) || undefined,
    categoryId: row.categoryId != null ? String(row.categoryId) : undefined,
  };
}

// The recurring rule behind a linked transaction: its schedule at a glance, plus the
// two actions worth having in the moment — pause (keeps the rule, stops it matching
// and projecting) and cancel (removes it entirely; auto-detected items are soft-
// dismissed server-side so the detector doesn't recreate them).
function RecurrenceCard({
  recurringItemId,
  fallbackName,
  categories,
}: {
  recurringItemId: number;
  fallbackName: string;
  categories: Category[];
}) {
  const router = useRouter();
  const [item, setItem] = useState<RecurringItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  // Bumped when the detail sheet closes, so edits made in there (name, frequency,
  // dates, active) are reflected here — a router.refresh() wouldn't reach this card's
  // own client-fetched copy, and firing one mid-close makes the sheet stutter.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let ignore = false;
    fetch("/api/recurring")
      .then((r) => r.json())
      .then((rows: RecurringItem[]) => {
        if (!ignore) setItem(Array.isArray(rows) ? rows.find((r) => r.id === recurringItemId) ?? null : null);
      })
      .catch(() => { /* leave the card in its loading state rather than break the sheet */ });
    return () => { ignore = true; };
  }, [recurringItemId, version]);

  async function togglePaused() {
    if (!item) return;
    const next = !item.active;
    setBusy(true);
    setItem({ ...item, active: next });
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, active: next }),
    });
    setBusy(false);
    router.refresh();
  }

  async function cancelRecurrence() {
    if (!item) return;
    if (!confirm(`Cancel “${item.friendlyName || item.name}”? Future occurrences stop and the rule is removed.`)) return;
    setBusy(true);
    await fetch("/api/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    setBusy(false);
    setCancelled(true);
    router.refresh();
  }

  if (cancelled) {
    return (
      <div className="rounded-xl bg-[var(--dialog-content-background)] backdrop-blur-xs px-4 py-3 text-sm text-muted-foreground text-center">
        Recurrence cancelled.
      </div>
    );
  }

  const next = item && item.active ? nextOccurrence(item) : null;

  return (
    <div className="space-y-2">
      <p className="px-1 text-sm font-medium text-foreground/60">Recurrence</p>
      <div className="rounded-xl bg-[var(--dialog-content-background)] backdrop-blur-xs text-sm">
        {/* Name + schedule — the whole block drills into the recurring item itself
            (same sheet the Recurring settings list opens), where the amount, match
            pattern, category and every linked transaction live. */}
        <button
          type="button"
          onClick={() => item && setDetailOpen(true)}
          disabled={!item}
          className="w-full px-4 py-3 border-b border-foreground/10 text-center active:bg-foreground/[0.04] transition-colors disabled:active:bg-transparent"
        >
          <span className="flex items-center justify-center gap-1.5 font-medium text-foreground">
            {item ? item.friendlyName || item.name : fallbackName}
          </span>
          <span className="mt-1 flex items-center justify-center gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="flex size-5 items-center justify-center rounded bg-foreground/10 text-[10px] font-semibold uppercase text-foreground/70">
                {(item?.frequency ?? "-").slice(0, 1)}
              </span>
              {item ? FREQUENCY_LABELS[item.frequency] ?? item.frequency : "—"}
            </span>
            {item && (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <span className={cn("size-2 rounded-full", item.active ? "bg-emerald-500" : "bg-foreground/30")} />
                {item.active ? "Active" : "Paused"}
              </span>
            )}
          </span>
        </button>
        {item?.startDate && <DetailRow label="Started" value={formatDate(item.startDate)} />}
        {item?.endDate && <DetailRow label="Ends" value={formatDate(item.endDate)} />}
        {next && <DetailRow label="Next occurrence" value={formatDate(next)} />}
        <div className="flex gap-2 px-4 py-3">
          <Button variant="default" className="flex-1 rounded-full" onClick={togglePaused} disabled={!item || busy}>
            {item && !item.active ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="destructive"
            className="flex-1 rounded-full"
            onClick={cancelRecurrence}
            disabled={!item || busy}
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Nested inside the transaction sheet's content, so closing it returns here. */}
      <RecurringDetailDialog
        item={detailOpen ? item : null}
        category={categories.find((c) => c.id === item?.categoryId) ?? null}
        categories={categories}
        onClose={() => { setDetailOpen(false); setVersion((v) => v + 1); }}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}

// Photo attach/view for a transaction receipt. Uses a plain fixed full-screen overlay
// for the viewer rather than Dialog — better suited to a photo than a form sheet.
function ReceiptSection({ transactionId, receiptUrl }: { transactionId: number; receiptUrl: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(receiptUrl);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("transactionId", String(transactionId));
    const res = await fetch("/api/transactions/receipt", { method: "POST", body: formData });
    setUploading(false);
    if (res.ok) {
      const { receiptUrl: newUrl } = await res.json();
      setUrl(newUrl);
      router.refresh();
    }
  }

  async function remove() {
    setUrl(null);
    await fetch("/api/transactions/receipt", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId }),
    });
    router.refresh();
  }

  return (
    <div className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground shrink-0">Receipt</span>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />
      {url ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="size-9 rounded-lg overflow-hidden shrink-0 border border-border/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Receipt" className="size-full object-cover" />
          </button>
          <button
            type="button"
            onClick={remove}
            className="p-1.5 rounded-full text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Remove receipt"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground disabled:opacity-50"
        >
          <Camera className="size-4" />
          {uploading ? "Uploading..." : "Add receipt"}
        </button>
      )}

      {viewing && url && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center"
          onClick={() => setViewing(false)}
        >
          <button
            type="button"
            onClick={() => setViewing(false)}
            className="absolute top-[calc(1rem+var(--sat))] right-4 size-10 rounded-full bg-white/2 flex items-center justify-center text-white"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Receipt" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
