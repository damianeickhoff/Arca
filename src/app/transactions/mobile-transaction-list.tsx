"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { IconCheck, IconReload } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import { extractMerchantName } from "@/lib/parse-transaction-location";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { TRANSFER_TYPE_LABELS } from "@/lib/transfer-types";
import { cn } from "@/lib/utils";
import { Pressable } from "@/components/ui/pressable";
import { StaggerItem } from "@/components/ui/stagger";
import { AnchoredTip } from "@/components/anchored-tip";
import { useLongPress } from "@/lib/use-long-press";
import type { Category, Goal } from "@/db/schema";
import { TransactionBulkBar } from "./transaction-bulk-bar";
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

type T = ReturnType<typeof useTranslations>;

function groupLabel(date: string, today: string, yesterday: string, t: T, dateLocale: string) {
  if (date === today) return t("today");
  if (date === yesterday) return t("yesterday");
  // A row whose stored date isn't a real date gets its raw value as the group header,
  // rather than a useless literal "Invalid Date" — it tells the user what to look for
  // in Settings → Data health.
  if (!isValidISODate(date)) return date;
  return new Date(date + "T00:00:00").toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" });
}

function subtitleFor(row: Row, t: T): string | null {
  if (row.isInternalTransfer) {
    return (row.transferType && TRANSFER_TYPE_LABELS[row.transferType]) || t("internalTransfer");
  }
  if (row.isSplit) return row.splitSummary ?? t("splitParts", { count: row.splitCount });
  return row.categoryName;
}

/**
 * One transaction. Press and hold opens multi-select (see useLongPress); once the mode
 * is on, a plain tap toggles this row instead of opening its detail dialog.
 *
 * Its own component only so the long-press hook can be per-row — hooks can't be called
 * from inside the parent's map.
 */
function TransactionListRow({
  row,
  tr,
  selectMode,
  selected,
  onOpen,
  onToggle,
  onStartSelect,
  tipAnchor,
}: {
  row: Row;
  tr: T;
  selectMode: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onStartSelect: () => void;
  /** Set on the first row only, so the "hold to select" tip has something to point at. */
  tipAnchor?: boolean;
}) {
  const { longPressProps, consumeClick } = useLongPress(onStartSelect, !selectMode);
  const ic = resolveTransactionIcon(row);

  return (
    <Pressable
      scale={0.98}
      type="button"
      {...longPressProps}
      onClick={() => {
        // The click the browser fires after a completed hold would otherwise also open
        // the row we just selected.
        if (consumeClick()) return;
        if (selectMode) onToggle();
        else onOpen();
      }}
      aria-pressed={selectMode ? selected : undefined}
      data-tip-anchor={tipAnchor ? "transactionListRow" : undefined}
      className={cn(
        "w-full flex items-center gap-5 px-6 py-2 text-left transition-colors select-none",
        // iOS raises its own text-selection callout on a held finger, which covers the
        // row and cancels our gesture; `touch-action: pan-y` keeps the list scrollable
        // while taking every other touch behaviour off the row.
        "[-webkit-touch-callout:none] [touch-action:pan-y]",
        selected ? "bg-foreground/[0.07]" : "active:bg-foreground/[0.04]",
      )}
    >
      {selectMode && (
        <span
          aria-hidden
          className={cn(
            "shrink-0 size-5 rounded-full border-2 flex items-center justify-center transition-colors",
            selected ? "border-foreground bg-foreground text-background" : "border-foreground/30",
          )}
        >
          {selected && <IconCheck className="size-3.5" stroke={3} />}
        </span>
      )}
      <div className="relative shrink-0">
        <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} initials={ic.initials} round size="md" />
        {row.recurringItemId != null && (
          <span
            aria-label={tr("recurringBill")}
            className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--dialog-content-background)]"
          >
            <IconReload className="size-3 text-foreground/60" stroke={2.5} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 ">
        <p className="text-base font-medium truncate leading-tight">{resolveDisplayName(row)}</p>
        {subtitleFor(row, tr) && (
          <p className="text-sm text-foreground/60 mt-0.5 truncate">{subtitleFor(row, tr)}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {row.isReimbursement ? (
          <p className="text-base font-semibold tabular-nums text-amber-600">{formatEur(row.amount)}</p>
        ) : (
          <p className={cn(
            "text-base font-semibold tabular-nums",
            row.direction === "income" ? "text-green-500 dark:text-emerald-400" : "text-foreground",
          )}>
            {formatEur(row.correctedAmount ?? row.amount)}
          </p>
        )}
      </div>
    </Pressable>
  );
}

export function MobileTransactionList({ rows, categories, savingsGoals }: { rows: Row[]; categories: Category[]; savingsGoals: Goal[] }) {
  const today = todayISO();
  const yesterday = yesterdayISO();
  const tr = useTranslations("transactions");
  const locale = useLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [categoryOverrides, setCategoryOverrides] = useState<Map<number, number | null>>(new Map());

  // Multi-select. `selectedIds` being non-null *is* select mode — an empty Set means the
  // mode is on with nothing picked, which is a different state from not being in it.
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null);
  const selectMode = selectedIds !== null;

  function exitSelect() {
    setSelectedIds(null);
  }

  function startSelect(id: number) {
    setSelectedIds(new Set([id]));
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Select or clear a whole day at once by tapping its date header. */
  function toggleGroup(groupRows: Row[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev ?? []);
      const allIn = groupRows.every((r) => next.has(r.id));
      for (const r of groupRows) {
        if (allIn) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  }

  // Escape leaves select mode — the keyboard equivalent of the bar's close button.
  useEffect(() => {
    if (!selectMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") exitSelect();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

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
      {groups.map((group, groupIndex) => {
        const label = groupLabel(group.date, today, yesterday, tr, dateLocale);
        const headerClass = "text-xs font-medium text-foreground/60 uppercase tracking-wide mb-2 ml-1";
        return (
          <StaggerItem key={group.date} index={groupIndex}>
            {selectMode ? (
              <button type="button" onClick={() => toggleGroup(group.rows)} className={cn(headerClass, "block text-left")}>
                {label} · {tr(group.rows.every((r) => selectedIds!.has(r.id)) ? "bulkSelectNoneShort" : "bulkSelectAllShort")}
              </button>
            ) : (
              <p className={headerClass}>{label}</p>
            )}
            <div className="rounded-xl bg-[var(--dialog-content-background)] py-3">
              {group.rows.map((t) => (
                <TransactionListRow
                  key={t.id}
                  row={t}
                  tr={tr}
                  selectMode={selectMode}
                  selected={selectedIds?.has(t.id) ?? false}
                  onOpen={() => setDetailRow(t)}
                  onToggle={() => toggleSelect(t.id)}
                  onStartSelect={() => startSelect(t.id)}
                  tipAnchor={t.id === rows[0]?.id}
                />
              ))}
            </div>
          </StaggerItem>
        );
      })}

      {selectMode && (
        <TransactionBulkBar
          selectedIds={[...selectedIds!]}
          categories={categories}
          allExcluded={
            selectedIds!.size > 0 &&
            rows.filter((r) => selectedIds!.has(r.id)).every((r) => !!r.excludeFromReports)
          }
          total={rows.length}
          allSelected={selectedIds!.size === rows.length && rows.length > 0}
          onSelectAll={() =>
            setSelectedIds((prev) =>
              prev && prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
            )
          }
          onDone={exitSelect}
        />
      )}

      {/* Press and hold a row to select several at once — pointed at the list itself. */}
      <AnchoredTip id="bulkSelect" anchor="transactionListRow" active={!selectMode && rows.length > 1} />

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
