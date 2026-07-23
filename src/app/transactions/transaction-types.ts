import type { TransactionSplitRow } from "@/lib/transaction-splits";

export type TransactionRow = {
  id: number;
  date: string;
  direction: string;
  type: string | null;
  amount: number;
  description: string;
  rawDescription: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  categoryBudgetType?: string | null;
  budgetTypeOverride?: string | null;
  brandIcon: string | null;
  brandIconColor: string | null;
  brandIconBgColor: string | null;
  source: string | null;
  correctedAmount: number | null;
  isReimbursement: boolean;
  isManualTransfer: boolean;
  isInternalTransfer: boolean;
  transferType?: string | null;
  categoryGroup: string | null;
  bankName: string | null;
  isSplit: boolean;
  splitCount: number;
  splitSummary: string | null;
  splits: TransactionSplitRow[];
  notes: string | null;
  customName: string | null;
  receiptUrl: string | null;
  goalId: number | null;
  recurringItemId?: number | null;
  recurringName?: string | null;
  recurringFriendlyName?: string | null;
};

// Looser shape accepted by the detail dialog, so it can be reused from places that
// only have a subset of the row (e.g. the dashboard "Recent transactions" list).
// Flags are `boolean | number` because some come straight from SQLite as 0/1.
export type TransactionDetail = {
  id: number;
  date: string;
  direction: string;
  amount: number;
  correctedAmount?: number | null;
  description: string;
  rawDescription?: string | null;
  categoryId: number | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  categoryBudgetType?: string | null;
  budgetTypeOverride?: string | null;
  brandIcon?: string | null;
  brandIconColor?: string | null;
  brandIconBgColor?: string | null;
  bankName?: string | null;
  notes?: string | null;
  isReimbursement?: boolean | number;
  isInternalTransfer?: boolean | number;
  transferType?: string | null;
  isSplit?: boolean | number;
  splitCount?: number;
  splitSummary?: string | null;
  excludeFromReports?: boolean | number;
  customName?: string | null;
  receiptUrl?: string | null;
  goalId?: number | null;
  recurringItemId?: number | null;
  recurringName?: string | null;
  recurringFriendlyName?: string | null;
};
