import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { transactions, categories, transactionSplits } from "@/db/schema";
import { eq, desc, and, gte, lte, inArray, like } from "drizzle-orm";
import { amountsMatch, getTransactionSplitTotal, roundToCents } from "@/lib/transaction-splits";
import { requireAuth } from "@/lib/auth";
import { adjustGoalAmount, goalDeltaForTransaction } from "@/lib/goal-contributions";
import { resolveMerchantIdFor } from "@/lib/merchants";
import { recordActivity, selectRowsByIds } from "@/lib/activity-log";
import { bulkCategoryMoveEntry, type ActivityEntryInput } from "@/lib/activity-log-entries";
import { isValidISODate } from "@/lib/date-valid";

// The columns a client may set. Everything else in a request body is dropped, so a body
// can never touch `id`, `importHash`, `reportedBalance` or `createdAt`.
const WRITABLE_FIELDS = [
  "date",
  "direction",
  "type",
  "amount",
  "correctedAmount",
  "description",
  "rawDescription",
  "categoryId",
  "merchantId",
  "manuallyCategorized",
  "source",
  "account",
  "counterAccount",
  "brandIcon",
  "brandIconColor",
  "brandIconBgColor",
  "notes",
  "customName",
  "budgetTypeOverride",
  "isManualTransfer",
  "isReimbursement",
  "excludeFromReports",
  "expectedReimbursement",
  "sharedWithCount",
  "receiptUrl",
  "goalId",
  "recurringItemId",
  "transferType",
] as const;

type WritableField = (typeof WRITABLE_FIELDS)[number];
type TransactionPatch = Partial<Pick<typeof transactions.$inferInsert, WritableField>>;

/** Keeps only the writable columns of a request body; `null` means "unknown body". */
function pickWritable(body: unknown): TransactionPatch | null {
  if (!body || typeof body !== "object") return null;
  const source = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const field of WRITABLE_FIELDS) {
    if (source[field] !== undefined) data[field] = source[field];
  }
  if (data.date !== undefined && !isValidISODate(typeof data.date === "string" ? data.date : null)) {
    throw new Error("Invalid date.");
  }
  return data as TransactionPatch;
}

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map(parseId);
  return ids.every((id): id is number => id !== null) ? ids : null;
}

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
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  let data: TransactionPatch;
  try {
    data = pickWritable(body) ?? {};
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid body." }, { status: 400 });
  }

  if (body.id !== undefined && body.splits !== undefined) {
    const id = parseId(body.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const [transaction] = await db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
      })
      .from(transactions)
      .where(eq(transactions.id, id))
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

    await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
    if (parsed.splits.length > 0) {
      await db.insert(transactionSplits).values(
        parsed.splits.map((split) => ({
          transactionId: id,
          amount: split.amount,
          categoryId: split.categoryId,
          position: split.position,
        })),
      );
    }

    // The split dialog saves its shared-cost section in the same request.
    const shared =
      data.sharedWithCount !== undefined
        ? { sharedWithCount: data.sharedWithCount ?? null, expectedReimbursement: data.expectedReimbursement ?? null }
        : {};
    const [row] = await db
      .update(transactions)
      .set({ manuallyCategorized: parsed.splits.length > 0, ...shared })
      .where(eq(transactions.id, id))
      .returning();

    return NextResponse.json(row);
  }

  // Bulk update by ids array: { ids: number[], ...data }
  if (Array.isArray(body.ids)) {
    const ids = parseIds(body.ids);
    if (ids === null) return NextResponse.json({ error: "Invalid ids." }, { status: 400 });
    const byRule = body.byRule;
    if (ids.length === 0) return NextResponse.json({ updated: 0 });
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    // A category move goes in the change log: each row's previous category and manual
    // flag, and the splits the move removes.
    let moveEntry: ActivityEntryInput | null = null;
    if (data.categoryId !== undefined) {
      const before = selectRowsByIds("transactions", ids).map((r) => ({ id: Number(r.id), category_id: r.category_id, manually_categorized: r.manually_categorized }));
      const splitIds = (await db.select({ id: transactionSplits.id }).from(transactionSplits).where(inArray(transactionSplits.transactionId, ids))).map((s) => s.id);
      const [category] = typeof data.categoryId === "number" ? await db.select({ name: categories.name }).from(categories).where(eq(categories.id, data.categoryId)) : [];
      moveEntry = bulkCategoryMoveEntry(before, data.categoryId ?? null, category?.name ?? null, selectRowsByIds("transaction_splits", splitIds));
      // A category set by hand is manual; one a rule just filed (byRule) is not, so the
      // rules pass may move it again and deleting the rule can offer to revert it.
      data.manuallyCategorized = byRule !== true;
      await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, ids));
    }
    const result = await db
      .update(transactions)
      .set(data)
      .where(inArray(transactions.id, ids))
      .returning({ id: transactions.id });
    const activityId = await recordActivity(moveEntry);
    return NextResponse.json({ updated: result.length, activityId });
  }

  // Bulk update by description: { description, categoryId, matchType? }
  if (body.description !== undefined && body.id === undefined) {
    const { description, categoryId } = data;
    const matchType = body.matchType ?? "exact";
    if (typeof description !== "string" || (categoryId !== null && parseId(categoryId) === null)) {
      return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    }
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
  const id = parseId(body.id);
  if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
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

  let data: TransactionPatch | null;
  try {
    data = pickWritable(await req.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid body." }, { status: 400 });
  }
  if (!data || !isValidISODate(data.date) || typeof data.description !== "string" || typeof data.amount !== "number" || !Number.isFinite(data.amount)) {
    return NextResponse.json({ error: "date, description and amount are required." }, { status: 400 });
  }
  if (data.direction !== "expense" && data.direction !== "income") {
    return NextResponse.json({ error: "direction must be expense or income." }, { status: 400 });
  }
  if (typeof data.type !== "string" || !data.type) {
    return NextResponse.json({ error: "type is required." }, { status: 400 });
  }
  // Derive the merchant unless the caller already picked one explicitly.
  if (data.merchantId === undefined) {
    data.merchantId = await resolveMerchantIdFor({ description: data.description, rawDescription: data.rawDescription });
  }
  const [row] = await db
    .insert(transactions)
    .values({ ...data, date: data.date, description: data.description, amount: data.amount, direction: data.direction, type: data.type })
    .returning();
  if (row.goalId) {
    await adjustGoalAmount(row.goalId, goalDeltaForTransaction(row.direction, getTransactionSplitTotal(row.amount, row.correctedAmount)));
  }
  // The sidebar's account balances (root layout) include this row now.
  revalidatePath("/", "layout");
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
    const ids = parseIds(body.ids);
    if (ids === null) return NextResponse.json({ error: "Invalid ids." }, { status: 400 });
    if (ids.length === 0) return NextResponse.json({ ok: true });
    await reverseGoalContributions(ids);
    await db.delete(transactions).where(inArray(transactions.id, ids));
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  }
  const id = parseId(body.id);
  if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  await reverseGoalContributions([id]);
  await db.delete(transactions).where(eq(transactions.id, id));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
