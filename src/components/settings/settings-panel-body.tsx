"use client";

import { useTranslations } from "next-intl";
import { IconChevronRight, IconHelpCircle } from "@tabler/icons-react";
import type { User } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { BudgetRecurringMode, SharedCostMode } from "@/lib/app-settings";
import { FinancialMonthForm, MonthOverridesPanel } from "@/app/settings/general-client";
import { AppLockSectionContent } from "@/app/settings/profile-client";
import { BudgetRecurringCard } from "@/components/settings/budget-recurring-card";
import { SharedCostCard } from "@/components/settings/shared-cost-card";
import { AuthBackgroundPicker } from "@/components/settings/auth-background-picker";
import { ProfileForms, SecurityForms } from "@/components/settings/account-forms";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SELF_CHROMED_PANELS, isHeavyPanel, type SettingsPanelKey } from "@/components/settings/settings-sections";
import { ImportCsvCard } from "@/components/import-csv-card";
import { ThemeList } from "@/components/theme-toggle";
import { LanguageList } from "@/components/language-switcher";
import { CurrencyList } from "@/components/currency-switcher";
import { PrivacyToggle } from "@/components/privacy-toggle";

export interface SettingsPanelSettings {
  financialMonth: FinancialMonthConfig;
  budgetRecurringMode: BudgetRecurringMode;
  sharedCostMode: SharedCostMode;
}

/**
 * One open settings panel: the generic header (unless the panel draws its own) and
 * its content — the server-rendered node for the heavy panels, else the client-only
 * panels below. Shared by the phone SettingsDialog and the /settings page; the host
 * wraps it in a PanelChromeContext that says how the header looks.
 */
export function SettingsPanelBody({
  panelKey,
  heavy,
  user,
  settings,
}: {
  panelKey: SettingsPanelKey;
  /** The server-rendered content when `panelKey` is a heavy panel. */
  heavy?: React.ReactNode;
  user: User;
  settings: SettingsPanelSettings;
}) {
  const t = useTranslations("settings");
  return (
    <>
      {!SELF_CHROMED_PANELS.has(panelKey) && <PanelHeader title={t(`panels.${panelKey}.title`)} />}
      {isHeavyPanel(panelKey) ? heavy : <InlinePanel panelKey={panelKey} user={user} settings={settings} />}
    </>
  );
}

function InlinePanel({ panelKey, user, settings }: { panelKey: SettingsPanelKey; user: User; settings: SettingsPanelSettings }) {
  const t = useTranslations("settings.inline");
  const { financialMonth } = settings;

  switch (panelKey) {
    case "profile":
      return <div className="px-4 pt-4 pb-6"><ProfileForms user={user} /></div>;

    case "security":
      return <div className="px-4 pt-4 pb-6"><SecurityForms /></div>;

    case "import":
      return <div className="px-4 pt-4"><ImportCsvCard /></div>;

    case "appearance":
      return (
        <div className="px-4 pt-4 space-y-3">
          <ThemeList />
          <p className="px-2 text-sm text-clear-muted">{t("appearanceHint")}</p>
          <AuthBackgroundPicker />
        </div>
      );

    case "privacy":
      return (
        <div className="px-4 pt-4 space-y-3">
          <div className="rounded-clear-tile bg-clear-tile p-2">
            <PrivacyToggle variant="row" />
          </div>
          <p className="px-2 text-sm text-clear-muted">{t("privacyHint")}</p>
        </div>
      );

    case "appLock":
      return <div className="px-4 pt-4"><AppLockSectionContent /></div>;

    case "language":
      return (
        <div className="px-4 pt-4 space-y-3">
          <LanguageList />
          <p className="px-2 text-sm text-clear-muted">{t("languageHint")}</p>
        </div>
      );

    case "currency":
      return (
        <div className="px-4 pt-4 space-y-3">
          <CurrencyList />
          <p className="px-2 text-sm text-clear-muted">{t("currencyHint")}</p>
        </div>
      );

    case "financialMonth":
      return (
        <FinancialMonthForm
          currentStartDay={financialMonth.defaultStartDay}
          currentWeekendRollback={financialMonth.weekendRollback ?? false}
          overrides={financialMonth.overrides}
        />
      );

    case "budgetRecurring":
      // Two related "what counts as spending" switches, so they share one panel.
      return (
        <div className="space-y-6 pb-2">
          <BudgetRecurringCard initialMode={settings.budgetRecurringMode} />
          <SharedCostCard initialMode={settings.sharedCostMode} />
        </div>
      );

    case "monthOverrides": {
      const initialOverrides = Object.entries(financialMonth.overrides ?? {}).map(
        ([month, startDay]) => ({ month, startDay: startDay as number }),
      );
      return <MonthOverridesPanel currentStartDay={financialMonth.defaultStartDay} initialOverrides={initialOverrides} />;
    }

    case "help":
      return (
        <div className="px-4 pt-4 space-y-3">
          <div className="rounded-clear-tile bg-clear-tile p-5">
            <p className="mb-1 text-sm font-bold text-clear-ink">{t("helpTitle")}</p>
            <p className="text-sm text-clear-ink-2">{t("helpBody")}</p>
          </div>
          <a
            href="mailto:support@arca.app"
            className="flex items-center gap-3.5 rounded-clear-tile bg-clear-tile px-4 py-3.5 no-underline transition-colors hover:opacity-90"
          >
            <IconHelpCircle className="size-5 shrink-0 text-clear-ink" />
            <span className="flex-1 text-sm font-bold text-clear-ink">{t("contactSupport")}</span>
            <IconChevronRight className="size-4 text-clear-muted" />
          </a>
        </div>
      );

    default:
      return null;
  }
}
