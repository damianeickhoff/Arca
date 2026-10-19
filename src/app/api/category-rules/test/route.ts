import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { testRule } from "@/lib/rule-stats";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// POST /api/category-rules/test — the rule dialog's Test: what saving this rule (the
// fields as edited, for `categoryId`; replacing `ruleId` when it is an existing rule)
// would change on the last 90 days. Writes nothing.
export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const f = body?.rule ?? {};
  const categoryId = num(body?.categoryId);
  if (categoryId == null) return NextResponse.json({ error: "categoryId" }, { status: 400 });
  const result = await testRule(
    {
      id: 0,
      categoryId,
      namePattern: typeof f.namePattern === "string" && f.namePattern.trim() ? f.namePattern.trim() : null,
      nameWildcard: !!f.nameWildcard,
      nameWholeWord: !!f.nameWholeWord,
      amount: num(f.amount),
      amountMin: num(f.amountMin),
      amountMax: num(f.amountMax),
      direction: f.direction === "income" || f.direction === "expense" ? f.direction : null,
      bankId: num(f.bankId),
      createdAt: null,
    },
    num(body?.ruleId),
  );
  return NextResponse.json(result);
}
