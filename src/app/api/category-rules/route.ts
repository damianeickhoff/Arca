import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, categoryRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { recordActivity, selectRowsByIds, snapshotDelete } from "@/lib/activity-log";
import { ruleCreatedEntry, ruleDeletedEntry } from "@/lib/activity-log-entries";

async function categoryName(id: unknown): Promise<string | null> {
  if (typeof id !== "number") return null;
  const [row] = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, id));
  return row?.name ?? null;
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const rows = categoryId
    ? await db.select().from(categoryRules).where(eq(categoryRules.categoryId, parseInt(categoryId)))
    : await db.select().from(categoryRules);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const [row] = await db.insert(categoryRules).values(body).returning();
  const [stored] = selectRowsByIds("category_rules", [row.id]);
  if (stored) await recordActivity(ruleCreatedEntry(stored, await categoryName(row.categoryId)));
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, ...data } = await req.json();
  const [row] = await db.update(categoryRules).set(data).where(eq(categoryRules.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();
  const [rule] = typeof id === "number" ? await db.select({ categoryId: categoryRules.categoryId }).from(categoryRules).where(eq(categoryRules.id, id)) : [];
  // The rule as it was, so the change log can put it back.
  const snapshot = rule ? snapshotDelete("category_rules", [id]) : null;
  await db.delete(categoryRules).where(eq(categoryRules.id, id));
  if (snapshot && rule) await recordActivity(ruleDeletedEntry(snapshot, await categoryName(rule.categoryId)));
  return NextResponse.json({ ok: true });
}
