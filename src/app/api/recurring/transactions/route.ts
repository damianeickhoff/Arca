import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, banks, categories } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";

// Recent transactions linked to a recurring item (transactions.recurringItemId is set
// by src/lib/recurring-match.ts when a transaction matches the item's pattern). Powers
// the "linked transactions" list in the recurrence detail dialog. Selects the full set
// of fields TransactionDetail expects so a row can be tapped to open the same
// TransactionDetailDialog used elsewhere in the app, directly from that list.
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const itemId = Number(req.nextUrl.searchParams.get("itemId"));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "Missing or invalid itemId" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
      account: transactions.account,
      bankName: banks.displayName,
      direction: transactions.direction,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryBudgetType: categories.budgetType,
      budgetTypeOverride: transactions.budgetTypeOverride,
      brandIcon: transactions.brandIcon,
      brandIconColor: transactions.brandIconColor,
      brandIconBgColor: transactions.brandIconBgColor,
      notes: transactions.notes,
      customName: transactions.customName,
      receiptUrl: transactions.receiptUrl,
      goalId: transactions.goalId,
      excludeFromReports: transactions.excludeFromReports,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
      transferType: effectiveTransferTypeExpr,
      recurringItemId: transactions.recurringItemId,
    })
    .from(transactions)
    .leftJoin(banks, eq(transactions.account, banks.accountNumber))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.recurringItemId, itemId))
    .orderBy(desc(transactions.date))
    .limit(30);

  return NextResponse.json(rows);
}
