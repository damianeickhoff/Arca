import { formatEur } from "@/lib/format";
import { DebtClient } from "./debt-client";
import { DebtSimulationClient } from "./debt-simulation-client";
import { DebtSimulationPortal } from "./debt-simulation-portal";
import { IconSnowflake as Snowflake } from "@tabler/icons-react";
import { DesktopPageHeader } from "@/components/desktop-page-header";
import { fmtShortMonth, fmtLongMonth, debtPaidPct } from "./debt-shared";
import { DebtDistributionBar } from "./debt-distribution-bar";
import { DebtPayoffTimelineCard } from "./debt-payoff-timeline-card";
import type { DebtsPageData } from "./debt-shared";

export function DebtsDesktop({
  rows,
  computed,
  computedOwed,
  totalDebt,
  totalOwed,
  netDebt,
  totalStarting,
  totalPaid,
  totalPaidPct,
  totalMonthly,
  latestFreeDate,
  snowballTarget,
  hasChart,
  chartData,
  chartSeries,
}: DebtsPageData) {
  const activeSimDebts = computed
    .filter((c) => c.currentBalance > 0)
    .map((c) => ({
      name: c.debt.name,
      currentBalance: c.currentBalance,
      minimumPayment: c.debt.minimumPayment,
      color: c.debt.color,
      icon: c.debt.icon ?? c.linkedBills[0]?.icon ?? null,
    }));

  return (
    <>
      <DesktopPageHeader
        title="Debts"
        subtitle="Overview of outstanding debts"
        actions={
          <div className="flex items-center gap-2">
            {activeSimDebts.length > 0 && (
              <DebtSimulationPortal content={<DebtSimulationClient debts={activeSimDebts} />} triggerClassName="h-10 w-10" />
            )}
            <DebtClient action="add" />
          </div>
        }
      />

      <div className="px-4 pt-1 pb-4 md:px-6 md:pb-6 lg:px-8 lg:pb-8 lg:pt-4 space-y-4 lg:space-y-5">
        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Totale schuld</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: "var(--color-inkomen)" }}>{formatEur(totalDebt)}</p>
            {totalOwed > 0 && (
              <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                Netto {netDebt < 0 ? "+" : ""}{formatEur(Math.abs(netDebt))}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Paid off</p>
            <p className="text-xl font-bold" style={{ color: "var(--color-sparen)" }}>{totalPaidPct}%</p>
            <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
              {formatEur(totalPaid)} / {formatEur(totalStarting)}
            </p>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Per month</p>
            <p className="text-xl font-bold tabular-nums text-foreground">{formatEur(totalMonthly)}</p>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Schuldvrij op</p>
            <p className="text-xl font-bold tabular-nums text-foreground">{latestFreeDate ? fmtLongMonth(latestFreeDate) : "—"}</p>
          </div>
        </div>

        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
            No debts. Add one to get started.
          </div>
        )}

        {/* Snowball tip */}
        {snowballTarget && (
          <div className="rounded-2xl bg-card p-4 flex items-center gap-3">
            <div className="size-10 rounded-full shrink-0 flex items-center justify-center bg-sky-100 dark:bg-sky-500/10">
              <Snowflake className="size-4.5 text-sky-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Snowball tip: pay this one off first (smallest balance)</p>
              <p className="font-semibold text-sm truncate">{snowballTarget.debt.name}</p>
            </div>
            <p className="font-bold text-sm tabular-nums text-red-600 shrink-0">{formatEur(snowballTarget.currentBalance)}</p>
          </div>
        )}

        <DebtDistributionBar
          computed={computed}
          totalDebt={totalDebt}
          titleClassName="text-sm"
          legendClassName="grid grid-cols-2 gap-x-6 gap-y-2.5"
        />

        {/* Debt rows */}
        {computed.length > 0 && (
          <div className="rounded-2xl bg-card overflow-hidden">
            {computed.map(({ debt, linkedBills, amountPaid, currentBalance, debtFreeDate }) => {
              const paidPct = debtPaidPct(debt, amountPaid, currentBalance);
              const isPaidOff = currentBalance === 0;
              const color = debt.color ?? "var(--chart-3)";

              return (
                <div key={debt.id} className="border-b last:border-0">
                  <div className="px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-medium text-sm truncate">{debt.name}</span>
                        {isPaidOff && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold shrink-0">
                            Paid off
                          </span>
                        )}
                      </div>
                      <DebtClient action="edit" debt={debt} />
                    </div>
                    <div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${paidPct}%`, backgroundColor: color }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums">
                        <span>{paidPct.toFixed(0)}% afbetaald</span>
                        <span>Start: {formatEur(debt.startingBalance)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/50 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">Balance</p>
                        <p className={`text-sm font-bold tabular-nums ${isPaidOff ? "text-emerald-600" : "text-red-600"}`}>{formatEur(currentBalance)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">Per month</p>
                        <p className="text-sm font-semibold tabular-nums">{formatEur(debt.minimumPayment)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">Vrij op</p>
                        {isPaidOff ? (
                          <p className="text-sm font-semibold text-emerald-600">✓</p>
                        ) : debtFreeDate ? (
                          <p className="text-sm font-semibold tabular-nums">{fmtShortMonth(debtFreeDate)}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    </div>
                    {linkedBills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {linkedBills.map((bill) => (
                          <span key={bill.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-muted text-muted-foreground">
                            {bill.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* I am owed — money others owe you */}
        {computedOwed.length > 0 && (
          <div className="rounded-2xl bg-card overflow-hidden">
            <div className="flex items-baseline justify-between px-4 py-3 border-b">
              <h2 className="font-semibold text-sm">I am owed</h2>
              <span className="text-sm font-semibold text-success tabular-nums">{formatEur(totalOwed)}</span>
            </div>
            {computedOwed.map(({ debt, amountPaid, currentBalance }) => {
              const receivedPct = debtPaidPct(debt, amountPaid, currentBalance);
              const isSettled = currentBalance === 0;
              const color = debt.color ?? "var(--success)";
              return (
                <div key={debt.id} className="border-b last:border-0 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="font-medium text-sm truncate">{debt.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{receivedPct.toFixed(0)}% ontvangen</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-bold tabular-nums ${isSettled ? "text-emerald-600" : "text-success"}`}>{formatEur(currentBalance)}</span>
                    <DebtClient action="edit" debt={debt} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasChart && (
          <DebtPayoffTimelineCard
            chartData={chartData}
            chartSeries={chartSeries}
            computed={computed}
            title="Aflossing over tijd"
            totalColor="var(--color-inkomen)"
            legendClassName="text-xs text-foreground/60"
          />
        )}
      </div>
    </>
  );
}
