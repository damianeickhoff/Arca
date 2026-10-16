import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOpenAdvances } from "@/lib/open-advances";
import { loadDebtsData, loadDebtsFreeToSpend } from "./load-debts";
import { DebtsView, type DebtFormRequest } from "./debts-view";

/** ?add=owe|owed opens the add form, ?edit=<id> the edit form (the old /debts/add and
 *  /debts/[id]/edit routes redirect here). ?sort=… orders "Your debts" (read on the
 *  client, see DebtsView). */
function formRequest(sp: { add?: string; edit?: string }): DebtFormRequest | null {
  if (sp.edit && Number.isFinite(Number(sp.edit))) return { kind: "edit", id: Number(sp.edit) };
  if (sp.add != null) return { kind: "add", direction: sp.add === "owed" ? "owed" : "owe" };
  return null;
}

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ add?: string; edit?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [data, advances, sp] = await Promise.all([loadDebtsData(), getOpenAdvances(), searchParams]);
  const freeToSpend = await loadDebtsFreeToSpend(data.computed);

  return (
    <DebtsView
      computed={data.computed}
      computedOwed={data.computedOwed}
      bills={data.bills}
      totalDebt={data.totalDebt}
      totalOwed={data.totalOwed}
      totalMonthly={data.totalMonthly}
      freeToSpend={freeToSpend}
      advances={advances}
      initialForm={formRequest(sp)}
    />
  );
}
