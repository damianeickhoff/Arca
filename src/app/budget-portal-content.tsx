import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getBudgetOverview } from "@/lib/budget-overview";
import { BudgetPortal } from "@/components/budget-portal";

// Server-rendered content for the dashboard header's Budget subpage overlay.
// Loads the overall budget + per-category spend and hands it to the client flow.
export async function getBudgetPortalContent() {
  const financialMonth = await getFinancialMonthConfig();
  const data = await getBudgetOverview(financialMonth);
  return <BudgetPortal data={data} />;
}
