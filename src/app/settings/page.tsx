import { redirect } from "next/navigation";
import { getCurrentUser, toClientUser } from "@/lib/auth";
import { getBudgetRecurringMode, getFinancialMonthConfig, getSharedCostMode } from "@/lib/app-settings";
import { getSettingsPanel } from "@/app/settings-panel-content";
import {
  DEFAULT_SETTINGS_PANEL,
  isHeavyPanel,
  legacyTabPanel,
  parseSettingsPanel,
} from "@/components/settings/settings-sections";
import { SettingsView } from "./settings-view";

// Settings changes made elsewhere (or in src/config) must show on the next visit, not
// a cached RSC payload from the Router Cache.
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string; tab?: string }>;
}) {
  const { panel, tab } = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Old links used ?tab=; send them to the matching panel.
  if (!panel) {
    const legacy = legacyTabPanel(tab);
    if (legacy) redirect(`/settings?panel=${legacy}`);
  }

  const requested = parseSettingsPanel(panel, user.isAdmin);
  const active = requested ?? DEFAULT_SETTINGS_PANEL;

  const [financialMonth, budgetRecurringMode, sharedCostMode] = await Promise.all([
    getFinancialMonthConfig(),
    getBudgetRecurringMode(),
    getSharedCostMode(),
  ]);

  // The client only needs the profile fields; keep the secrets on the server.
  const clientUser = toClientUser(user);

  return (
    <SettingsView
      user={clientUser}
      active={active}
      explicit={requested != null}
      heavy={isHeavyPanel(active) ? getSettingsPanel(active, user) : null}
      settings={{ financialMonth, budgetRecurringMode, sharedCostMode }}
    />
  );
}
