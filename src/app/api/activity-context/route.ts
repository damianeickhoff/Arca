import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getActivityContext } from "@/lib/activity-context";

// The transaction detail panel's context (budgets, this month's spend by merchant, the
// linked recurring items) for surfaces outside Activity that open the panel for one
// transaction: Home's latest list, needs review, the merchant and category profiles,
// the recurring sheet and the forecast. `recurring` is a comma-separated list of ids.
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const recurring = (req.nextUrl.searchParams.get("recurring") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const context = await getActivityContext(await getFinancialMonthConfig(), recurring);
  return NextResponse.json(context);
}
