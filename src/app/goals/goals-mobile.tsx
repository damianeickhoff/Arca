"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconPigMoney, IconPlus, IconChevronRight } from "@tabler/icons-react";
import type { Category, Goal, User } from "@/db/schema";
import { PageEmptyState } from "@/components/page-empty-state";
import { FloatingAddButton } from "@/components/floating-add-button";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { SavingsGoalRows } from "./savings-goal-rows";
import { GaugeCard, formatGaugeMoney } from "@/components/gauge-card";
import type { SavingsSummary } from "./goal-shared";
import type { SettingsPanelContent } from "@/app/settings-panel-content";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { BudgetRecurringMode } from "@/lib/app-settings";
import { PageContainer } from "@/components/page-container";

// The /goals page is savings-only — budget (expense) goals now live in the
// dashboard header's Goals subpage instead. Adding here always creates a saving.
export function GoalsMobile({
  goals,
  categories,
  savings,
  user,
  settingsPanels,
  financialMonth,
  budgetRecurringMode,
}: {
  goals: Goal[];
  categories: Category[];
  savings: SavingsSummary;
  user: User;
  settingsPanels: SettingsPanelContent;
  financialMonth: FinancialMonthConfig;
  budgetRecurringMode?: BudgetRecurringMode;
}) {
  const visible = goals.filter((g) => g.goalType === "savings");
  const t = useTranslations("goals");

  return (
    <>
      {/* Gradient stays full-bleed; PageContainer caps the content to the shared column.
          pt is just the status-bar inset — the extra 3.5rem this used to carry was
          cancelling a negative margin on the old mobile/desktop page shell. */}
      <div className="min-h-screen pt-[var(--sat)] pb-[calc(7rem+var(--sab))]" style={{ background: "var(--savings-background)" }}>
       <PageContainer className="flex flex-col space-y-4">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 mt-3">
          <SettingsDialog user={user} panels={settingsPanels} financialMonth={financialMonth} budgetRecurringMode={budgetRecurringMode} iconOnly />
          <h1 className="text-xl text-white text-semibold text-center truncate">{t("savings")}</h1>
          <div className="shrink-0 min-w-11 min-h-11 justify-self-end" />
        </div>

        {visible.length > 0 && (
          <GaugeCard
            topLeftLabel={t("monthly")}
            topLeftValue={formatGaugeMoney(savings.totalMonthly)}
            topRightLabel={t("lastGoalReachedBy")}
            topRightValue={savings.latestTargetLabel ?? "—"}
            pct={savings.totalReachedPct}
            left={savings.totalTargetSavings - savings.totalSaved}
            over={savings.totalSaved > savings.totalTargetSavings}
            bottomLeftLabel={t("allocated")}
            bottomLeftValue={formatGaugeMoney(savings.totalTargetSavings)}
            bottomRightLabel={t("savingsGoals")}
            bottomRightValue={String(savings.totalCount)}
          />
        )}

        {visible.length === 0 ? (
          <PageEmptyState
            icon={IconPigMoney}
            title={t("emptyTitle")}
            description={t("emptyDesc")}
          />
        ) : (
          <>
            <SavingsGoalRows goals={visible} categories={categories} className="space-y-2.5" />

            <Link
              href="/goals/add?type=savings"
              aria-label={t("addNewSaving")}
              className="w-full flex items-center gap-4 rounded-2xl bg-card px-4 py-3 text-left active:bg-foreground/[0.03] transition-colors"
            >
              <div className="size-12 rounded-full bg-foreground/8 flex items-center justify-center shrink-0">
                <IconPlus className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-muted-foreground">{t("addNewSaving")}</p>
              </div>
              <IconChevronRight className="size-5 text-foreground/40 shrink-0" />
            </Link>
          </>
        )}
       </PageContainer>
      </div>

      {/* Add button — compact pill floating above the bottom nav, shown only until the
          first saving exists; after that, adding happens via the row beneath the list.
          Adding always creates a savings goal (type chooser skipped via ?type=savings). */}
      {visible.length === 0 && (
        <FloatingAddButton href="/goals/add?type=savings" label={t("addSaving")} ariaLabel={t("addNewSaving")} />
      )}
    </>
  );
}
