import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, categoryRules, transactions } from "@/db/schema";
import type { CategoryRule } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { findRuleInOtherCategory, type RuleConditions } from "@/lib/rule-identity";
import { filedByRule, findRuleMatches } from "@/lib/rule-matches";

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const rows = categoryId
    ? await db.select().from(categoryRules).where(eq(categoryRules.categoryId, parseInt(categoryId)))
    : await db.select().from(categoryRules);
  return NextResponse.json(rows);
}

/**
 * The same rule in another category, as a 409 the client turns into "This rule already
 * files under A. Move it to B?". Two rules with every condition equal can never both
 * work (the first match wins), so saving one moves it — but only when the client sends
 * `move: true`, after asking. Null when there's no such rule.
 */
async function conflict(rule: RuleConditions, categoryId: number, exceptId: number | null) {
  const existing = findRuleInOtherCategory(await db.select().from(categoryRules), rule, categoryId, exceptId);
  if (!existing) return null;
  const named = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(inArray(categories.id, [existing.categoryId, categoryId]));
  const name = (id: number) => named.find((c) => c.id === id)?.name ?? "";
  return {
    existing,
    response: NextResponse.json(
      {
        error: "conflict",
        rule: existing,
        from: { id: existing.categoryId, name: name(existing.categoryId) },
        to: { id: categoryId, name: name(categoryId) },
      },
      { status: 409 },
    ),
  };
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { move, ...body } = await req.json();
  const clash = await conflict(body, body.categoryId, null);
  if (clash && !move) return clash.response;

  const row = db.transaction((tx) => {
    if (clash) tx.delete(categoryRules).where(eq(categoryRules.id, clash.existing.id)).run();
    return tx.insert(categoryRules).values(body).returning().get();
  });
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  // Changing a rule's conditions leaves the rows it filed under the old ones as they are:
  // the apply-rules pass only files on a match and never clears a category.
  const { id, move, ...data } = await req.json();
  const [current] = await db.select().from(categoryRules).where(eq(categoryRules.id, id));
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  const next = { ...current, ...data } as CategoryRule;
  const clash = await conflict(next, next.categoryId, id);
  if (clash && !move) return clash.response;

  const row = db.transaction((tx) => {
    if (clash) tx.delete(categoryRules).where(eq(categoryRules.id, clash.existing.id)).run();
    return tx.update(categoryRules).set(data).where(eq(categoryRules.id, id)).returning().get();
  });
  return NextResponse.json(row);
}

/**
 * Deletes a rule. The transactions it filed keep their category, unless `revert: true`:
 * then the ones it matches now that carry its category and weren't set by hand go back
 * to Needs review (no category). Hand-categorised rows are never touched.
 */
export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, revert } = await req.json();
  const [rule] = await db.select().from(categoryRules).where(eq(categoryRules.id, id));
  if (!rule) return NextResponse.json({ ok: true, reverted: 0 });

  const revertIds = revert ? filedByRule(await findRuleMatches(rule), rule.categoryId).map((r) => r.id) : [];
  db.transaction((tx) => {
    tx.delete(categoryRules).where(eq(categoryRules.id, id)).run();
    if (revertIds.length > 0) tx.update(transactions).set({ categoryId: null }).where(inArray(transactions.id, revertIds)).run();
  });
  return NextResponse.json({ ok: true, reverted: revertIds.length });
}
