import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { PageShell } from "@/components/page-container";
import { loadGoalsData } from "./load-goals";
import { GoalsHeader, GoalsView } from "./goals-view";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const financialMonth = await getFinancialMonthConfig();
  const data = await loadGoalsData(financialMonth);

  return (
    <PageShell header={<GoalsHeader goals={data.goals} />}>
      <GoalsView data={data} />
    </PageShell>
  );
}
