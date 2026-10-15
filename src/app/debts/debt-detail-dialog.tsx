"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/ui/category-icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  IconPencilFilled as Pencil,
  IconTrashFilled as Trash2,
  IconChevronDown as ChevronDown,
} from "@tabler/icons-react";
import type { RecurringItem } from "@/db/schema";
import { debtPaidPct, computeDebtPayoffSchedule, debtBalanceDate } from "./debt-shared";
import type { ComputedDebt } from "./debt-shared";
import { DebtEditDialog } from "./debt-edit-dialog";
import { RecurringDetailDialog } from "@/components/settings/recurring/recurring-detail-dialog";
import type { Category } from "@/db/schema";

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
  const t = useTranslations("plan.debts.sheet");
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Keep rendering the last-open debt's content while the sheet animates closed —
  // the caller nulls `computed` the instant it starts closing (see onClose), and
  // without this the body unmounts synchronously, collapsing the sheet's height
  // before the slide-down transition finishes.
  const [cached, setCached] = useState(computed);
  if (computed && computed !== cached) setCached(computed);
  const displayComputed = computed ?? cached;

  // Bump on every closed→open transition so DetailBody remounts fresh each time the
  // sheet opens (even for the same debt) — otherwise the "Upcoming payments" section's
  // expand/collapse state would carry over from the previous time it was opened.
  const isOpen = computed != null;
  const [openInstance, setOpenInstance] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setOpenInstance((n) => n + 1);
  }

  async function remove() {
    if (!computed) return;
    if (!confirm(t("confirmDelete", { name: computed.debt.name }))) return;
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
                aria-label={t("edit")}
                className="size-10 rounded-full border border-line bg-surface flex items-center justify-center text-ink hover:bg-surface-2 active:scale-[0.95] transition-transform"
              >
                <Pencil className="size-4.5" />
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                aria-label={t("delete")}
                className="size-10 rounded-full border border-line bg-surface flex items-center justify-center text-ink hover:bg-surface-2 active:scale-[0.95] transition-transform"
              >
                <Trash2 className="size-4.5" />
              </button>
            </div>
          ) : undefined
        }
      >
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
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
  const t = useTranslations("plan.debts.sheet");
  const locale = useLocale();
  const longDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
  const shortMonth = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  const { debt, linkedBills, amountPaid, currentBalance, lastPaymentDate, neverPaysOff, remainingInterest, lastRecordedMonth } = computed;
  const isOwed = debt.direction === "owed";
  const paidPct = Math.round(debtPaidPct(debt, amountPaid, currentBalance));
  const isDone = currentBalance === 0;
  const schedule = computeDebtPayoffSchedule(debt, currentBalance, lastRecordedMonth);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const startDate = debt.startDate ?? `${debt.startMonth}-01`;

  // Categories power the recurring-bill detail dialog opened when a linked bill is tapped.
  const [cats, setCats] = useState<Category[]>([]);
  const [detailBillId, setDetailBillId] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((c) => setCats(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);
  const detailBill = detailBillId != null ? linkedBills.find((b) => b.id === detailBillId) ?? null : null;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="flex flex-col items-center gap-1 pb-1 pt-2 text-center">
        <CategoryIcon icon={debt.icon ?? linkedBills[0]?.icon ?? null} color={debt.color} size="lg" />
        <p className="amount mt-3 text-[32px] leading-none tabular-nums text-ink">{formatEur(currentBalance)}</p>
        <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
          <span>{isOwed ? t("owed") : t("owe")}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", isDone ? "bg-positive" : "bg-ink-3")} />
            {isDone ? (isOwed ? t("settled") : t("paidOff")) : isOwed ? t("pctReceived", { pct: paidPct }) : t("pctPaid", { pct: paidPct })}
          </span>
        </div>
      </div>

      {/* Key figures */}
      <div className="divide-y divide-line rounded-card border border-line bg-surface">
        {debt.originalAmount != null && debt.originalAmount > debt.startingBalance ? (
          <>
            <DetailRow label={t("original")} value={formatEur(debt.originalAmount)} />
            <DetailRow label={isOwed ? t("alreadyReceived") : t("alreadyPaid")} value={formatEur(debt.originalAmount - currentBalance)} />
            <DetailRow label={t("remaining")} value={formatEur(currentBalance)} />
          </>
        ) : (
          <DetailRow label={t("startingBalance")} value={formatEur(debt.startingBalance)} />
        )}
        <DetailRow label={t("minimum")} value={formatEur(debt.minimumPayment)} />
        {debt.interestRate != null && debt.interestRate > 0 && (
          <>
            <DetailRow label={t("rate")} value={t("perYear", { rate: debt.interestRate.toLocaleString(locale) })} />
            {remainingInterest > 0 && (
              <DetailRow label={isOwed ? t("interestToReceive") : t("interestToPay")} value={formatEur(remainingInterest)} />
            )}
          </>
        )}
        <DetailRow label={t("startDate")} value={longDate.format(new Date(`${startDate}T12:00:00`))} />
        {/* Only worth a row when it differs from the start date — it's the date the figures key off. */}
        {debtBalanceDate(debt) !== startDate && (
          <DetailRow label={t("balanceAsOf")} value={longDate.format(new Date(`${debtBalanceDate(debt)}T12:00:00`))} />
        )}
        {lastPaymentDate && !isDone && <DetailRow label={t("lastPayment")} value={longDate.format(lastPaymentDate)} />}
      </div>

      {/* A payment at or below the monthly interest never clears the debt — say why
          rather than silently omitting the payoff date. */}
      {neverPaysOff && (
        <div className="rounded-tile bg-negative-soft px-4 py-3">
          <p className="text-sm leading-snug text-negative">
            {t("neverPaysOff", { payment: formatEur(debt.minimumPayment), balance: formatEur(currentBalance), rate: (debt.interestRate ?? 0).toLocaleString(locale) })}
          </p>
        </div>
      )}

      {debt.notes && (
        <div className="rounded-card border border-line bg-surface">
          <DetailRow label={t("notes")} value={debt.notes} />
        </div>
      )}

      {/* Linked recurring bills */}
      {linkedBills.length > 0 && (
        <div>
          <p className="mb-2 px-1 mono-label text-[10px]">{t("linkedBills")}</p>
          <div className="space-y-2">
            {linkedBills.map((bill: RecurringItem) => (
              <button
                key={bill.id}
                type="button"
                onClick={() => setDetailBillId(bill.id)}
                className="flex w-full items-center gap-3 rounded-row border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <CategoryIcon icon={bill.icon} color={bill.iconColor} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{bill.friendlyName ?? bill.name}</span>
                {bill.amount != null && <span className="shrink-0 text-sm tabular-nums text-ink-2">{formatEur(bill.amount)}</span>}
              </button>
            ))}
          </div>

          <RecurringDetailDialog
            item={detailBill}
            category={detailBill?.categoryId != null ? cats.find((c) => c.id === detailBill.categoryId) ?? null : null}
            categories={cats}
            onClose={() => setDetailBillId(null)}
          />
        </div>
      )}

      {/* Upcoming payments — one per month until payoff, the last one prorated. */}
      {schedule.length > 0 && (
        <div>
          <button type="button" onClick={() => setScheduleOpen((v) => !v)} aria-expanded={scheduleOpen} className="mb-2 flex w-full items-center justify-between px-1">
            <span className="mono-label text-[10px]">{t("upcoming", { count: schedule.length })}</span>
            <ChevronDown className={cn("size-4 text-ink-3 transition-transform", scheduleOpen && "rotate-180")} />
          </button>
          {scheduleOpen && (
            // Scrolls within itself: a long loan is hundreds of rows.
            <div className="max-h-[45vh] divide-y divide-line overflow-y-auto overscroll-contain rounded-card border border-line bg-surface">
              {schedule.map((entry, i) => (
                <DetailRow
                  key={i}
                  label={shortMonth.format(entry.date)}
                  value={formatEur(entry.amount)}
                  sub={entry.interest > 0 ? t("split", { principal: formatEur(entry.principal), interest: formatEur(entry.interest) }) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-sm text-ink-2">{label}</span>
      <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
        <span className="truncate text-sm font-semibold tabular-nums text-ink">{value}</span>
        {sub && <span className="truncate text-xs text-ink-3">{sub}</span>}
      </span>
    </div>
  );
}
