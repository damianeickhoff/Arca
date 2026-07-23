"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icon";
import { TransactionActions } from "./transaction-actions";
import { formatEur, formatDate, BUDGET_TYPE_LABELS } from "@/lib/format";
import { extractMerchantName } from "@/lib/parse-transaction-location";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import type { Category } from "@/db/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransactionMap } from "@/components/transaction-map";
import { CategoryGrid } from "@/components/category-picker";
import {
  IconArrowsLeftRight as ArrowLeftRight,
  IconChevronDownFilled as ChevronDown,
  IconChevronRight as ChevronRight,
  IconChevronUp as ChevronUp,
  IconSelector as ChevronsUpDown,
  IconRefresh as RefreshCcw,
  IconTagFilled as Tag,
  IconTrashFilled as Trash2,
  IconXFilled as X,
  IconPencil as Pencil,
  IconCheck as Check,
} from "@tabler/icons-react";
import type { TransactionSplitRow } from "@/lib/transaction-splits";

export type TransactionRow = {
  id: number;
  date: string;
  direction: string;
  type: string | null;
  amount: number;
  description: string;
  rawDescription: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  categoryBudgetType?: string | null;
  brandIcon: string | null;
  brandIconColor: string | null;
  brandIconBgColor: string | null;
  source: string | null;
  correctedAmount: number | null;
  isReimbursement: boolean;
  isManualTransfer: boolean;
  isInternalTransfer: boolean;
  transferType?: string | null;
  categoryGroup: string | null;
  bankName: string | null;
  isSplit: boolean;
  splitCount: number;
  splitSummary: string | null;
  splits: TransactionSplitRow[];
  notes: string | null;
  customName: string | null;
};

// Looser shape accepted by the detail dialog, so it can be reused from places that
// only have a subset of the row (e.g. the dashboard "Recente transacties" list).
// Flags are `boolean | number` because some come straight from SQLite as 0/1.
export type TransactionDetail = {
  id: number;
  date: string;
  direction: string;
  amount: number;
  correctedAmount?: number | null;
  description: string;
  rawDescription?: string | null;
  categoryId: number | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  brandIcon?: string | null;
  brandIconColor?: string | null;
  brandIconBgColor?: string | null;
  bankName?: string | null;
  notes?: string | null;
  isReimbursement?: boolean | number;
  isInternalTransfer?: boolean | number;
  transferType?: string | null;
  isSplit?: boolean | number;
  splitCount?: number;
  splitSummary?: string | null;
  excludeFromReports?: boolean | number;
  customName?: string | null;
};

function MidTruncate({ text, startChars = 22, endChars = 14 }: { text: string; startChars?: number; endChars?: number }) {
  if (text.length <= startChars + endChars + 3) return <>{text}</>;
  return <>{text.slice(0, startChars)}&hellip;{text.slice(-endChars)}</>;
}

type SortField = "date" | "description" | "amount" | "category" | "bank";
type SortDir = "asc" | "desc";

function renderSortIcon(field: SortField, activeSort: SortField, activeDir: SortDir) {
  if (activeSort !== field) return <ChevronsUpDown className="size-3 opacity-40" />;
  return activeDir === "asc"
    ? <ChevronUp className="size-3" />
    : <ChevronDown className="size-3" />;
}

export function TransactionList({ rows, categories, sort, dir }: { rows: TransactionRow[]; categories: Category[]; sort?: string; dir?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [detailRow, setDetailRow] = useState<TransactionRow | null>(null);

  const [undoInfo, setUndoInfo] = useState<{
    transactionId: number;
    previousCategoryId: number | null;
    newCategoryName: string;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCategorized(transactionId: number, previousCategoryId: number | null, newCategoryName: string) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoInfo({ transactionId, previousCategoryId, newCategoryName });
    undoTimerRef.current = setTimeout(() => setUndoInfo(null), 10000);
  }

  async function undoCategorize() {
    if (!undoInfo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { transactionId, previousCategoryId } = undoInfo;
    setUndoInfo(null);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: transactionId, categoryId: previousCategoryId }),
    });
    router.refresh();
  }

  const activeSort = (sort as SortField | undefined) ?? "date";
  const activeDir = dir === "asc" ? "asc" : "desc";

  function handleSort(field: SortField) {
    const newDir = activeSort === field && activeDir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", field);
    params.set("dir", newDir);
    router.push(`?${params.toString()}`);
  }

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  }

  async function bulkCategorize(categoryId: number) {
    setBulkLoading(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), categoryId }),
    });
    setBulkLoading(false);
    setSelected(new Set());
    router.refresh();
  }

  async function bulkSetReimbursement(value: boolean) {
    setBulkLoading(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), isReimbursement: value }),
    });
    setBulkLoading(false);
    setSelected(new Set());
    router.refresh();
  }

  async function bulkSetManualTransfer(value: boolean) {
    setBulkLoading(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), isManualTransfer: value }),
    });
    setBulkLoading(false);
    setSelected(new Set());
    router.refresh();
  }

  async function bulkDelete() {
    if (!confirm(`Verwijder ${selected.size} transactie(s)?`)) return;
    setBulkLoading(true);
    await fetch("/api/transactions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    setBulkLoading(false);
    setSelected(new Set());
    router.refresh();
  }

  const allSelected = selected.size === rows.length && rows.length > 0;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <>
      <div className="divide-y">
        {/* Column header */}
        <div className="hidden md:grid grid-cols-[20px_1fr_90px_180px_120px_160px_110px_40px] gap-3 px-4 py-2 text-xs text-muted-foreground font-medium items-center">
          <input
            type="checkbox"
            className="size-3.5 accent-primary cursor-pointer"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected; }}
            onChange={toggleAll}
          />
          <button onClick={() => handleSort("description")} className="flex items-center gap-1 hover:text-foreground transition-colors w-fit">
            Omschrijving {renderSortIcon("description", activeSort, activeDir)}
          </button>
          <button onClick={() => handleSort("date")} className="flex items-center gap-1 hover:text-foreground transition-colors w-fit">
            Datum {renderSortIcon("date", activeSort, activeDir)}
          </button>
          <button onClick={() => handleSort("category")} className="flex items-center gap-1 hover:text-foreground transition-colors w-fit">
            Categorie {renderSortIcon("category", activeSort, activeDir)}
          </button>
          <button onClick={() => handleSort("bank")} className="flex items-center gap-1 hover:text-foreground transition-colors w-fit">
            Bank {renderSortIcon("bank", activeSort, activeDir)}
          </button>
          <span>Notities</span>
          <button onClick={() => handleSort("amount")} className="flex items-center gap-1 hover:text-foreground transition-colors w-fit ml-auto">
            Bedrag {renderSortIcon("amount", activeSort, activeDir)}
          </button>
          <span />
        </div>

        {rows.map((t) => (
          <div
            key={t.id}
            className={`grid grid-cols-[20px_1fr_auto_auto] md:grid-cols-[20px_1fr_90px_180px_120px_160px_110px_40px] items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 ${selected.has(t.id) ? "bg-primary/5" : ""}`}
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              className="size-3.5 accent-primary cursor-pointer"
              checked={selected.has(t.id)}
              onChange={() => toggleRow(t.id)}
            />

            {/* Icon + Description — clicking opens the detail dialog */}
            <button
              type="button"
              className="flex items-center gap-2.5 min-w-0 text-left"
              onClick={() => setDetailRow(t)}
            >
              {(() => { const ic = resolveTransactionIcon(t); return <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} round size="sm" />; })()}
              <div className="min-w-0">
                <p className="font-medium truncate leading-tight">{t.description}</p>
                {t.rawDescription && t.rawDescription !== t.description && (
                  <p className="text-xs text-muted-foreground" title={t.rawDescription}>
                    <MidTruncate text={t.rawDescription} />
                  </p>
                )}
                {t.notes && (
                  <p className="md:hidden text-xs text-muted-foreground mt-0.5 italic truncate" title={t.notes}>{t.notes}</p>
                )}
              </div>
            </button>

            {/* Date */}
            <span className="hidden md:block text-xs text-muted-foreground shrink-0 leading-tight">
              {formatDate(t.date)}
            </span>

            {/* Category pill */}
            <div className="hidden md:flex items-center min-w-0">
              {t.isInternalTransfer ? (
                <span className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium bg-muted text-muted-foreground whitespace-nowrap">
                  Eigen overboeking
                </span>
              ) : t.isSplit ? (
                <div className="min-w-0">
                  <span className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium bg-muted text-muted-foreground whitespace-nowrap">
                    {t.splitCount} {t.splitCount === 1 ? "deel" : "delen"}
                  </span>
                  {t.splitSummary && (
                    <p className="text-xs text-muted-foreground truncate mt-1" title={t.splitSummary}>
                      {t.splitSummary}
                    </p>
                  )}
                </div>
              ) : t.categoryName ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium max-w-full"
                  style={{
                    backgroundColor: `${t.categoryColor ?? "#94a3b8"}1a`,
                    color: t.categoryColor ?? "#94a3b8",
                  }}
                >
                  <span className="truncate">{t.categoryName}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/40">—</span>
              )}
            </div>

            {/* Bank */}
            <div className="hidden md:block min-w-0">
              {t.bankName ? (
                <span className="text-xs text-muted-foreground truncate block">{t.bankName}</span>
              ) : (
                <span className="text-xs text-muted-foreground/40">—</span>
              )}
            </div>

            {/* Notes */}
            <div className="hidden md:block min-w-0">
              {t.notes ? (
                <span className="text-xs text-muted-foreground italic truncate block" title={t.notes}>{t.notes}</span>
              ) : (
                <span className="text-xs text-muted-foreground/40">—</span>
              )}
            </div>

            {/* Amount */}
            <div className="flex items-center justify-end gap-2">
              {t.isReimbursement ? (
                <span className="font-semibold tabular-nums text-right text-amber-600">
                  {formatEur(t.amount)}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">terugbet.</span>
                </span>
              ) : (
                <span className={`font-semibold tabular-nums text-right ${t.direction === "income" ? "text-green-600" : "text-red-600"}`}>
                  {formatEur(t.correctedAmount ?? t.amount)}
                  {t.correctedAmount != null && (
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground tabular-nums">
                      ({formatEur(t.amount)})
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end">
              <TransactionActions
                id={t.id}
                description={t.description}
                amount={t.amount}
                correctedAmount={t.correctedAmount ?? null}
                isReimbursement={t.isReimbursement}
                isManualTransfer={t.isManualTransfer}
                isInternalTransfer={t.isInternalTransfer}
                categories={categories}
                currentCategoryId={t.categoryId}
                brandIcon={t.brandIcon ?? null}
                brandIconColor={t.brandIconColor ?? null}
                brandIconBgColor={t.brandIconBgColor ?? null}
                splits={t.splits}
                notes={t.notes ?? null}
                onCategorized={(prev, name) => handleCategorized(t.id, prev, name)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Transaction detail dialog */}
      <TransactionDetailDialog
        row={detailRow}
        categories={categories}
        onClose={() => setDetailRow(null)}
        onCategorized={(prev, name) => {
          // Keep the detail dialog open — only the category picker itself closes.
          if (detailRow) handleCategorized(detailRow.id, prev, name);
        }}
      />

      {/* Undo toast */}
      {undoInfo && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 glass-surface rounded-2xl px-4 py-3 min-w-64 max-w-xs">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm">
              <span className="text-muted-foreground">Categorie: </span>
              <span className="font-medium">{undoInfo.newCategoryName}</span>
            </p>
            <button
              onClick={undoCategorize}
              className="text-sm font-semibold text-primary hover:underline shrink-0"
            >
              Ongedaan maken
            </button>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ animation: "undo-shrink 10s linear forwards" }} />
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 glass-surface rounded-2xl px-4 py-2.5">
          <span className="text-sm font-medium pr-3 border-r">
            {selected.size} geselecteerd
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={bulkLoading}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Tag className="size-3.5" />
              Categoriseer
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-52 max-h-80 overflow-y-auto">
              {categories.map((cat) => (
                <DropdownMenuItem
                  key={cat.id}
                  onClick={() => bulkCategorize(cat.id)}
                >
                  {cat.color && (
                    <span className="inline-block size-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  )}
                  {cat.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={bulkLoading}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border bg-transparent hover:bg-foreground/5 disabled:opacity-50"
            >
              Meer
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem onClick={() => bulkSetReimbursement(true)}>
                <RefreshCcw className="size-3.5 mr-2" />
                Markeer als terugbetaling
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => bulkSetReimbursement(false)}>
                <RefreshCcw className="size-3.5 mr-2" />
                Terugbetaling verwijderen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => bulkSetManualTransfer(true)}>
                <ArrowLeftRight className="size-3.5 mr-2" />
                Markeer als eigen overboeking
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => bulkSetManualTransfer(false)}>
                <ArrowLeftRight className="size-3.5 mr-2" />
                Eigen overboeking verwijderen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={bulkDelete} className="text-destructive">
                <Trash2 className="size-3.5 mr-2" />
                Verwijder {selected.size} transactie(s)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => setSelected(new Set())}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground ml-1"
            title="Wis selectie"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}

// ─── Transaction Detail Dialog ──────────────────────────────────────────────

// Always-mounted, controlled wrapper. Keeping the <Dialog> (which becomes a vaul
// bottom-sheet on mobile) mounted and toggling `open` is what makes it animate in —
// conditionally mounting it already-open never opens the mobile sheet. The inner body
// is keyed by row id so its category state resets per transaction, and a "last row"
// keeps content visible through the close animation.
export function TransactionDetailDialog({
  row,
  categories,
  onClose,
  onCategorized,
}: {
  row: TransactionDetail | null;
  categories: Category[];
  onClose: () => void;
  onCategorized: (previousCategoryId: number | null, newCategoryName: string) => void;
}) {
  const lastRowRef = useRef<TransactionDetail | null>(null);
  if (row) lastRowRef.current = row;
  const shown = row ?? lastRowRef.current;

  return (
    <Dialog open={row != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogTitle className="sr-only">Transactie details</DialogTitle>
        {shown && (
          <TransactionDetailBody
            key={shown.id}
            row={shown}
            categories={categories}
            onCategorized={onCategorized}
          />
        )}
      </DialogContent>

    </Dialog>
  );
}

type MerchantStat = { total: number; count: number; transactions: { id: number; date: string; description: string; amount: number; correctedAmount: number | null; direction: string; isReimbursement: boolean }[] };

function TransactionDetailBody({
  row,
  categories,
  onCategorized,
}: {
  row: TransactionDetail;
  categories: Category[];
  onCategorized: (previousCategoryId: number | null, newCategoryName: string) => void;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string | null>(row.categoryId != null ? String(row.categoryId) : null);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [excluded, setExcluded] = useState(!!row.excludeFromReports);
  const [merchantStats, setMerchantStats] = useState<MerchantStat | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  type BulkPrompt = { newCatId: number | null; newCatName: string; matchPattern: string; matchType: "contains" | "exact" };
  const [bulkPrompt, setBulkPrompt] = useState<BulkPrompt | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(row.customName ?? "");

  const currentCat = categories.find((c) => c.id === parseInt(categoryId ?? ""));
  const merchantPattern = guessMerchant(row.description);

  useEffect(() => {
    if (!merchantPattern || merchantPattern.length < 2) return;
    const dir = row.direction === "income" ? "income" : "expense";
    fetch(`/api/merchant-stats?q=${encodeURIComponent(merchantPattern)}&direction=${dir}`)
      .then((r) => r.json())
      .then(setMerchantStats)
      .catch(() => {});
  }, [row.id]);

  async function saveCustomName(name: string) {
    const trimmed = name.trim();
    setEditingName(false);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, customName: trimmed || null }),
    });
    router.refresh();
  }

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

  async function applyCategory(value: string) {
    const newCatId = value ? parseInt(value, 10) : null;
    const newCatName = categories.find((c) => c.id === newCatId)?.name ?? "Geen categorie";
    setSaving(true);
    setCategoryId(value || null);
    setShowPicker(false);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, categoryId: newCatId }),
    });
    setSaving(false);
    onCategorized(row.categoryId, newCatName);
    setBulkPrompt({ newCatId, newCatName, matchPattern: merchantPattern, matchType: "contains" });
  }

  async function applyBulk() {
    if (!bulkPrompt) return;
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: bulkPrompt.matchPattern, categoryId: bulkPrompt.newCatId, matchType: bulkPrompt.matchType }),
    });
    if (bulkPrompt.newCatId !== null) {
      await fetch("/api/category-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: bulkPrompt.newCatId,
          namePattern: bulkPrompt.matchPattern,
          nameWildcard: bulkPrompt.matchType === "contains",
          nameWholeWord: false,
          amount: null,
          direction: null,
          bankId: null,
        }),
      });
      await fetch("/api/apply-rules", { method: "POST" });
    }
    setBulkPrompt(null);
    router.refresh();
  }

  const isExpense = row.direction === "expense";
  const displayAmount = row.correctedAmount ?? row.amount;

  return (
    <>
      <div className="space-y-4">
        {/* Hero: centered icon + name + amount + date */}
        <div className="flex flex-col items-center text-center gap-1 pt-2 pb-2">
          {(() => {
            const ic = resolveTransactionIcon({
              ...row,
              categoryIcon: currentCat?.icon ?? row.categoryIcon,
              categoryColor: currentCat?.color ?? row.categoryColor,
            });
            return <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} round size="xxl" />;
          })()}
          {editingName ? (
            <div className="flex items-center gap-2 mt-3 px-4 w-full">
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCustomName(nameInput);
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="flex-1 text-center font-semibold text-lg bg-foreground/5 rounded-lg px-3 py-1 outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button type="button" onClick={() => saveCustomName(nameInput)} className="shrink-0 text-primary cursor-pointer">
                <Check className="size-5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setNameInput(row.customName ?? row.description); setEditingName(true); }}
              className="group flex items-center gap-1.5 mt-3 px-4 cursor-pointer"
            >
              <span className="font-semibold text-lg leading-snug">{row.customName ?? row.description}</span>
              <Pencil className="size-3.5 text-foreground/30 shrink-0 group-hover:text-foreground/60 transition-colors" />
            </button>
          )}
          <p className={cn(
            "text-3xl font-bold tabular-nums mt-1",
            row.isReimbursement ? "text-amber-600" : isExpense ? "text-foreground" : "text-green-500 dark:text-emerald-400"
          )}>
            {formatEur(displayAmount)}
          </p>
          <p className="text-sm text-foreground/50 mt-1">{formatDate(row.date)}</p>
        </div>

        {/* Raw description */}
        {row.rawDescription && row.rawDescription !== row.description && (
          <p className="text-xs text-muted-foreground break-all text-center">
            {row.rawDescription}
          </p>
        )}

        {/* Map */}
        {!row.isInternalTransfer && (
          <TransactionMap name={row.rawDescription || row.description} />
        )}

        {/* Merchant summary — total + history button (only when >1 matching transaction) */}
        {merchantStats && merchantStats.count > 1 && (
          <div className="rounded-xl bg-foreground/[0.04] px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{isExpense ? "Totaal uitgegeven" : "Totaal inkomen"}</p>
              <p className="font-semibold tabular-nums text-sm mt-0.5">
                {formatEur(merchantStats.total)}
                <span className="text-muted-foreground font-normal ml-1">({merchantStats.count}×)</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1 text-sm text-primary font-medium shrink-0"
            >
              Alle transacties
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}

        {/* Details grid */}
        <div className="rounded-xl bg-foreground/[0.04] divide-y divide-foreground/5 text-sm">
          {row.bankName && <DetailRow label="Rekening" value={row.bankName} />}

          {/* Category — tappable, opens picker dialog */}
          {!row.isInternalTransfer && (
            <>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm active:bg-foreground/[0.04] transition-colors"
                onClick={() => !row.isSplit && setShowPicker(true)}
                disabled={!!row.isSplit}
              >
                <span className="text-muted-foreground shrink-0">Categorie</span>
                <div className="flex items-center gap-1.5">
                  {currentCat ? (
                    <>
                      <Icon iconKey={currentCat.icon} color={currentCat.color} size="xs" round />
                      <span className="font-medium">{currentCat.name}</span>
                    </>
                  ) : (
                    <span className="font-medium text-muted-foreground/50">Geen categorie</span>
                  )}
                  {!row.isSplit && (
                    <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                </div>
              </button>

              <Dialog open={showPicker && !row.isSplit} onOpenChange={(v) => !v && setShowPicker(false)}>
                <DialogContent className="sm:max-w-sm" overlayClassName="z-[65] backdrop-blur-lg bg-foreground/20">
                  <DialogTitle>Categorie kiezen</DialogTitle>
                  <CategoryGrid
                    categories={categories}
                    current={categoryId ?? undefined}
                    isFormMode={true}
                    onChange={(v) => applyCategory(v === "none" ? "" : v)}
                    onClose={() => setShowPicker(false)}
                  />
                  {saving && <p className="text-xs text-muted-foreground text-center -mt-1">Opslaan...</p>}
                </DialogContent>
              </Dialog>
            </>
          )}

          {/* Budget type */}
          {currentCat?.budgetType && (
            <DetailRow label="Budgettype" value={BUDGET_TYPE_LABELS[currentCat.budgetType] ?? currentCat.budgetType} />
          )}

          {!!row.isInternalTransfer && <DetailRow label="Type" value="Eigen overboeking" />}
          {!!row.isReimbursement && <DetailRow label="Type" value="Terugbetaling" />}
          {row.correctedAmount != null && (
            <DetailRow label="Origineel bedrag" value={formatEur(row.amount)} />
          )}
          {row.notes && <DetailRow label="Notitie" value={row.notes} />}

          {/* Exclude from reports toggle */}
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm active:bg-foreground/[0.04] transition-colors"
            onClick={toggleExcluded}
          >
            <span className="text-muted-foreground">Niet in rapporten</span>
            <div className={cn(
              "relative w-11 h-6 rounded-full transition-colors shrink-0",
              excluded ? "bg-primary" : "bg-foreground/20"
            )}>
              <div className={cn(
                "absolute top-0.5 size-5 bg-white rounded-full shadow-sm transition-transform",
                excluded ? "translate-x-[22px]" : "translate-x-0.5"
              )} />
            </div>
          </button>
        </div>

        {/* Split summary */}
        {!!row.isSplit && row.splitSummary && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Split ({row.splitCount} delen)</p>
            <p className="text-xs text-muted-foreground">{row.splitSummary}</p>
          </div>
        )}
      </div>

      {/* Merchant history dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent>
          <DialogTitle className="sr-only">{merchantPattern} transacties</DialogTitle>
          {merchantStats && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex flex-col items-center text-center gap-1 pt-2 pb-2">
                {(() => {
                  const ic = resolveTransactionIcon({
                    ...row,
                    categoryIcon: currentCat?.icon ?? row.categoryIcon,
                    categoryColor: currentCat?.color ?? row.categoryColor,
                  });
                  return <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} round size="xxl" />;
                })()}
                <p className="font-semibold text-lg mt-2">{merchantPattern}</p>
                <p className="text-2xl font-bold tabular-nums mt-0.5">{formatEur(merchantStats.total)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{merchantStats.count} transacties in totaal</p>
              </div>

              {/* Transactions grouped by date */}
              {(() => {
                const byDate = new Map<string, typeof merchantStats.transactions>();
                for (const t of merchantStats.transactions) {
                  const arr = byDate.get(t.date) ?? [];
                  arr.push(t);
                  byDate.set(t.date, arr);
                }
                return Array.from(byDate.entries()).map(([date, txs]) => (
                  <div key={date}>
                    <p className="text-xs font-medium text-foreground/50 uppercase tracking-wide mb-2">
                      {formatDate(date)}
                    </p>
                    <div className="rounded-xl bg-foreground/[0.04] divide-y divide-foreground/5">
                      {txs.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <span className="truncate text-foreground/80 flex-1 min-w-0">{t.description}</span>
                          <span className={cn(
                            "tabular-nums font-medium shrink-0",
                            t.isReimbursement ? "text-amber-600" : t.direction === "income" ? "text-green-500" : "text-foreground"
                          )}>
                            {formatEur(t.correctedAmount ?? t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk-categorize dialog */}
      <Dialog open={!!bulkPrompt} onOpenChange={(v) => !v && (setBulkPrompt(null), router.refresh())}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ook toepassen op andere transacties?</DialogTitle>
            <DialogDescription>
              Wijs <strong>{bulkPrompt?.newCatName}</strong> toe aan alle transacties die overeenkomen met:
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
                    {t === "contains" ? "Naam bevat" : "Exacte naam"}
                  </button>
                ))}
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
