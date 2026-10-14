export type TransactionSplitInput = {
  amount: number;
  categoryId: number | null;
};

export type TransactionSplitRow = {
  id: number;
  transactionId: number;
  amount: number;
  categoryId: number | null;
  position: number;
  categoryName?: string | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  categoryGroup?: string | null;
};

export type SplitAwareTransactionBase = {
  id: number;
  date: string;
  direction: string;
  amount: number;
  correctedAmount?: number | null;
  reimbursedAmount?: number;
  isReimbursement?: boolean;
  isInternalTransfer?: boolean;
  categoryId?: number | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  categoryGroup?: string | null;
};

export type SplitAwareAllocation = {
  transactionId: number;
  date: string;
  direction: string;
  amount: number;
  isReimbursement: boolean;
  isInternalTransfer: boolean;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  categoryGroup: string | null;
};

export function roundToCents(value: number) {
  return Math.round(value * 100) / 100;
}

export function amountsMatch(left: number, right: number) {
  return Math.abs(roundToCents(left) - roundToCents(right)) < 0.01;
}

export function getTransactionSplitTotal(amount: number, correctedAmount?: number | null) {
  return roundToCents(correctedAmount ?? amount);
}

export function allocateByCounts(total: number, counts: number[]) {
  const cleanCounts = counts.map((count) => Math.max(0, count));
  const totalCounts = cleanCounts.reduce((sum, count) => sum + count, 0);

  if (cleanCounts.length === 0) return [];
  if (totalCounts <= 0) return cleanCounts.map(() => 0);

  const totalCents = Math.round(roundToCents(total) * 100);
  const rawShares = cleanCounts.map((count) => (count / totalCounts) * totalCents);
  const baseShares = rawShares.map((share) => Math.floor(share));
  let remainder = totalCents - baseShares.reduce((sum, share) => sum + share, 0);

  const rankedRemainders = rawShares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((left, right) => right.remainder - left.remainder);

  for (let index = 0; index < rankedRemainders.length && remainder > 0; index++) {
    baseShares[rankedRemainders[index].index] += 1;
    remainder -= 1;
  }

  return baseShares.map((share) => share / 100);
}

export function groupTransactionSplits<T extends { transactionId: number; position?: number }>(rows: T[]) {
  const grouped = new Map<number, T[]>();

  for (const row of rows) {
    const existing = grouped.get(row.transactionId) ?? [];
    existing.push(row);
    grouped.set(row.transactionId, existing);
  }

  for (const [transactionId, splits] of grouped) {
    grouped.set(
      transactionId,
      [...splits].sort((left, right) => (left.position ?? 0) - (right.position ?? 0)),
    );
  }

  return grouped;
}

export function summarizeSplitCategories(names: Array<string | null | undefined>) {
  const uniqueNames = Array.from(
    new Set(
      names
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  );

  if (uniqueNames.length === 0) return "Onbekende categorie";
  return uniqueNames.join(" + ");
}

export type SplitAllocationOptions = {
  /** Subtract each expense's `reimbursedAmount` — the part someone else pays back — so
   *  spend reflects your own share. Off by default: gross is what the bank statement says,
   *  and only the reporting surfaces that honour shared_cost_mode should turn this on.
   *  Never enable it for income allocations, row lists, or anything that must tie out. */
  netReimbursements?: boolean;
};

// Expands each transaction into one allocation per split (or a single allocation when
// unsplit), at the transaction's gross amount (correctedAmount if set, else amount).
//
// Gross is the default everywhere: a reimbursement receipt normally shows only in the
// account balance, not as a reduction of spend. With `netReimbursements` the caller opts
// into net spend instead — see getSharedCostMode and reimbursedAmountExpr. Income and
// reimbursement rows are never netted, and the reimbursed part is clamped to the
// transaction total so spend can't go negative or flip a category.
export function buildSplitAllocations<
  TBase extends SplitAwareTransactionBase,
  TSplit extends TransactionSplitRow,
>(
  transactions: TBase[],
  splitMap: Map<number, TSplit[]>,
  options: SplitAllocationOptions = {},
) {
  const allocations: SplitAwareAllocation[] = [];

  for (const transaction of transactions) {
    const splits = splitMap.get(transaction.id) ?? [];
    const baseTotal = getTransactionSplitTotal(transaction.amount, transaction.correctedAmount);

    const netting =
      options.netReimbursements === true &&
      transaction.direction === "expense" &&
      transaction.isReimbursement !== true;
    const reimbursed = netting
      ? Math.min(Math.max(transaction.reimbursedAmount ?? 0, 0), baseTotal)
      : 0;

    if (splits.length > 0) {
      // Spread the reimbursed part over the splits in proportion to their size, so a
      // €103 bill split 60/40 nets to your share of each half and the parts still add up.
      const splitShares = reimbursed > 0
        ? allocateByCounts(reimbursed, splits.map((split) => Math.max(0, Math.round(split.amount * 100))))
        : null;

      for (const [index, split] of splits.entries()) {
        allocations.push({
          transactionId: transaction.id,
          date: transaction.date,
          direction: transaction.direction,
          amount: splitShares
            ? Math.max(0, roundToCents(split.amount - splitShares[index]))
            : roundToCents(split.amount),
          isReimbursement: transaction.isReimbursement ?? false,
          isInternalTransfer: transaction.isInternalTransfer ?? false,
          categoryId: split.categoryId,
          categoryName: split.categoryName ?? null,
          categoryColor: split.categoryColor ?? null,
          categoryIcon: split.categoryIcon ?? null,
          categoryGroup: split.categoryGroup ?? null,
        });
      }
      continue;
    }

    allocations.push({
      transactionId: transaction.id,
      date: transaction.date,
      direction: transaction.direction,
      amount: reimbursed > 0 ? roundToCents(baseTotal - reimbursed) : baseTotal,
      isReimbursement: transaction.isReimbursement ?? false,
      isInternalTransfer: transaction.isInternalTransfer ?? false,
      categoryId: transaction.categoryId ?? null,
      categoryName: transaction.categoryName ?? null,
      categoryColor: transaction.categoryColor ?? null,
      categoryIcon: transaction.categoryIcon ?? null,
      categoryGroup: transaction.categoryGroup ?? null,
    });
  }

  return allocations;
}

export function getDisplayedTransactionCategory<
  TBase extends SplitAwareTransactionBase,
  TSplit extends TransactionSplitRow,
>(transaction: TBase, splits: TSplit[]) {
  if (splits.length === 0) {
    return {
      isSplit: false,
      splitCount: 0,
      splitSummary: null,
      categoryId: transaction.categoryId ?? null,
      categoryName: transaction.categoryName ?? null,
      categoryColor: transaction.categoryColor ?? null,
      categoryIcon: transaction.categoryIcon ?? null,
      categoryGroup: transaction.categoryGroup ?? null,
    };
  }

  return {
    isSplit: true,
    splitCount: splits.length,
    splitSummary: summarizeSplitCategories(splits.map((split) => split.categoryName)),
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    categoryGroup: null,
  };
}
