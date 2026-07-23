import { PageShell } from "@/components/page-shell";
import { DebtsMobile } from "./debts-mobile";
import { DebtsDesktop } from "./debts-desktop";
import { loadDebtsData } from "./load-debts";
import { getCurrentUser } from "@/lib/auth";
import { getSettingsPanelContent } from "@/app/settings-panel-content";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { redirect } from "next/navigation";

export default async function DebtsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [sharedProps, financialMonth] = await Promise.all([
    loadDebtsData(),
    getFinancialMonthConfig(),
  ]);
  const settingsPanels = getSettingsPanelContent(user);

  return (
    <PageShell
      mobile={<DebtsMobile {...sharedProps} user={user} settingsPanels={settingsPanels} financialMonth={financialMonth} />}
      desktop={<DebtsDesktop {...sharedProps} />}
    />
  );
}
