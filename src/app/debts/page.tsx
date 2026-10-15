import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/page-container";
import { getOpenAdvances } from "@/lib/open-advances";
import { loadDebtsData } from "./load-debts";
import { DebtsHeader, DebtsView } from "./debts-view";

export default async function DebtsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [data, advances] = await Promise.all([loadDebtsData(), getOpenAdvances()]);

  return (
    <PageShell
      header={
        <DebtsHeader
          debtCount={data.computed.filter((c) => c.currentBalance > 0).length}
          monthly={data.totalMonthly}
          advanceCount={advances.length + data.computedOwed.filter((c) => c.currentBalance > 0).length}
        />
      }
    >
      <DebtsView
        computed={data.computed}
        computedOwed={data.computedOwed}
        bills={data.bills}
        totalDebt={data.totalDebt}
        totalOwed={data.totalOwed}
        totalPaidPct={data.totalPaidPct}
        totalMonthly={data.totalMonthly}
        advances={advances}
      />
    </PageShell>
  );
}
