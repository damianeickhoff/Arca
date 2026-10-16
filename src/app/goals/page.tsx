import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { loadGoalsData } from "./load-goals";
import { GoalsView } from "./goals-view";
import type { GoalFormTarget } from "./goal-form-dialog";

export const dynamic = "force-dynamic";

/**
 * Plan · Goals. `?new=savings|expense|choose` opens the goal form for a new goal and
 * `?edit=<id>` for an existing one — where the old /goals/add and /goals/[id]/edit
 * routes now send you.
 */
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const financialMonth = await getFinancialMonthConfig();
  const data = await loadGoalsData(financialMonth);

  let initialForm: GoalFormTarget | null = null;
  if (params.new === "savings" || params.new === "expense" || params.new === "choose") {
    initialForm = { mode: "new", type: params.new };
  } else if (params.edit) {
    const id = Number(params.edit);
    // Budget (expense) goals aren't on the page, so the goal is read on its own.
    const [goal] = Number.isFinite(id) ? await db.select().from(goals).where(eq(goals.id, id)) : [];
    if (goal) initialForm = { mode: "edit", goal };
  }

  return <GoalsView data={data} initialForm={initialForm} />;
}
