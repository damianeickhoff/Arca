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

// Two levels (src/lib/category-groups-migration.ts): groups are top level and hold
// categories; every category sits in a group. A category's colour and kind (spending,
// income, savings) come from its group.

const KINDS = new Set(["", "income", "savings"]);

async function findGroup(groupId: unknown) {
  if (typeof groupId !== "number") return null;
  const [group] = await db.select().from(categories).where(eq(categories.id, groupId));
  return group?.isGroup ? group : null;
}

/** Only the fields a caller may set; isDefault and isGroup are never taken from a body. */
function editable(body: Record<string, unknown>) {
  const out: Partial<typeof categories.$inferInsert> = {};
  if (typeof body.name === "string") out.name = body.name.trim();
  if ("budgetType" in body) out.budgetType = (body.budgetType as string | null) ?? null;
  if ("icon" in body) out.icon = (body.icon as string | null) ?? null;
  if ("color" in body) out.color = (body.color as string | null) ?? null;
  if (typeof body.group === "string" && KINDS.has(body.group)) out.group = body.group;
  if (typeof body.excludeFromSpendingRow === "boolean") out.excludeFromSpendingRow = body.excludeFromSpendingRow;
  return out;
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const data = editable(body);
  if (!data.name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  // A new group.
  if (body.isGroup === true) {
    const [row] = await db.insert(categories).values({ ...data, name: data.name, group: data.group ?? "", isGroup: true, parentCategoryId: null, isDefault: false }).returning();
    return NextResponse.json(row, { status: 201 });
  }

  // A new category, always inside a group: it takes the group's colour and, unless
  // given one, its kind.
  const group = await findGroup(body.parentCategoryId);
  if (!group) return NextResponse.json({ error: "Pick the group this category belongs to" }, { status: 400 });
  const [row] = await db
    .insert(categories)
    .values({ ...data, name: data.name, group: data.group ?? group.group, color: group.color, parentCategoryId: group.id, isGroup: false, isDefault: false })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  // Bulk update: { ids: number[], ...data } — plain fields only (e.g. hiding categories
  // from the spending row); moving between groups goes one at a time.
  if (Array.isArray(body.ids)) {
    const data = editable(body);
    delete data.color;
    delete data.group;
    await db.update(categories).set(data).where(inArray(categories.id, body.ids));
    return NextResponse.json({ updated: body.ids.length });
  }

  const [current] = await db.select().from(categories).where(eq(categories.id, body.id));
  if (!current) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  const data = editable(body);

  if (current.isGroup) {
    // A group's colour and kind are its categories' too.
    const row = db.transaction((tx) => {
      const [updated] = tx.update(categories).set(data).where(eq(categories.id, current.id)).returning().all();
      const forChildren: Partial<typeof categories.$inferInsert> = {};
      if ("color" in data) forChildren.color = data.color;
      if ("group" in data) forChildren.group = data.group;
      if (Object.keys(forChildren).length > 0) tx.update(categories).set(forChildren).where(eq(categories.parentCategoryId, current.id)).run();
      return updated;
    });
    return NextResponse.json(row);
  }

  // A category: its colour always follows its group; moving it adopts the new group's.
  delete data.color;
  const groupId = "parentCategoryId" in body ? body.parentCategoryId : current.parentCategoryId;
  const group = await findGroup(groupId);
  if (!group) return NextResponse.json({ error: "Pick the group this category belongs to" }, { status: 400 });
  const moved = group.id !== current.parentCategoryId;
  const [row] = await db
    .update(categories)
    .set({ ...data, parentCategoryId: group.id, color: group.color, ...(moved && !("group" in data) ? { group: group.group } : {}) })
    .where(eq(categories.id, current.id))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();

  // A group can only go once it's empty: its categories move or go first.
  const [child] = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentCategoryId, id));
  if (child) return NextResponse.json({ error: "Move or delete this group's categories first" }, { status: 400 });

  // Default categories are user-owned once seeded (src/lib/config-sync.ts), so they
  // can be deleted like any other. Removing one does not resurrect it unless
  // src/config/categories.ts itself changes (which re-runs the seed).

  // Existing databases may not have cascading foreign keys on every
  // category reference yet, so remove dependent rows explicitly first.
  db.transaction((tx) => {
    tx.delete(categoryRules).where(eq(categoryRules.categoryId, id)).run();
    tx.delete(budgetTargets).where(eq(budgetTargets.categoryId, id)).run();
    tx.delete(recurringItems).where(eq(recurringItems.categoryId, id)).run();
    tx.update(transactionSplits).set({ categoryId: null }).where(eq(transactionSplits.categoryId, id)).run();
    tx.delete(transactions).where(eq(transactions.categoryId, id)).run();
    tx.delete(categories).where(eq(categories.id, id)).run();
  });

  return NextResponse.json({ ok: true });
}
