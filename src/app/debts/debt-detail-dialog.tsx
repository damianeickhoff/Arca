"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  IconPencil as Pencil,
  IconTrashFilled as Trash2,
  IconChevronDown as ChevronDown,
} from "@tabler/icons-react";
import type { RecurringItem } from "@/db/schema";
import { fmtLongMonth, fmtShortMonth, debtPaidPct, computeDebtPayoffSchedule } from "./debt-shared";
import type { ComputedDebt } from "./debt-shared";
import { DebtEditDialog } from "./debt-edit-dialog";

// Detail view for a single debt — same visual language as the recurring-item detail
// dialog (accent wash, pencil/trash header actions, rounded-2xl info rows). The pencil
// button opens DebtEditDialog nested inside this one (same stacking pattern as the
// recurring-item detail dialog), rather than navigating to a routed subpage.
export function DebtDetailDialog({
  computed,
  bills,
  onClose,
}: {
  computed: ComputedDebt | null;
  bills: RecurringItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Keep rendering the last-open debt's content while the sheet animates closed —
  // the caller nulls `computed` the instant it starts closing (see onClose), and
  // without this the body unmounts synchronously, collapsing the sheet's height
  // before the slide-down transition finishes.
  const [cached, setCached] = useState(computed);
  useEffect(() => {
    if (computed) setCached(computed);
  }, [computed]);
  const displayComputed = computed ?? cached;

  // Bump on every closed→open transition so DetailBody remounts fresh each time the
  // sheet opens (even for the same debt) — otherwise the "Upcoming payments" section's
  // expand/collapse state would carry over from the previous time it was opened.
  const isOpen = computed != null;
  const [openInstance, setOpenInstance] = useState(0);
  useEffect(() => {
    if (isOpen) setOpenInstance((n) => n + 1);
  }, [isOpen]);

  async function remove() {
    if (!computed) return;
    if (!confirm(`Delete debt "${computed.debt.name}"?`)) return;
    setDeleting(true);
    await fetch("/api/debts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: computed.debt.id }),
    });
    setDeleting(false);
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={computed != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        accentColor={displayComputed?.debt.color ?? null}
        scrollBlur
        headerAction={
          displayComputed ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Edit"
                className="size-11 rounded-full bg-white/7 backdrop-blur-lg flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
              >
                <Pencil className="size-4.5" />
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                aria-label="Delete"
                className="size-11 rounded-full bg-white/7 backdrop-blur-lg flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
              >
                <Trash2 className="size-4.5" />
              </button>
            </div>
          ) : undefined
        }
      >
        <DialogTitle className="sr-only">Debt details</DialogTitle>
        {displayComputed && <DetailBody key={`${displayComputed.debt.id}-${openInstance}`} computed={displayComputed} />}

        {/* Edit dialog — controlled by the pencil button. Rendered INSIDE this dialog's
            content so it's a nested sheet: closing it returns here instead of tearing
            down the detail dialog too. */}
        {displayComputed && (
          <DebtEditDialog
            debt={displayComputed.debt}
            bills={bills}
            currentRecurringIds={displayComputed.linkedBillIds}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ computed }: { computed: ComputedDebt }) {
  const { debt, linkedBills, amountPaid, currentBalance, debtFreeDate } = computed;
  const isOwed = debt.direction === "owed";
  const paidPct = Math.round(debtPaidPct(debt, amountPaid, currentBalance));
  const isDone = currentBalance === 0;
  const schedule = computeDebtPayoffSchedule(debt, currentBalance);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative -mx-6 mt-15 mb-15 -mt-2 lg:-mx-7 lg:-mt-7 px-6 lg:px-7 pt-2 lg:pt-7">
        <div className="flex flex-col items-center text-center gap-1 pb-1">
          <Icon iconKey={debt.icon ?? linkedBills[0]?.icon ?? null} color={debt.color} round size="xxl" />
          <p className="text-3xl font-bold tabular-nums mt-3">{formatEur(currentBalance)}</p>
          <div className="flex items-center gap-2 mt-1.5 text-sm text-foreground/55">
            <span>{isOwed ? "I am owed" : "I owe"}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", isDone ? "bg-emerald-400" : "bg-foreground/30")} />
              {isDone ? (isOwed ? "Settled" : "Paid off") : `${paidPct}% ${isOwed ? "received" : "paid"}`}
            </span>
          </div>
        </div>
      </div>

      {/* Key figures */}
      <div className="rounded-xl bg-[#292a2d]/35 backdrop-blur-xs">
        {debt.originalAmount != null && debt.originalAmount > debt.startingBalance ? (
          <>
            <DetailRow label="Original amount" value={formatEur(debt.originalAmount)} />
            <DetailRow label={isOwed ? "Already received" : "Already paid"} value={formatEur(debt.originalAmount - currentBalance)} />
            <DetailRow label="Remaining" value={formatEur(currentBalance)} />
          </>
        ) : (
          <DetailRow label="Starting balance" value={formatEur(debt.startingBalance)} />
        )}
        <DetailRow label="Minimum monthly payment" value={formatEur(debt.minimumPayment)} />
        <DetailRow label="Start month" value={fmtLongMonth(new Date(`${debt.startMonth}-01T00:00:00`))} />
        {debtFreeDate && !isDone && <DetailRow label={isOwed ? "Received by" : "Debt-free by"} value={fmtLongMonth(debtFreeDate)} />}
      </div>

      {debt.notes && (
        <div className="rounded-2xl bg-[#292a2d]/35 backdrop-blur-xs">
          <DetailRow label="Notes" value={debt.notes} />
        </div>
      )}

      {/* Upcoming payments — one per month until payoff, last one prorated to
          whatever balance actually remains rather than always the full minimum. */}
      {schedule.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setScheduleOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 mb-2"
          >
            <span className="text-sm font-medium text-foreground/45">Upcoming payments</span>
            <ChevronDown className={cn("size-4 text-foreground/40 transition-transform", scheduleOpen && "rotate-180")} />
          </button>
          {scheduleOpen && (
            <div className="rounded-xl bg-[#292a2d]/35 backdrop-blur-xs divide-y divide-border/50">
              {schedule.map((entry, i) => (
                <DetailRow key={i} label={fmtShortMonth(entry.date)} value={formatEur(entry.amount)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Linked recurring bills */}
      {linkedBills.length > 0 && (
        <div>
          <div className="px-3 mb-2">
            <span className="text-sm font-medium text-foreground/45">Linked recurring bills</span>
          </div>
          <div className="space-y-2">
            {linkedBills.map((bill: RecurringItem) => (
              <div key={bill.id} className="flex items-center gap-3 rounded-2xl bg-[#292a2d]/35 px-4 py-3">
                <Icon iconKey={bill.icon} color={bill.iconColor} size="lg" round />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate leading-tight">{bill.name}</p>
                </div>
                {bill.amount != null && (
                  <span className="tabular-nums font-normal text-sm shrink-0">{formatEur(bill.amount)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <span className="flex items-center gap-1.5 font-light text-right min-w-0">
        <span className="truncate text-sm">{value}</span>
      </span>
    </div>
  );
}
