"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { extractMerchantName } from "@/lib/parse-transaction-location";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { TRANSFER_TYPE_LABELS } from "@/lib/transfer-types";
import { cn } from "@/lib/utils";
import { Pressable } from "@/components/ui/pressable";
import { StaggerItem } from "@/components/ui/stagger";
import type { Category, Goal } from "@/db/schema";
import { TransactionDetailDialog } from "./transaction-detail-dialog";
import type { TransactionRow } from "./transaction-types";

type Row = TransactionRow;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function groupLabel(date: string, today: string, yesterday: string) {
  if (date === today) return "Today";
  if (date === yesterday) return "Yesterday";
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function subtitleFor(row: Row): string | null {
  if (row.isInternalTransfer) {
    return (row.transferType && TRANSFER_TYPE_LABELS[row.transferType]) || "Internal transfer";
  }
  if (row.isSplit) return row.splitSummary ?? `${row.splitCount} ${row.splitCount === 1 ? "deel" : "delen"}`;
  return row.categoryName;
}

export function MobileTransactionList({ rows, categories, savingsGoals }: { rows: Row[]; categories: Category[]; savingsGoals: Goal[] }) {
  const today = todayISO();
  const yesterday = yesterdayISO();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [categoryOverrides, setCategoryOverrides] = useState<Map<number, number | null>>(new Map());

  // Deep-link support: arriving from the dashboard "Recent transactions" tap
  // (/transactions?tx=<id>) auto-opens that row's detail dialog.
  const txParam = searchParams.get("tx");
  useEffect(() => {
    if (!txParam) return;
    const target = rows.find((r) => String(r.id) === txParam);
    if (target) setDetailRow(target);
  }, [txParam, rows]);

  function closeDetail() {
    setDetailRow(null);
    // Strip the `tx` param so a refresh/back doesn't reopen the dialog.
    if (searchParams.get("tx")) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("tx");
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "/transactions", { scroll: false });
    }
  }

  function resolveRow(t: Row): Row {
    if (!categoryOverrides.has(t.id)) return t;
    const overrideId = categoryOverrides.get(t.id) ?? null;
    const overrideCat = categories.find((c) => c.id === overrideId);
    return {
      ...t,
      categoryId: overrideId,
      categoryName: overrideCat?.name ?? null,
      categoryColor: overrideCat?.color ?? null,
      categoryIcon: overrideCat?.icon ?? null,
      categoryBudgetType: overrideCat?.budgetType ?? null,
    };
  }

  const groups: { date: string; rows: Row[] }[] = [];
  for (const raw of rows) {
    const row = resolveRow(raw);
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else groups.push({ date: row.date, rows: [row] });
  }

  return (
    <div className="space-y-4">
      {groups.map((group, groupIndex) => (
        <StaggerItem key={group.date} index={groupIndex}>
          <p className="text-xs font-medium text-foreground/60 uppercase tracking-wide mb-2 ml-1">
            {groupLabel(group.date, today, yesterday)}
          </p>
          <div className="rounded-xl bg-[var(--dialog-content-background)] py-3">
            {group.rows.map((t) => (
              <Pressable
                key={t.id}
                scale={0.98}
                type="button"
                onClick={() => setDetailRow(t)}
                className="w-full flex items-center gap-5 px-6 py-2 text-left active:bg-foreground/[0.04] transition-colors"
              >
                {(() => { const ic = resolveTransactionIcon(t); return (
                  <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} initials={ic.initials} round size="md" />
                ); })()}
                <div className="flex-1 min-w-0 ">
                  <p className="text-base font-medium truncate leading-tight">
                    {resolveDisplayName(t)}
                  </p>
                  {subtitleFor(t) && (
                    <p className="text-sm text-foreground/60 mt-0.5 truncate">{subtitleFor(t)}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {t.isReimbursement ? (
                    <p className="text-base font-semibold tabular-nums text-amber-600">{formatEur(t.amount)}</p>
                  ) : (
                    <p className={cn(
                      "text-base font-semibold tabular-nums",
                      t.direction === "income" ? "text-green-500 dark:text-emerald-400" : "text-foreground",
                    )}>
                      {formatEur(t.correctedAmount ?? t.amount)}
                    </p>
                  )}
                </div>
              </Pressable>
            ))}
          </div>
        </StaggerItem>
      ))}

      <TransactionDetailDialog
        row={detailRow}
        categories={categories}
        savingsGoals={savingsGoals}
        onClose={closeDetail}
        onCategorized={(_prev, _name, newId) => {
          if (detailRow) setCategoryOverrides((m) => new Map(m).set(detailRow.id, newId));
        }}
      />
    </div>
  );
}
