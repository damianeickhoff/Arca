"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon, parseImgKey } from "@/components/icon";
import { formatEur, formatDate, BUDGET_TYPE_LABELS } from "@/lib/format";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { getMatchedTransactionInfoFields } from "@/lib/transaction-info-fields";
import { getDominantImageColor } from "@/lib/dominant-color";
import type { Category, Goal } from "@/db/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransactionMap } from "@/components/transaction-map";
import { CategoryGrid, useCategoryFilter } from "@/components/category-picker";
import { OptionDropdown } from "@/components/option-dropdown";
import { TRANSFER_TYPES } from "@/lib/transfer-types";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  IconTrashFilled as Trash2,
  IconXFilled as X,
  IconCameraFilled as Camera,
  IconMessageFilled as MessageSquare,
} from "@tabler/icons-react";
import type { TransactionDetail } from "./transaction-types";

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
}: {
  row: TransactionDetail | null;
  categories: Category[];
  savingsGoals?: Goal[];
  onClose: () => void;
  onCategorized: (previousCategoryId: number | null, newCategoryName: string, newCategoryId: number | null) => void;
}) {
  const router = useRouter();
  const lastRowRef = useRef<TransactionDetail | null>(null);
  if (row) lastRowRef.current = row;
  const shown = row ?? lastRowRef.current;
  const [washColor, setWashColor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    <Dialog open={row != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        accentColor={washColor}
        headerAction={
          shown ? (
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              aria-label="Delete"
              className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
            >
              <Trash2 className="size-4.5" />
            </button>
          ) : undefined
        }
      >
        <DialogTitle className="sr-only">Transaction details</DialogTitle>
        {shown && (
          <TransactionDetailBody
            key={shown.id}
            row={shown}
            categories={categories}
            savingsGoals={savingsGoals}
            onCategorized={onCategorized}
            onWashColor={setWashColor}
          />
        )}
      </DialogContent>

    </Dialog>
  );
}

function TransactionDetailBody({
  row,
  categories,
  savingsGoals,
  onCategorized,
  onWashColor,
}: {
  row: TransactionDetail;
  categories: Category[];
  savingsGoals: Goal[];
  onCategorized: (previousCategoryId: number | null, newCategoryName: string, newCategoryId: number | null) => void;
  onWashColor: (color: string | null) => void;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string | null>(row.categoryId != null ? String(row.categoryId) : null);
  const [goalId, setGoalId] = useState<number | null>(row.goalId ?? null);
  const [goalSaving, setGoalSaving] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const isMobile = useIsMobile();
  const { budgetType, showSubcategories, filterMenu } = useCategoryFilter({
    triggerClassName: isMobile ? "size-11 rounded-full bg-white/80 shadow-lg text-foreground" : undefined,
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
  const [notes, setNotes] = useState<string | null>(row.notes ?? null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteValue, setNoteValue] = useState(row.notes ?? "");
  const [noteSaving, setNoteSaving] = useState(false);

  // Hide the mobile bottom nav while the category picker sheet is open.
  useEffect(() => {
    if (!showPicker) return;
    return acquireNavHidden();
  }, [showPicker]);

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
            <Icon iconKey={detailIcon.iconKey} color={detailIcon.color} background={detailIconBg} initials={detailIcon.initials} round size="xxl" />
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
          <div className="rounded-xl bg-white/2 backdrop-blur-xs text-sm py-2">
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
          <div className="rounded-full bg-[var(--dialog-content-background)] backdrop-blur-xs text-sm py-2">
          {!row.isInternalTransfer && (
            <>
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

              <Dialog open={showPicker && !row.isSplit} onOpenChange={(v) => !v && setShowPicker(false)}>
                <DialogContent
                  className="sm:max-w-sm"
                  overlayClassName="z-[65] backdrop-blur-lg bg-foreground/20"
                  fullHeight
                  hideHandle
                  headerAction={isMobile ? filterMenu : undefined}
                  title={isMobile ? "Category" : undefined}
                >
                  {!isMobile && (
                    <DialogHeader actions={filterMenu}>
                      <DialogTitle>Category</DialogTitle>
                    </DialogHeader>
                  )}
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
          </div>
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

          {/* Linked recurring expense — set when this transaction matched a recurring
              item's pattern (see src/lib/recurring-match.ts). Shown for any linked
              transaction, preferring the item's friendly name. */}
          {row.recurringItemId != null && (
            <DetailRow label="Recurring" value={row.recurringFriendlyName || row.recurringName || "Recurring"} />
          )}

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
                <DialogContent className="sm:max-w-sm" overlayClassName="z-[65] backdrop-blur-lg bg-foreground/20">
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
        <DialogContent className="sm:max-w-sm" overlayClassName="z-[65] backdrop-blur-lg bg-foreground/20">
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
        <DialogContent className="sm:max-w-sm">
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
