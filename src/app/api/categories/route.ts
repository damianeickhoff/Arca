import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { budgetTargets, categories, categoryRules, recurringItems, transactions, transactionSplits } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db.select().from(categories).orderBy(asc(categories.name));
  return NextResponse.json(rows);
}

// Nesting is capped at 2 levels: a category can only become a parent if it doesn't
// itself have a parent. Returns an error string, or null if the parent is valid.
async function validateParent(parentCategoryId: unknown, selfId?: number): Promise<string | null> {
  if (parentCategoryId === null || parentCategoryId === undefined) return null;
  if (parentCategoryId === selfId) return "A category cannot be its own parent";
  const [parent] = await db.select({ id: categories.id, parentCategoryId: categories.parentCategoryId }).from(categories).where(eq(categories.id, parentCategoryId as number));
  if (!parent) return "Parent category not found";
  if (parent.parentCategoryId !== null) return "Parent category can't itself have a parent (max 2 levels)";
  if (selfId !== undefined) {
    const [child] = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentCategoryId, selfId));
    if (child) return "This category already has sub-categories, so it can't be nested under another one (max 2 levels)";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  if (!body.group) body.group = "";
  const parentError = await validateParent(body.parentCategoryId);
  if (parentError) return NextResponse.json({ error: parentError }, { status: 400 });
  // Categories created through the UI are always custom, never default.
  const [row] = await db.insert(categories).values({ ...body, isDefault: false }).returning();
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  // Bulk update: { ids: number[], ...data }
  // Default categories are seeded once (see src/lib/config-sync.ts) and are then
  // user-owned — fully editable through the UI — so isDefault is stripped but no
  // longer gates the update.
  if (Array.isArray(body.ids)) {
    const { ids, isDefault, ...data } = body;
    void isDefault;
    if ("parentCategoryId" in data) {
      const parentError = await validateParent(data.parentCategoryId);
      if (parentError) return NextResponse.json({ error: parentError }, { status: 400 });
    }
    await db.update(categories).set(data).where(inArray(categories.id, ids));
    return NextResponse.json({ updated: ids.length });
  }
  const { id, isDefault, ...data } = body;
  void isDefault;
  if ("parentCategoryId" in data) {
    const parentError = await validateParent(data.parentCategoryId, id);
    if (parentError) return NextResponse.json({ error: parentError }, { status: 400 });
  }
  const [row] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();

  // Default categories are user-owned once seeded (src/lib/config-sync.ts), so they
  // can be deleted like any other. Removing one does not resurrect it unless
  // src/config/categories.ts itself changes (which re-runs the seed).

  // Existing databases may not have cascading foreign keys on every
  // category reference yet, so remove dependent rows explicitly first.
  db.transaction((tx) => {
    tx.update(categories).set({ parentCategoryId: null }).where(eq(categories.parentCategoryId, id)).run();
    tx.delete(categoryRules).where(eq(categoryRules.categoryId, id)).run();
    tx.delete(budgetTargets).where(eq(budgetTargets.categoryId, id)).run();
    tx.delete(recurringItems).where(eq(recurringItems.categoryId, id)).run();
    tx.update(transactionSplits).set({ categoryId: null }).where(eq(transactionSplits.categoryId, id)).run();
    tx.delete(transactions).where(eq(transactions.categoryId, id)).run();
    tx.delete(categories).where(eq(categories.id, id)).run();
  });

  return NextResponse.json({ ok: true });
}
