import { db } from "@/db";
import { transactions, categories, banks, goals, merchants, recurringItems } from "@/db/schema";
import { eq, and, gte, lte, desc, like, or, sql, asc, isNotNull, inArray } from "drizzle-orm";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";
import { currentFinancialMonth } from "@/lib/date-range";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getBillStatuses, UPCOMING_TYPES } from "@/lib/bill-status";
import { billsDueTotal } from "@/lib/bill-amounts";
import { normalizeBudgetType } from "@/lib/format";
import { PageShell } from "@/components/page-container";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { IconChevronRight } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { getNeedsReviewTransactions } from "@/lib/needs-review";
import { NeedsReviewLink } from "@/app/_home/home-sections";
import { ActivityHeader, ActivityView, type ActivityFilters } from "./_activity/activity-view";
import { ALL_FROM, todayStr } from "./periods";
import {
  buildSplitAllocations,
  getDisplayedTransactionCategory,
  groupTransactionSplits,
} from "@/lib/transaction-splits";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";

type SortField = "date" | "description" | "amount" | "category" | "bank";
type SortDir = "asc" | "desc";

async function getTransactions(
  from?: string,
  to?: string,
  direction?: string,
  search?: string,
  accounts?: string[],
  sort?: string,
  dir?: string,
  ignoreDateFilter?: boolean,
  recurring?: boolean,
  min?: number,
  max?: number,
) {
  const conditions = [];
  // While searching we deliberately look across every date so results aren't hidden
  // by the active month/date filter.
  if (from && !ignoreDateFilter) conditions.push(gte(transactions.date, from));
  if (to && !ignoreDateFilter) conditions.push(lte(transactions.date, to));
  if (direction) conditions.push(eq(transactions.direction, direction as "income" | "expense"));
  if (search) conditions.push(or(
    like(transactions.description, `%${search}%`),
    like(sql`CAST(${transactions.amount} AS TEXT)`, `%${search}%`),
    like(categories.name, `%${search}%`),
  )!);
  if (accounts && accounts.length > 0) conditions.push(inArray(transactions.account, accounts));
  if (recurring) conditions.push(isNotNull(transactions.recurringItemId));
  // Sum range is sign-agnostic — it matches the magnitude of the operation, letting the
  // separate transaction-type filter decide the sign.
  if (min != null) conditions.push(gte(sql`ABS(${transactions.amount})`, min));
  if (max != null) conditions.push(lte(sql`ABS(${transactions.amount})`, max));

  const sortField = (sort as SortField | undefined) ?? "date";
  const sortDir: SortDir = dir === "asc" ? "asc" : "desc";
  const orderFn = sortDir === "asc" ? asc : desc;

  const sortExpr = {
    date: transactions.date,
    description: transactions.description,
    amount: transactions.amount,
    category: categories.name,
    bank: banks.displayName,
  }[sortField] ?? transactions.date;

  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      type: transactions.type,
      amount: transactions.amount,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryBudgetType: categories.budgetType,
      brandIcon: transactions.brandIcon,
      brandIconColor: transactions.brandIconColor,
      brandIconBgColor: transactions.brandIconBgColor,
      source: transactions.source,
      correctedAmount: transactions.correctedAmount,
      isReimbursement: transactions.isReimbursement,
      isManualTransfer: transactions.isManualTransfer,
      isInternalTransfer: isInternalTransferExpr,
      transferType: effectiveTransferTypeExpr,
      categoryGroup: categories.group,
      bankName: banks.displayName,
      notes: transactions.notes,
      customName: transactions.customName,
      receiptUrl: transactions.receiptUrl,
      excludeFromReports: transactions.excludeFromReports,
      budgetTypeOverride: transactions.budgetTypeOverride,
      goalId: transactions.goalId,
      recurringItemId: transactions.recurringItemId,
      recurringName: recurringItems.name,
      recurringFriendlyName: recurringItems.friendlyName,
      merchantIcon: merchants.icon,
      merchantColor: merchants.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(banks, eq(transactions.account, banks.accountNumber))
    .leftJoin(recurringItems, eq(transactions.recurringItemId, recurringItems.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(orderFn(sortExpr), desc(transactions.id));
}

async function getCategories() {
  return db.select().from(categories).orderBy(categories.group, categories.name);
}

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string; direction?: string; category?: string; search?: string; limit?: string; view?: string; account?: string; sort?: string; dir?: string; budgetType?: string; recurring?: string; min?: string; max?: string }>;
}) {
  const sp = await searchParams;
  const financialMonth = await getFinancialMonthConfig();
  // Transactions default to the full history ("All"). Unlike other pages we deliberately
  // do NOT inherit the date_from/date_to or selected_bank cookies here — otherwise the page
  // would silently open on a range/account the user never picked from this filter.
  const from = sp.from ?? ALL_FROM;
  const to = sp.to ?? todayStr();
  const { direction, category, search } = sp;
  const account = sp.account ?? undefined;
  const accountList = account ? account.split(",").filter(Boolean) : [];
  const sort = sp.sort;
  const dir = sp.dir;
  const budgetType = sp.budgetType ? normalizeBudgetType(sp.budgetType) : undefined;
  const recurring = sp.recurring === "1";
  const min = sp.min != null && sp.min !== "" ? Number(sp.min) : undefined;
  const max = sp.max != null && sp.max !== "" ? Number(sp.max) : undefined;

  // Searching always spans every date, regardless of the active date filter.
  const searchAll = !!search;
  const limit = Math.max(50, parseInt(sp.limit ?? "50"));

  // Categories are a comma-separated list of ids, or the literal "none" for uncategorized.
  const categoryIds = category === "none" ? "none" : category ? category.split(",").filter(Boolean).map(Number) : [];

  const upcomingMonth = currentFinancialMonth(financialMonth);

  const [rows, cats, allBanks, savingsGoalOptions, billStatuses, needsReview] = await Promise.all([
    getTransactions(from, to, direction, search, accountList, sort, dir, searchAll, recurring, min, max),
    getCategories(),
    db.select().from(banks).orderBy(asc(banks.displayName), asc(banks.accountNumber)),
    db.select().from(goals).where(and(eq(goals.goalType, "savings"), eq(goals.active, true))).orderBy(asc(goals.name)),
    getBillStatuses(upcomingMonth, financialMonth, UPCOMING_TYPES),
    getNeedsReviewTransactions(),
  ]);

  // Upcoming = active recurring items with a due date this financial month that haven't
  // been paid yet. Items without a due date are excluded.
  const upcomingStatuses = billStatuses
    .filter((s) => s.dueDate != null && s.paid !== true)
    .sort((a, z) => (a.dueDate! < z.dueDate! ? -1 : 1));
  const upcomingCount = upcomingStatuses.length;
  // Expenses only — upcoming income belongs on the calendar, not in the amount due.
  const upcomingTotal = billsDueTotal(
    upcomingStatuses.map((s) => ({ amount: s.item.amount, isIncome: s.item.type === "income" })),
  );
  // Icons for the first few upcoming bills, previewed on the summary card.
  const upcomingIcons = upcomingStatuses.slice(0, 3).map((s) => ({
    icon: s.icon,
    iconColor: s.iconColor,
    iconBackground: s.iconBackground,
  }));

  const splitRows = await getTransactionSplitRows(rows.map((row) => row.id));

  const splitMap = groupTransactionSplits(splitRows);

  const preparedRows = rows.map((row) => {
    const splits = splitMap.get(row.id) ?? [];
    return {
      ...row,
      ...getDisplayedTransactionCategory(row, splits),
      splits,
    };
  });

  // Filtering by a parent category also matches every transaction in its sub-categories.
  // Any number of categories can be selected at once — a transaction matches if it (or
  // one of its splits) falls under any of them.
  const rollupIds = Array.isArray(categoryIds) && categoryIds.length > 0
    ? new Set<number>(categoryIds.flatMap((id) => [id, ...cats.filter((c) => c.parentCategoryId === id).map((c) => c.id)]))
    : null;

  // Budget type is derived (transaction override wins, else the category's budget type).
  // A per-category map lets split rows match if any of their split categories qualify.
  const catBudgetTypeById = new Map(cats.map((c) => [c.id, normalizeBudgetType(c.budgetType)]));
  function rowMatchesBudgetType(row: (typeof preparedRows)[number]): boolean {
    if (!budgetType) return true;
    if (row.budgetTypeOverride) return normalizeBudgetType(row.budgetTypeOverride) === budgetType;
    if (row.splits.length > 0) {
      return row.splits.some((split) => split.categoryId != null && catBudgetTypeById.get(split.categoryId) === budgetType);
    }
    return row.categoryId != null && catBudgetTypeById.get(row.categoryId) === budgetType;
  }

  const filteredRows = preparedRows.filter((row) => {
    if (!rowMatchesBudgetType(row)) return false;
    if (categoryIds === "none") return !row.isInternalTransfer && row.splits.length === 0 && row.categoryId == null;
    if (rollupIds) {
      return row.splits.length > 0
        ? row.splits.some((split) => split.categoryId != null && rollupIds.has(split.categoryId))
        : row.categoryId != null && rollupIds.has(row.categoryId);
    }
    return true;
  });

  const visibleRows = filteredRows.slice(0, limit);
  // Totals must reflect every filtered transaction, not just the page currently shown —
  // the "show more" limit only affects which rows render, not the summary figures.
  const allocationRows = buildSplitAllocations(filteredRows, splitMap);

  const income = allocationRows
    .filter((row) => row.direction === "income" && !row.isReimbursement && !row.isInternalTransfer && row.categoryGroup !== "savings")
    .reduce((sum, row) => sum + row.amount, 0);
  const expense = allocationRows
    .filter((row) => row.direction === "expense" && !row.isInternalTransfer && row.categoryGroup !== "savings")
    .reduce((sum, row) => sum + row.amount, 0);

  // "Show more" link — bumps the row limit by 50 while keeping every other filter intact.
  const showMoreHref = (() => {
    const next = new URLSearchParams();
    next.set("from", from);
    next.set("to", to);
    if (direction) next.set("direction", direction);
    if (category) next.set("category", category);
    if (search) next.set("search", search);
    if (account) next.set("account", account);
    if (sp.budgetType) next.set("budgetType", sp.budgetType);
    if (recurring) next.set("recurring", "1");
    if (min != null) next.set("min", String(min));
    if (max != null) next.set("max", String(max));
    next.set("limit", String(limit + 50));
    return `?${next.toString()}`;
  })();
  const hasMore = filteredRows.length > visibleRows.length;

  // Sparkline: the running net (in − out) across the filtered rows, oldest first,
  // thinned to at most 60 points so an all-time range stays a readable line.
  const netByDate = new Map<string, number>();
  for (const a of allocationRows) {
    if (a.isInternalTransfer || a.categoryGroup === "savings") continue;
    if (a.direction === "income" && a.isReimbursement) continue;
    netByDate.set(a.date, (netByDate.get(a.date) ?? 0) + (a.direction === "income" ? a.amount : -a.amount));
  }
  const running: number[] = [];
  let acc = 0;
  for (const date of [...netByDate.keys()].sort()) {
    acc += netByDate.get(date)!;
    running.push(acc);
  }
  const step = Math.max(1, Math.ceil(running.length / 60));
  const sparkline = running.filter((_, i) => i % step === 0 || i === running.length - 1);

  const t = await getTranslations("activity");
  const filters: ActivityFilters = {
    cats,
    banks: allBanks,
    from,
    to,
    financialMonth,
    direction,
    category,
    account,
    budgetType: sp.budgetType,
    recurring,
    search,
    min: sp.min,
    max: sp.max,
  };

  // Entry points into the Upcoming calendar and the Needs review queue, in the new style.
  const upcomingSlot =
    upcomingCount > 0 ? (
      <Link
        href="/transactions/upcoming"
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card transition-colors hover:bg-surface-2"
      >
        {upcomingIcons.length > 0 && (
          <span className="flex shrink-0 -space-x-2.5">
            {upcomingIcons.map((u, i) => (
              <span key={i} className="rounded-full ring-2 ring-surface" style={{ zIndex: upcomingIcons.length - i }}>
                <Icon iconKey={u.icon} color={u.iconColor} background={u.iconBackground} size="sm" round />
              </span>
            ))}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-bold text-ink">{t("upcoming.title", { count: upcomingCount })}</span>
          <span className="text-xs text-ink-3">{t("upcoming.due", { amount: formatEur(upcomingTotal) })}</span>
        </span>
        <IconChevronRight size={16} stroke={1.8} className="shrink-0 text-ink-3" />
      </Link>
    ) : null;
  const needsReviewSlot = needsReview.length > 0 ? <NeedsReviewLink count={needsReview.length} /> : null;

  return (
    <PageShell
      header={<ActivityHeader accountCount={allBanks.length} needsReviewCount={needsReview.length} filters={filters} />}
      bodyClassName="pt-3 lg:pt-1"
    >
      <ActivityView
        filters={filters}
        categories={cats}
        savingsGoals={savingsGoalOptions}
        rows={visibleRows}
        filteredCount={filteredRows.length}
        income={income}
        expense={expense}
        sparkline={sparkline}
        showMoreHref={showMoreHref}
        hasMore={hasMore}
        upcomingSlot={upcomingSlot}
        needsReviewSlot={needsReviewSlot}
      />
    </PageShell>
  );
}
