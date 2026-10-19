"use client";

import { useTranslations } from "next-intl";
import { IconBook2, IconBug, IconExternalLink } from "@tabler/icons-react";
import type { User } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { BudgetRecurringMode, SharedCostMode } from "@/lib/app-settings";
import { FinancialMonthForm } from "@/app/settings/general-client";
import { AppLockSectionContent } from "@/app/settings/profile-client";
import { BudgetRecurringCard } from "@/components/settings/budget-recurring-card";
import { SharedCostCard } from "@/components/settings/shared-cost-card";
import { ProfileForms, SecurityForms } from "@/components/settings/account-forms";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SELF_CHROMED_PANELS, isHeavyPanel, type SettingsPanelKey } from "@/components/settings/settings-sections";
import { ImportCsvCard } from "@/components/import-csv-card";
import { ThemeList } from "@/components/theme-toggle";
import { LanguageList } from "@/components/language-switcher";
import { CurrencyList } from "@/components/currency-switcher";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { AiSettingsPanel } from "@/components/settings/ai-settings-panel";
import { BankConnectionSection } from "@/components/settings/bank-connection-section";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { IconTile } from "@/components/clear/icon-tile";
import { ListRow } from "@/components/clear/list-row";
import { DOCS_URL, ISSUES_URL } from "@/lib/links";

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
      return (
        <div className="flex flex-col gap-6 px-4 pt-4">
          <BankConnectionSection className="" />
          <ImportCsvCard />
        </div>
      );

    case "appearance":
      return (
        <div className="px-4 pt-4 space-y-3">
          <ThemeList />
          <p className="px-2 text-sm text-clear-muted">{t("appearanceHint")}</p>
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

    case "ai":
      return <AiSettingsPanel />;

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

    case "help":
      // The guide lives online (the docs site); problems and ideas go to GitHub.
      return (
        <div className="px-4 pt-4 space-y-3">
          <div className="flex flex-col items-start gap-4 rounded-clear-tile bg-clear-tile p-5">
            <div>
              <p className="mb-1 text-[15px] font-bold text-clear-ink">{t("helpTitle")}</p>
              <p className="text-sm text-clear-ink-2">{t("helpBody")}</p>
            </div>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className={clearButtonVariants({ variant: "primary", size: "md", className: "no-underline" })}
            >
              <IconBook2 aria-hidden />
              {t("openGuide")}
            </a>
          </div>
          <ListRow
            href={ISSUES_URL}
            external
            icon={<IconTile tone="peach" size="sm"><IconBug stroke={1.9} /></IconTile>}
            title={t("reportProblem")}
            meta={t("reportProblemMeta")}
            trailing={<IconExternalLink size={18} stroke={2} aria-hidden className="text-clear-placeholder" />}
          />
        </div>
      );

    default:
      return null;
  }
}
