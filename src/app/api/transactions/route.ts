import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories, transactionSplits } from "@/db/schema";
import { eq, desc, and, gte, lte, inArray, like } from "drizzle-orm";
import { amountsMatch, getTransactionSplitTotal, roundToCents } from "@/lib/transaction-splits";
import { applyAllBrandRules } from "@/lib/apply-brand-rules";
import { requireAuth } from "@/lib/auth";
import { adjustGoalAmount, goalDeltaForTransaction } from "@/lib/goal-contributions";

function parseSplitPayload(input: unknown, expectedTotal: number) {
  if (!Array.isArray(input)) {
    return { error: "Invalid split payload." };
  }

  if (input.length === 0) {
    return { splits: [] as Array<{ amount: number; categoryId: number; position: number }> };
  }

  if (input.length < 2) {
    return { error: "A split must consist of at least 2 shares." };
  }

  const splits = input.map((entry, index) => {
    const amount = roundToCents(Number((entry as { amount?: unknown }).amount));
    const categoryId = Number((entry as { categoryId?: unknown }).categoryId);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Split ${index + 1} heeft een ongeldig bedrag.`);
    }

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw new Error(`Split ${index + 1} mist een categorie.`);
    }

    return { amount, categoryId, position: index };
  });

  const splitTotal = roundToCents(splits.reduce((sum, split) => sum + split.amount, 0));
  if (!amountsMatch(splitTotal, expectedTotal)) {
    return { error: "The sum of all splits must equal the transaction total." };
  }

  return { splits };
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();

  if (body.id !== undefined && body.splits !== undefined) {
    const [transaction] = await db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
      })
      .from(transactions)
      .where(eq(transactions.id, body.id))
      .limit(1);

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    let parsed;
    try {
      parsed = parseSplitPayload(body.splits, getTransactionSplitTotal(transaction.amount, transaction.correctedAmount));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid split." }, { status: 400 });
    }

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, body.id));
    if (parsed.splits.length > 0) {
      await db.insert(transactionSplits).values(
        parsed.splits.map((split) => ({
          transactionId: body.id,
          amount: split.amount,
          categoryId: split.categoryId,
          position: split.position,
        })),
      );
    }

    const [row] = await db
      .update(transactions)
      .set({ manuallyCategorized: parsed.splits.length > 0 })
      .where(eq(transactions.id, body.id))
      .returning();

    return NextResponse.json(row);
  }

  // Bulk update by ids array: { ids: number[], ...data }
  if (Array.isArray(body.ids)) {
    const { ids, ...data } = body;
    if (ids.length === 0) return NextResponse.json({ updated: 0 });
    if (data.categoryId !== undefined) {
      data.manuallyCategorized = true;
      await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, ids));
    }
    const result = await db
      .update(transactions)
      .set(data)
      .where(inArray(transactions.id, ids))
      .returning({ id: transactions.id });
    return NextResponse.json({ updated: result.length });
  }

  // Bulk update by description: { description, categoryId, matchType? }
  if (body.description !== undefined && body.id === undefined) {
    const { description, categoryId, matchType = "exact" } = body;
    const whereClause = matchType === "contains"
      ? like(transactions.description, `%${description}%`)
      : eq(transactions.description, description);
    const matchingRows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(whereClause);
    const ids = matchingRows.map((row) => row.id);
    if (ids.length > 0) {
      await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, ids));
    }
    const result = await db
      .update(transactions)
      .set({ categoryId, manuallyCategorized: true })
      .where(whereClause)
      .returning({ id: transactions.id });
    return NextResponse.json({ updated: result.length });
  }

  // Single update by id — mark as manually categorized when categoryId is being set
  const { id, ...data } = body;
  if (data.categoryId !== undefined) {
    data.manuallyCategorized = true;
    await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
  }

  // If this transaction is (or was) linked to a savings goal, reverse its old
  // contribution before the update and re-apply against the post-update values —
  // covers goalId changing, amount/correctedAmount changing, or direction changing.
  const [existing] = await db
    .select({
      goalId: transactions.goalId,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      direction: transactions.direction,
    })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);

  const [row] = await db.update(transactions).set(data).where(eq(transactions.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  if (existing?.goalId) {
    await adjustGoalAmount(existing.goalId, -goalDeltaForTransaction(existing.direction, getTransactionSplitTotal(existing.amount, existing.correctedAmount)));
  }
  if (row.goalId) {
    await adjustGoalAmount(row.goalId, goalDeltaForTransaction(row.direction, getTransactionSplitTotal(row.amount, row.correctedAmount)));
  }

  return NextResponse.json(row);
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month"); // YYYY-MM
  const direction = searchParams.get("direction"); // income | expense
  const limit = parseInt(searchParams.get("limit") ?? "200");

  const conditions = [];
  if (month) {
    conditions.push(gte(transactions.date, `${month}-01`));
    conditions.push(lte(transactions.date, `${month}-31`));
  }
  if (direction) {
    conditions.push(eq(transactions.direction, direction));
  }

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      type: transactions.type,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      description: transactions.description,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryGroup: categories.group,
      source: transactions.source,
      notes: transactions.notes,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date))
    .limit(limit);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const [row] = await db.insert(transactions).values(body).returning();
  if (row.goalId) {
    await adjustGoalAmount(row.goalId, goalDeltaForTransaction(row.direction, getTransactionSplitTotal(row.amount, row.correctedAmount)));
  }
  await applyAllBrandRules();
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();

  async function reverseGoalContributions(ids: number[]) {
    if (ids.length === 0) return;
    const linked = await db
      .select({
        goalId: transactions.goalId,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        direction: transactions.direction,
      })
      .from(transactions)
      .where(inArray(transactions.id, ids));
    for (const t of linked) {
      if (!t.goalId) continue;
      await adjustGoalAmount(t.goalId, -goalDeltaForTransaction(t.direction, getTransactionSplitTotal(t.amount, t.correctedAmount)));
    }
  }

  if (Array.isArray(body.ids)) {
    if (body.ids.length === 0) return NextResponse.json({ ok: true });
    await reverseGoalContributions(body.ids);
    await db.delete(transactions).where(inArray(transactions.id, body.ids));
    return NextResponse.json({ ok: true });
  }
  await reverseGoalContributions([body.id]);
  await db.delete(transactions).where(eq(transactions.id, body.id));
  return NextResponse.json({ ok: true });
}
