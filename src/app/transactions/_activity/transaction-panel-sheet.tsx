"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Category, Goal } from "@/db/schema";
import type { TransactionDetail, TransactionRow } from "../transaction-types";
import type { ActivityContext } from "./context";
import { TransactionDetailPanel } from "./detail-panel";

const EMPTY_CONTEXT: ActivityContext = { budgets: {}, recurring: {} };

/** The looser detail shape other lists carry, filled out to the row the panel reads. */
function toRow(d: TransactionDetail): TransactionRow {
  return {
    ...d,
    type: null,
    rawDescription: d.rawDescription ?? null,
    categoryName: d.categoryName ?? null,
    categoryColor: d.categoryColor ?? null,
    categoryIcon: d.categoryIcon ?? null,
    brandIcon: d.brandIcon ?? null,
    brandIconColor: d.brandIconColor ?? null,
    brandIconBgColor: d.brandIconBgColor ?? null,
    source: null,
    correctedAmount: d.correctedAmount ?? null,
    isReimbursement: !!d.isReimbursement,
    isManualTransfer: false,
    isInternalTransfer: !!d.isInternalTransfer,
    categoryGroup: null,
    bankName: d.bankName ?? null,
    isSplit: !!d.isSplit,
    splitCount: d.splitCount ?? 0,
    splitSummary: d.splitSummary ?? null,
    splits: [],
    notes: d.notes ?? null,
    customName: d.customName ?? null,
    receiptUrl: d.receiptUrl ?? null,
    goalId: d.goalId ?? null,
  };
}

/**
 * The transaction detail panel (the one Activity shows on the right) in a sheet, for
 * every other place that opens a transaction: Home's latest list, needs review, the
 * merchant and category profiles, the recurring sheet and the forecast. Same props as
 * the old TransactionDetailDialog it replaces, so those callers keep their own logic.
 * The panel's context (budgets, this month's spend, the linked recurring item) is
 * fetched when a transaction is opened.
 */
export function TransactionPanelSheet({
  row,
  categories,
  savingsGoals = [],
  onClose,
  onCategorized,
  sheetClassName,
  overlayClassName,
}: {
  row: TransactionDetail | null;
  categories: Category[];
  savingsGoals?: Goal[];
  onClose: () => void;
  onCategorized: (previousCategoryId: number | null, newCategoryName: string, newCategoryId: number | null) => void;
  /** Layering for callers that open this from a full-screen body portal (the merchant profile). */
  sheetClassName?: string;
  overlayClassName?: string;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  // Keep the last row through the close animation.
  const [lastRow, setLastRow] = useState<TransactionDetail | null>(null);
  if (row && row.id !== lastRow?.id) setLastRow(row);
  const shown = row ?? lastRow;

  const [context, setContext] = useState<ActivityContext>(EMPTY_CONTEXT);
  const openId = row?.id ?? null;
  const recurringId = row?.recurringItemId ?? null;
  useEffect(() => {
    if (openId == null) return;
    let cancelled = false;
    fetch(`/api/activity-context?recurring=${recurringId ?? ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c: ActivityContext | null) => { if (!cancelled && c) setContext(c); })
      .catch(() => { /* the panel still opens, without the budget and context tiles */ });
    return () => { cancelled = true; };
  }, [openId, recurringId]);

  return (
    <Dialog open={row != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={<span className="sr-only">{t("detail.title")}</span>} sheetClassName={sheetClassName} overlayClassName={overlayClassName}>
        {shown && (
          <TransactionDetailPanel
            key={shown.id}
            row={toRow(shown)}
            categories={categories}
            savingsGoals={savingsGoals}
            context={context}
            layout="sheet"
            onCategorized={(_id, categoryId) => {
              const name = categoryId != null ? categories.find((c) => c.id === categoryId)?.name ?? "" : "";
              onCategorized(shown.categoryId, name, categoryId);
            }}
            onDeleted={() => {
              onClose();
              router.refresh();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
