import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCategoryRuleStats } from "@/lib/rule-stats";

// GET /api/category-rules/stats?categoryId= — for the category editor's rule list: per
// rule of that category, how many transactions it decides and which rules of other
// categories match the same recent transactions.
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const categoryId = Number(req.nextUrl.searchParams.get("categoryId"));
  if (!Number.isInteger(categoryId)) return NextResponse.json({ error: "categoryId" }, { status: 400 });
  return NextResponse.json({ stats: await getCategoryRuleStats(categoryId) });
}
