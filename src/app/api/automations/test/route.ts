import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { applyRulePass, planRulePass } from "@/lib/apply-rules";
import { CONFLICT_WINDOW_DAYS } from "@/lib/automations";

function since(): string {
  const d = new Date();
  d.setDate(d.getDate() - CONFLICT_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

// GET /api/automations/test — replays every rule (category rules, recurring items,
// merchant categories) on the last 90 days without saving: which transactions would
// get another category, from what to what.
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const changes = (await planRulePass({ since: since() })).filter((c) => c.patch.categoryId !== undefined);
  return NextResponse.json({
    days: CONFLICT_WINDOW_DAYS,
    changes: changes
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((c) => ({ id: c.id, date: c.date, description: c.description, from: c.fromCategoryId, to: c.patch.categoryId ?? null })),
  });
}

// POST /api/automations/test — applies that same replay to the last 90 days.
export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  const updated = await applyRulePass(await planRulePass({ since: since() }));
  revalidatePath("/", "layout");
  return NextResponse.json({ updated });
}
