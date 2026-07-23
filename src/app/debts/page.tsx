import { PageShell } from "@/components/page-shell";
import { DebtsMobile } from "./debts-mobile";
import { DebtsDesktop } from "./debts-desktop";
import { loadDebtsData } from "./load-debts";
import { getCurrentUser } from "@/lib/auth";
import { getSettingsPanelContent } from "@/app/settings-panel-content";
import { getFinancialMonthConfig, getBudgetRecurringMode } from "@/lib/app-settings";
import { redirect } from "next/navigation";

export default async function DebtsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [sharedProps, financialMonth, budgetRecurringMode] = await Promise.all([
    loadDebtsData(),
    getFinancialMonthConfig(),
    getBudgetRecurringMode(),
  ]);
  const settingsPanels = getSettingsPanelContent(user);

  return (
    <PageShell
      mobile={<DebtsMobile {...sharedProps} user={user} settingsPanels={settingsPanels} financialMonth={financialMonth} budgetRecurringMode={budgetRecurringMode} />}
      desktop={<DebtsDesktop {...sharedProps} />}
    />
  );
}
