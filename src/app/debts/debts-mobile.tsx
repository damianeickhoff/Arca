import Link from "next/link";
import { formatEur } from "@/lib/format";
import { DebtClient } from "./debt-client";
import { DebtSimulationClient } from "./debt-simulation-client";
import { DebtSimulationPortal } from "./debt-simulation-portal";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { PageEmptyState } from "@/components/page-empty-state";
import { IconCreditCardFilled as CreditCard, IconPlus, IconChevronRight } from "@tabler/icons-react";
import { formatGaugeMoney } from "@/components/gauge-card";
import { fmtShortMonth } from "./debt-shared";
import { DebtGaugeSwiper } from "./debt-gauge-swiper";
import { DebtsInteractive } from "./debts-interactive";
import type { DebtsPageData } from "./debt-shared";
import type { User } from "@/db/schema";
import type { SettingsPanelContent } from "@/app/settings-panel-content";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { BudgetRecurringMode } from "@/lib/app-settings";

interface Props extends DebtsPageData {
  /** Only passed by the standalone /debts route — when embedded in the dashboard's
   *  Goals subpage (goals-portal-content.tsx), this stays undefined and the page falls
   *  back to its old plain header (that portal already supplies its own chrome). */
  user?: User;
  settingsPanels?: SettingsPanelContent;
  financialMonth?: FinancialMonthConfig;
  budgetRecurringMode?: BudgetRecurringMode;
}

// No page-level client state (no filters/tabs) — unlike GoalsMobile, this stays a
// server component; interactivity is scoped to the DebtClient/DebtSimulationClient islands.
export function DebtsMobile({
  rows,
  bills,
  computed,
  computedOwed,
  totalDebt,
  totalOwed,
  totalStarting,
  totalPaidPct,
  totalMonthly,
  latestFreeDate,
  snowballTarget,
  totalOwedStarting,
  totalOwedPaidPct,
  totalOwedMonthly,
  latestOwedFreeDate,
  user,
  settingsPanels,
  financialMonth,
  budgetRecurringMode,
}: Props) {
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
      <div className="min-h-screen flex flex-col px-4 pt-[calc(3.5rem+var(--sat))] pb-[calc(7rem+var(--sab))] space-y-4" style={{ background: "var(--debt-background)" }}>
        {user && settingsPanels && financialMonth ? (
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 mt-3">
            <SettingsDialog user={user} panels={settingsPanels} financialMonth={financialMonth} budgetRecurringMode={budgetRecurringMode} iconOnly />
            <h1 className="text-lg text-foreground text-center truncate">Debts</h1>
            <div className="flex items-center gap-2 shrink-0 min-w-11 min-h-11 justify-self-end justify-end">
              {activeSimDebts.length > 0 && (
                <DebtSimulationPortal content={<DebtSimulationClient debts={activeSimDebts} />} triggerClassName="size-11" />
              )}
              {rows.length === 0 && <DebtClient action="add" variant="fab" />}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-1">
            <h1 className="text-4xl font-black tracking-tight text-foreground">
              Debts
            </h1>
            {rows.length === 0 && <DebtClient action="add" variant="fab" />}
          </div>
        )}
        {rows.length === 0 && (
          <PageEmptyState
            icon={CreditCard}
            title="No debts yet"
            description="Track what you owe and plan your payoff. Tap the button below to add your first debt."
          />
        )}

        {/* Gauge — swipeable between "I owe" and "I am owed" when both exist */}
        {rows.length > 0 && (
          <DebtGaugeSwiper
            owe={{
              topLeftLabel: "Monthly",
              topLeftValue: formatGaugeMoney(totalMonthly),
              topRightLabel: "Last debt reached by",
              topRightValue: latestFreeDate ? fmtShortMonth(latestFreeDate) : "—",
              pct: totalPaidPct,
              left: totalDebt,
              over: totalDebt < 0,
              bottomLeftLabel: "Allocated",
              bottomLeftValue: formatGaugeMoney(totalStarting),
              bottomRightLabel: "Debts",
              bottomRightValue: String(computed.length),
            }}
            owed={
              computedOwed.length > 0
                ? {
                    topLeftLabel: "Monthly",
                    topLeftValue: formatGaugeMoney(totalOwedMonthly),
                    topRightLabel: "Last debt reached by",
                    topRightValue: latestOwedFreeDate ? fmtShortMonth(latestOwedFreeDate) : "—",
                    pct: totalOwedPaidPct,
                    left: totalOwed,
                    over: totalOwed < 0,
                    bottomLeftLabel: "Allocated",
                    bottomLeftValue: formatGaugeMoney(totalOwedStarting),
                    bottomRightLabel: "Debts",
                    bottomRightValue: String(computedOwed.length),
                  }
                : null
            }
          />
        )}

        {/* Per-debt lists — tap a row to open its detail view (icon ring fills with the paid-off share) */}
        <DebtsInteractive computed={computed} computedOwed={computedOwed} totalOwed={totalOwed} bills={bills} />

        {rows.length > 0 && (
          <Link
            href="/debts/add"
            aria-label="Add new debt"
            className="w-full flex items-center gap-4 rounded-2xl bg-card px-4 py-3 text-left active:bg-foreground/[0.03] transition-colors"
          >
            <div className="size-12 rounded-full bg-foreground/8 flex items-center justify-center shrink-0">
              <IconPlus className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Add debt</p>
            </div>
            <IconChevronRight className="size-5 text-foreground/40 shrink-0" />
          </Link>
        )}

        {/* Extra payment simulation — inline only when embedded (no standalone-page
            header to host the DebtSimulationPortal trigger); otherwise it lives there. */}
        {!user && activeSimDebts.length > 0 && (
          <DebtSimulationClient debts={activeSimDebts} />
        )}
      </div>
    </>
  );
}
