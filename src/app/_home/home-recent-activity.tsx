"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnchoredTip } from "@/components/anchored-tip";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { StatusDot } from "@/components/clear/chip";
import { Icon } from "@/components/icon";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { TRANSFER_TYPE_LABELS } from "@/lib/transfer-types";
import { cn } from "@/lib/utils";
import { TransactionPanelSheet } from "@/app/transactions/_activity/transaction-panel-sheet";
import type { Category, Goal } from "@/db/schema";
import type { TransactionDetail } from "@/app/transactions/transaction-types";

type Status = "toReview" | "recurring" | "transfer" | "paidBack" | "booked";

const STATUS_DOT: Record<Status, string> = {
  toReview: "var(--clr-ember)",
  recurring: "var(--clr-info-fill)",
  transfer: "var(--clr-muted)",
  paidBack: "var(--clr-positive-fill)",
  booked: "var(--clr-placeholder)",
};

function statusOf(t: TransactionDetail): Status {
  if (t.isInternalTransfer) return "transfer";
  if (t.categoryId == null && !t.isSplit) return "toReview";
  if (t.isReimbursement) return "paidBack";
  if (t.recurringItemId != null) return "recurring";
  return "booked";
}

// Desktop table columns; phones show the same row as icon, name + meta, amount.
const COLUMNS = "lg:grid-cols-[minmax(180px,2fr)_minmax(110px,1.2fr)_minmax(110px,1fr)_72px_104px]";

/**
 * Home's recent activity: the latest transactions as a table on desktop and a list on
 * phones. A row opens the shared transaction panel in a sheet, right here.
 */
export function HomeRecentActivity({
  recent,
  categories,
  savingsGoals,
}: {
  recent: TransactionDetail[];
  categories: Category[];
  savingsGoals: Goal[];
}) {
  const t = useTranslations("home.activity");
  const locale = useLocale();
  const [detailRow, setDetailRow] = useState<TransactionDetail | null>(null);
  // Category changes made in the panel show here at once, before the page refreshes.
  const [categoryOverrides, setCategoryOverrides] = useState<Map<number, number | null>>(new Map());

  function resolveRow(row: TransactionDetail): TransactionDetail {
    if (!categoryOverrides.has(row.id)) return row;
    const overrideId = categoryOverrides.get(row.id) ?? null;
    const cat = categories.find((c) => c.id === overrideId);
    return {
      ...row,
      categoryId: overrideId,
      categoryName: cat?.name ?? null,
      categoryColor: cat?.color ?? null,
      categoryIcon: cat?.icon ?? null,
      categoryBudgetType: cat?.budgetType ?? null,
    };
  }

  const shortDate = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`));
  const rows = recent.map(resolveRow);
  const firstId = rows[0]?.id;

  return (
    <ClearCard aria-labelledby="home-activity-title">
      {/* Held back while the sheet is open — the tip is about opening it. */}
      <AnchoredTip id="transactionDetail" anchor="transactionRow" active={detailRow == null} />
      <ClearCardHeader
        title={<span id="home-activity-title">{t("title")}</span>}
        action={<ClearCardLink href="/transactions">{t("all")}</ClearCardLink>}
      />

      {rows.length === 0 ? (
        <p className="m-0 text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex flex-col lg:min-w-[620px]">
            <div aria-hidden className={cn("hidden h-11 items-center gap-3 rounded-clear-row bg-clear-tile px-3.5 text-[13px] font-bold text-clear-ink-2 lg:grid", COLUMNS)}>
              <span>{t("transaction")}</span>
              <span>{t("category")}</span>
              <span>{t("statusColumn")}</span>
              <span>{t("date")}</span>
              <span className="text-right">{t("amount")}</span>
            </div>
            {rows.map((row) => {
              const icon = resolveTransactionIcon(row);
              const status = statusOf(row);
              const category = row.isInternalTransfer
                ? (row.transferType && TRANSFER_TYPE_LABELS[row.transferType]) || t("status.transfer")
                : row.categoryName ?? t("noCategory");
              const income = row.direction === "income";
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDetailRow(row)}
                  data-tip-anchor={row.id === firstId ? "transactionRow" : undefined}
                  className={cn(
                    "grid min-h-16 w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-b border-clear-ground px-2 text-left font-clear text-clear-ink transition-colors last:border-b-0 hover:rounded-clear-row hover:bg-clear-tile lg:px-3.5",
                    COLUMNS,
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon iconKey={icon.iconKey} color={icon.color} background={icon.background} initials={icon.initials} size="md" soft />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] font-bold">{resolveDisplayName(row)}</span>
                      <span className="truncate text-[13px] text-clear-muted">
                        <span className="lg:hidden">{category} · {shortDate(row.date)}</span>
                        <span className="hidden lg:inline">{row.bankName ?? ""}</span>
                      </span>
                    </span>
                  </span>
                  <span className={cn("hidden truncate text-sm font-semibold lg:block", status === "toReview" ? "text-clear-ember-text" : "text-clear-ink-2")}>
                    {category}
                  </span>
                  <span className="hidden lg:block">
                    <StatusDot color={STATUS_DOT[status]}>{t(`status.${status}`)}</StatusDot>
                  </span>
                  <span className="hidden text-sm text-clear-ink-2 lg:block">{shortDate(row.date)}</span>
                  <span className="text-right">
                    <Amount
                      value={income ? row.amount : -row.amount}
                      sign="always"
                      splitCents={false}
                      className={cn("text-[15px] tracking-[-0.01em]", income && "text-clear-positive")}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <TransactionPanelSheet
        row={detailRow}
        categories={categories}
        savingsGoals={savingsGoals}
        onClose={() => setDetailRow(null)}
        onCategorized={(_prev, _name, newId) => {
          if (detailRow) setCategoryOverrides((m) => new Map(m).set(detailRow.id, newId));
        }}
      />
    </ClearCard>
  );
}
