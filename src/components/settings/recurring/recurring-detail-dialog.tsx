"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { RecurringClient } from "./recurring-client";
import { TransactionDetailDialog } from "@/app/transactions/transaction-detail-dialog";
import { formatEur } from "@/lib/format";
import { UNCATEGORIZED_ICON, UNCATEGORIZED_COLOR } from "@/lib/auto-brand";
import { cn } from "@/lib/utils";
import {
  IconPencilFilled as Pencil,
  IconTrashFilled as Trash2,
  IconPlayerPauseFilled as Pause,
  IconPlayerPlayFilled as Play,
} from "@tabler/icons-react";
import type { RecurringItem, Category } from "@/db/schema";
import type { TransactionDetail } from "@/app/transactions/transaction-types";

const FREQ_LABELS: Record<string, string> = { monthly: "Monthly", yearly: "Yearly", weekly: "Weekly", once: "One-time", quarterly: "Per quarter" };
const FREQ_LETTER: Record<string, string> = { monthly: "M", yearly: "Y", weekly: "W", once: "1", quarterly: "Q" };
const TYPE_LABELS: Record<string, string> = { income: "Income", bill: "Bill", subscription: "Subscription", debt: "Debt", savings: "Savings" };
const BUDGET_TYPE_LABELS: Record<string, string> = { nodig: "Needs", willen: "Wants", sparen: "Savings" };

// Linked-transaction row: the full TransactionDetail shape plus the couple of fields
// only this list needs (bankName, account) — so a row can be tapped to open the same
// TransactionDetailDialog used everywhere else in the app.
type LinkedTx = TransactionDetail & {
  account: string | null;
  bankName: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function relativeLabel(iso: string) {
  const today = new Date();
  const d = new Date(iso + "T00:00:00");
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return fmtDate(iso);
}

export function RecurringDetailDialog({
  item,
  category,
  categories,
  dueDate,
  onClose,
}: {
  item: RecurringItem | null;
  category?: Category | null;
  categories: Category[];
  dueDate?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!item) return;
    if (!confirm(`Delete "${item.name}"?`)) return;
    setDeleting(true);
    await fetch("/api/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    setDeleting(false);
    onClose();
    router.refresh();
  }

  return (
    <>
      <Dialog open={item != null} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent
          accentColor={category?.color ?? null}
          scrollBlur
          headerAction={
            item ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  aria-label="Edit"
                  className="size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-lg flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
                >
                  <Pencil className="size-4.5" />
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting}
                  aria-label="Delete"
                  className="size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-lg flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
                >
                  <Trash2 className="size-4.5" />
                </button>
              </div>
            ) : undefined
          }
        >
          <DialogTitle className="sr-only">Recurrence details</DialogTitle>
          {item && <DetailBody key={item.id} item={item} category={category} categories={categories} dueDate={dueDate} />}

          {/* Edit dialog — controlled by the pencil button. Rendered INSIDE this dialog's
              content so it's a nested sheet: closing it returns here instead of tearing
              down the detail dialog too. */}
          {item && <RecurringClient action="edit" item={item} open={editOpen} onOpenChange={setEditOpen} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailBody({
  item,
  category,
  categories,
  dueDate,
}: {
  item: RecurringItem;
  category?: Category | null;
  categories: Category[];
  dueDate?: string | null;
}) {
  const router = useRouter();
  const [active, setActive] = useState(item.active);
  const [busy, setBusy] = useState(false);
  const [txs, setTxs] = useState<LinkedTx[] | null>(null);
  const [selectedTx, setSelectedTx] = useState<LinkedTx | null>(null);

  // This component isn't remounted when just the active flag changes (item.id, the
  // key it's rendered with, stays the same), so without this, saving "active" from
  // the edit form (rather than the pause button below, which sets local state itself)
  // would only show up here after the dialog is closed and reopened. Adjusting state
  // during render (React's documented pattern for this) instead of in an effect,
  // so this doesn't trigger an extra render pass.
  const [prevItemActive, setPrevItemActive] = useState(item.active);
  if (item.active !== prevItemActive) {
    setPrevItemActive(item.active);
    setActive(item.active);
  }

  // Load linked transactions once for this item (component is keyed by item.id).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/recurring/transactions?itemId=${item.id}`)
      .then((r) => r.json())
      .then((rows: LinkedTx[]) => { if (!cancelled) setTxs(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setTxs([]); });
    return () => { cancelled = true; };
  }, [item.id]);

  async function togglePause() {
    const next = !active;
    setActive(next);
    setBusy(true);
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, active: next }),
    });
    setBusy(false);
    router.refresh();
  }

  const iconKey = category?.icon ?? UNCATEGORIZED_ICON;
  const iconColor = category?.icon ? category.color : UNCATEGORIZED_COLOR;
  const freq = item.frequency;
  // Prefer the friendly bank name over the raw account number/IBAN.
  const derivedAccount = txs?.find((t) => t.bankName || t.account);
  const derivedAccountLabel = derivedAccount?.bankName ?? derivedAccount?.account ?? null;

  const groups: { label: string; total: number; rows: LinkedTx[] }[] = [];
  for (const t of txs ?? []) {
    const label = relativeLabel(t.date);
    let g = groups.find((x) => x.label === label);
    if (!g) { g = { label, total: 0, rows: [] }; groups.push(g); }
    g.rows.push(t);
    g.total += t.correctedAmount ?? t.amount;
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="relative -mx-6 -mt-2 lg:-mx-7 lg:-mt-7 px-6 lg:px-7 pt-2 lg:pt-7">
        <div className="flex flex-col items-center text-center gap-1 pb-1">
          <Icon iconKey={iconKey} color={iconColor} round size="xxl" />
          <p className="text-3xl font-bold tabular-nums mt-3">{item.amount != null ? formatEur(item.amount) : "—"}</p>
          <div className="flex items-center gap-2 mt-1.5 text-sm text-foreground/55">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-5 rounded bg-foreground/10 text-xs font-extralight flex items-center justify-center">{FREQ_LETTER[freq] ?? "•"}</span>
              {FREQ_LABELS[freq] ?? freq}
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", active ? "bg-emerald-500" : "bg-foreground/30")} />
              {active ? "Active" : "Paused"}
            </span>
          </div>
        </div>
      </div>

      {/* Category */}
      <div className="rounded-2xl bg-[var(--dialog-content-background)] backdrop-blur-xs">
        <DetailRow label="Category" valueIcon={<Icon iconKey={iconKey} color={iconColor} size="xs" round />} value={category?.name ?? "Uncategorized"} />
      </div>

      {/* Account (derived from a linked transaction) */}
      {derivedAccountLabel && (
        <div className="rounded-2xl bg-[var(--dialog-content-background)] backdrop-blur-xs">
          <DetailRow label="Account" value={derivedAccountLabel} />
        </div>
      )}

      {/* Type + budget type */}
      <div className="rounded-2xl bg-[var(--dialog-content-background)] backdrop-blur-xs">
        <DetailRow label="Type" value={TYPE_LABELS[item.type] ?? item.type} />
        {item.budgetType && <DetailRow label="Budget type" value={BUDGET_TYPE_LABELS[item.budgetType] ?? item.budgetType} />}
      </div>

      {/* Dates + notes */}
      {(item.dueDay != null || dueDate || item.endDate || item.notes) && (
        <div className="rounded-2xl bg-[var(--dialog-content-background)] backdrop-blur-xs">
          {item.dueDay != null && <DetailRow label="Due day" value={`Day ${item.dueDay}`} />}
          {dueDate && <DetailRow label="Next transaction" value={fmtDate(dueDate)} />}
          {item.endDate && <DetailRow label="End date" value={fmtDate(item.endDate)} />}
          {item.notes && <DetailRow label="Notes" value={item.notes} />}
        </div>
      )}

      {/* Linked transactions */}
      {txs === null ? (
        <p className="text-center text-sm text-foreground/40 py-4">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-center text-sm text-foreground/40 py-4">No linked transactions yet</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-sm font-medium text-foreground/45">{g.label}</span>
                <span className="text-xs text-foreground/45 tabular-nums">{formatEur(g.total)}</span>
              </div>
              <div className="space-y-2">
                {g.rows.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTx(t)}
                    className="w-full flex items-center gap-3 rounded-2xl bg-[var(--dialog-content-background)] px-4 py-3 text-left active:bg-foreground/[0.04] transition-colors"
                  >
                    <Icon iconKey={iconKey} color={iconColor} size="lg" round />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate leading-tight">{item.friendlyName || item.name}</p>
                      {(t.bankName || t.account) && <p className="text-sm text-foreground/50 truncate mt-0.5">{t.bankName ?? t.account}</p>}
                    </div>
                    <span className="tabular-nums font-normal text-sm shrink-0">{formatEur(t.correctedAmount ?? t.amount)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clears the fixed pause/resume button below (h-12 + its bottom offset) so it
          doesn't float on top of the last linked-transaction row. */}
      <div className="h-16" aria-hidden />

      {/* Pause / resume */}

        <button
          type="button"
          onClick={togglePause}
          disabled={busy}
          className="fixed bottom-[calc(1.5rem+var(--sab))] left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-foreground/8 backdrop-blur-lg px-6 h-12 text-sm font-medium text-foreground active:scale-[0.97] transition-transform disabled:opacity-50 z-50"
        >
          {active ? <Pause className="size-4" /> : <Play className="size-4" />}
          {active ? "Pause the recurrence" : "Resume the recurrence"}
        </button>

      <TransactionDetailDialog
        row={selectedTx}
        categories={categories}
        onClose={() => setSelectedTx(null)}
        onCategorized={() => router.refresh()}
      />
    </div>
  );
}

function DetailRow({ label, value, valueIcon }: { label: string; value: string; valueIcon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <span className="flex items-center gap-1.5 font-light text-right min-w-0">
        {valueIcon}
        <span className="truncate text-sm">{value}</span>
      </span>
    </div>
  );
}
