import { DebtsMobile } from "./debts-mobile";
import { loadDebtsData } from "./load-debts";
import { getCurrentUser } from "@/lib/auth";
import { getSettingsPanelContent } from "@/app/settings-panel-content";
import { getFinancialMonthConfig, getBudgetRecurringMode, getSharedCostMode } from "@/lib/app-settings";
import { redirect } from "next/navigation";

export default async function DebtsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [sharedProps, financialMonth, budgetRecurringMode, sharedCostMode] = await Promise.all([
    loadDebtsData(),
    getFinancialMonthConfig(),
    getBudgetRecurringMode(),
    getSharedCostMode(),
  ]);
  const settingsPanels = getSettingsPanelContent(user);

  return (
    <DebtsMobile
      {...sharedProps}
      user={user}
      settingsPanels={settingsPanels}
      financialMonth={financialMonth}
      budgetRecurringMode={budgetRecurringMode}
      sharedCostMode={sharedCostMode}
    />
  );
}
