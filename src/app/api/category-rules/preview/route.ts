import { NextRequest, NextResponse } from "next/server";
import type { CategoryRule } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { filedByRule, findRuleMatches } from "@/lib/rule-matches";

const EXAMPLES = 3;

/** A number from the query string, or null when it's missing or not a number. */
function num(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/category-rules/preview — what a rule being edited would match, for the
 * rule dialog's live "Matches N earlier transactions" line. Takes the rule's own
 * fields (pattern, match = contains | word | exact, amount or amountMin/amountMax,
 * direction, bankId) and runs them through findRuleMatches, the same matching the
 * apply-rules pass does, so the count is exactly what saving would match. `ids=1` adds
 * every matched id. `categoryId` adds `filed`: the matches with that category that
 * weren't set by hand — what deleting the rule could send back to Needs review.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const params = req.nextUrl.searchParams;
  const pattern = (params.get("pattern") ?? "").trim();
  const match = params.get("match");
  const direction = params.get("direction");
  const bankId = num(params.get("bankId"));
  const categoryId = num(params.get("categoryId"));
  if (!pattern && bankId == null) return NextResponse.json({ count: 0, uncategorized: 0, examples: [], ...(categoryId != null ? { filed: 0 } : {}) });

  const rule: CategoryRule = {
    id: 0,
    categoryId: 0,
    namePattern: pattern || null,
    nameWildcard: match !== "exact",
    nameWholeWord: match === "word",
    amount: num(params.get("amount")),
    amountMin: num(params.get("amountMin")),
    amountMax: num(params.get("amountMax")),
    direction: direction === "income" || direction === "expense" ? direction : null,
    bankId,
    createdAt: null,
  };

  const matched = await findRuleMatches(rule);
  return NextResponse.json({
    count: matched.length,
    uncategorized: matched.filter((r) => r.categoryId == null).length,
    examples: matched.slice(0, EXAMPLES).map(({ id, date, description, amount, direction }) => ({ id, date, description, amount, direction })),
    // Every id only when asked: the dialog's save moves them, the live preview doesn't need them.
    ...(params.get("ids") === "1" ? { ids: matched.map((r) => r.id) } : {}),
    ...(categoryId != null ? { filed: filedByRule(matched, categoryId).length } : {}),
  });
}
