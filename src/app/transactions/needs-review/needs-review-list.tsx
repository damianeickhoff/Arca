"use client";

import { memo, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { cn } from "@/lib/utils";
import { Pressable } from "@/components/ui/pressable";
import { StaggerItem } from "@/components/ui/stagger";
import type { Category, Goal } from "@/db/schema";
import { TransactionDetailDialog } from "@/app/transactions/transaction-detail-dialog";
import type { TransactionDetail } from "@/app/transactions/transaction-types";

// Rendering every row as a full DOM node + entrance animation is what actually gets
// slow with a big review queue, not the (single, indexed) query — so the queue is
// paginated client-side in batches instead of touching the data-fetching layer,
// which the dashboard's "N needs review" badge also depends on for an accurate count.
const PAGE_SIZE = 60;

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

const NeedsReviewRow = memo(function NeedsReviewRow({ t, onOpen }: { t: TransactionDetail; onOpen: (t: TransactionDetail) => void }) {
  const ic = resolveTransactionIcon(t);
  return (
    <Pressable
      scale={0.98}
      type="button"
      onClick={() => onOpen(t)}
      className="w-full flex items-center gap-5 px-6 py-3 text-left active:bg-foreground/[0.04] transition-colors"
    >
      <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} initials={ic.initials} round size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium truncate leading-tight">{resolveDisplayName(t)}</p>
        {t.bankName && (
          <p className="text-sm text-foreground/60 mt-0.5 truncate">{t.bankName}</p>
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
  );
});

export function NeedsReviewList({
  rows,
  categories,
  savingsGoals,
}: {
  rows: TransactionDetail[];
  categories: Category[];
  savingsGoals: Goal[];
}) {
  const today = todayISO();
  const yesterday = yesterdayISO();
  const router = useRouter();
  const [detailRow, setDetailRow] = useState<TransactionDetail | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = rows.length > visibleRows.length;

  // Group the (already date-sorted, already paginated) rows by day.
  const groups = useMemo(() => {
    const acc: { date: string; rows: TransactionDetail[] }[] = [];
    for (const row of visibleRows) {
      const last = acc[acc.length - 1];
      if (last && last.date === row.date) last.rows.push(row);
      else acc.push({ date: row.date, rows: [row] });
    }
    return acc;
  }, [visibleRows]);

  return (
    <div className="space-y-4">
      {groups.map((group, groupIndex) => (
        <StaggerItem key={group.date} index={groupIndex}>
          <p className="text-xs font-medium text-foreground/60 uppercase tracking-wide mb-2 ml-1">
            {groupLabel(group.date, today, yesterday)}
          </p>
          <div className="rounded-xl bg-card py-3">
            {group.rows.map((t) => (
              <NeedsReviewRow key={t.id} t={t} onOpen={setDetailRow} />
            ))}
          </div>
        </StaggerItem>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full h-12 rounded-xl bg-card text-sm font-medium text-foreground/70 active:bg-foreground/[0.04] transition-colors"
        >
          Show {Math.min(PAGE_SIZE, rows.length - visibleRows.length)} more
        </button>
      )}

      <TransactionDetailDialog
        row={detailRow}
        categories={categories}
        savingsGoals={savingsGoals}
        onClose={() => setDetailRow(null)}
        onCategorized={() => {
          // Once categorized the row no longer "needs review"; re-fetch the server
          // component so it falls out of the query and the list/count update.
          router.refresh();
        }}
      />
    </div>
  );
}
