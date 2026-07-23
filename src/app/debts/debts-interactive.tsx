"use client";

import { useState } from "react";
import { formatEur } from "@/lib/format";
import { Icon } from "@/components/icon";
import { ProgressRing } from "@/components/progress-ring";
import { ListItemRow } from "@/components/list-item-row";
import { IconCheckFilled as Check } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { fmtShortMonth, debtPaidPct } from "./debt-shared";
import { DebtDetailDialog } from "./debt-detail-dialog";
import type { ComputedDebt } from "./debt-shared";
import type { RecurringItem } from "@/db/schema";

// Owns the tap-to-open-detail state for both debt lists (owed by me / owed to me), so
// a single DebtDetailDialog instance can serve either list.
export function DebtsInteractive({
  computed,
  computedOwed,
  totalOwed,
  bills,
}: {
  computed: ComputedDebt[];
  computedOwed: ComputedDebt[];
  totalOwed: number;
  bills: RecurringItem[];
}) {
  // Track the open debt by id rather than snapshotting the ComputedDebt object — this way,
  // when an edit inside the detail dialog triggers router.refresh(), the freshly computed
  // debt (new balance/schedule) flows straight through instead of needing a reopen.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected =
    selectedId != null
      ? (computed.find((c) => c.debt.id === selectedId) ?? computedOwed.find((c) => c.debt.id === selectedId) ?? null)
      : null;

  return (
    <>
      {computed.length > 0 && (
        <div>
          <h2 className="font-semibold text-base mb-3 px-3">Debts</h2>
          <div className="space-y-2.5">
            {computed.map((c) => {
              const { debt, linkedBills, amountPaid, currentBalance, debtFreeDate } = c;
              const paidPct = debtPaidPct(debt, amountPaid, currentBalance);
              const isPaidOff = currentBalance === 0;
              const color = debt.color ?? "var(--chart-3)";

              return (
                <button key={debt.id} type="button" onClick={() => setSelectedId(debt.id)} className="block w-full text-left">
                  <ListItemRow
                    className="rounded-2xl bg-card px-4 py-4 gap-4"
                    icon={
                      <div className="relative shrink-0">
                        <ProgressRing pct={paidPct} color={isPaidOff ? "var(--success)" : color} iconSize={40} glow={false}>
                          <Icon iconKey={debt.icon ?? linkedBills[0]?.icon ?? null} color={debt.color} size="md" round />
                        </ProgressRing>
                        {isPaidOff && (
                          <div className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-white">
                            <Check className="size-3 text-white" />
                          </div>
                        )}
                      </div>
                    }
                    name={debt.name}
                    subtitle={isPaidOff ? "Paid off" : `${paidPct.toFixed(0)}% afbetaald`}
                    right={
                      <div className="text-right shrink-0">
                        <p className={cn("font-semibold text-base tabular-nums", isPaidOff ? "text-emerald-600" : "text-foreground")}>
                          {formatEur(currentBalance)}
                        </p>
                        <p className="text-sm text-foreground/60 tabular-nums">
                          {isPaidOff ? "✓" : debtFreeDate ? fmtShortMonth(debtFreeDate) : "—"}
                        </p>
                      </div>
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {computedOwed.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3 px-3">
            <h2 className="font-semibold text-base">I am owed</h2>
            <span className="text-sm font-medium text-muted-foreground tabular-nums">{formatEur(totalOwed)}</span>
          </div>
          <div className="space-y-2.5">
            {computedOwed.map((c) => {
              const { debt, linkedBills, amountPaid, currentBalance } = c;
              const receivedPct = debtPaidPct(debt, amountPaid, currentBalance);
              const isSettled = currentBalance === 0;
              const color = debt.color ?? "var(--success)";

              return (
                <button key={debt.id} type="button" onClick={() => setSelectedId(debt.id)} className="block w-full text-left">
                  <ListItemRow
                    className="rounded-2xl bg-card px-4 py-4 gap-4"
                    icon={
                      <div className="relative shrink-0">
                        <ProgressRing pct={receivedPct} color={isSettled ? "var(--success)" : color} iconSize={40} glow={false}>
                          <Icon iconKey={debt.icon ?? linkedBills[0]?.icon ?? null} color={debt.color} size="md" round />
                        </ProgressRing>
                        {isSettled && (
                          <div className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-[var(--success)] flex items-center justify-center ring-2 ring-white">
                            <Check className="size-3 text-white" />
                          </div>
                        )}
                      </div>
                    }
                    name={debt.name}
                    subtitle={isSettled ? "Settled" : `${receivedPct.toFixed(0)}% ontvangen`}
                    right={
                      <p className={cn("font-semibold text-base tabular-nums", isSettled ? "text-success" : "text-success")}>
                        {formatEur(currentBalance)}
                      </p>
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <DebtDetailDialog computed={selected} bills={bills} onClose={() => setSelectedId(null)} />
    </>
  );
}
