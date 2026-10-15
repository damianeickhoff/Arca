"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconReload } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { Pill } from "@/components/ui/pill";
import { Pressable } from "@/components/ui/pressable";
import { AnchoredTip } from "@/components/anchored-tip";
import { formatEur } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { TRANSFER_TYPE_LABELS } from "@/lib/transfer-types";
import { useLongPress } from "@/lib/use-long-press";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";
import { TransactionBulkBar } from "../transaction-bulk-bar";
import type { TransactionRow } from "../transaction-types";

type T = ReturnType<typeof useTranslations>;

function isoToday(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A row nobody has categorised yet — not split, not an own-account transfer. */
export function needsCategory(row: TransactionRow) {
  return row.categoryId == null && !row.isSplit && !row.isInternalTransfer;
}

/** "−€42,18" / "+€24,50": the sign leads, typographic minus for money going out. */
export function signedAmount(row: Pick<TransactionRow, "direction" | "amount" | "correctedAmount" | "isReimbursement">) {
  const value = row.isReimbursement ? row.amount : row.correctedAmount ?? row.amount;
  const out = row.direction === "expense" && !row.isReimbursement;
  return `${out ? "−" : "+"}${formatEur(Math.abs(value))}`;
}

/** The pills a row carries — Paid back, Split, Recurring, Not in reports. */
export function RowTags({ row, tr }: { row: TransactionRow; tr: T }) {
  return (
    <>
      {row.isReimbursement && <Pill tone="positive">{tr("tags.paidBack")}</Pill>}
      {row.isSplit && <Pill>{tr("tags.split")}</Pill>}
      {row.recurringItemId != null && <Pill>{tr("tags.recurring")}</Pill>}
      {!!row.excludeFromReports && <Pill>{tr("tags.notInReports")}</Pill>}
    </>
  );
}

function subline(row: TransactionRow, tr: T): string {
  const what = row.isInternalTransfer
    ? (row.transferType && TRANSFER_TYPE_LABELS[row.transferType]) || tr("internalTransfer")
    : row.isSplit
      ? row.splitSummary ?? tr("splitParts", { count: row.splitCount })
      : row.categoryName ?? "";
  return [what, row.bankName].filter(Boolean).join(" · ");
}

/** The 40px row icon: the category / merchant / brand circle, or a dashed warning
 *  circle when the row still needs a category. */
export function RowIcon({ row, size = "md" }: { row: TransactionRow; size?: "md" | "xl" }) {
  if (needsCategory(row)) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-warning font-bold text-warning",
          size === "xl" ? "size-12 text-lg" : "size-10",
        )}
      >
        ?
      </span>
    );
  }
  const ic = resolveTransactionIcon(row);
  return (
    <span className="relative inline-flex shrink-0">
      <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} initials={ic.initials} round size={size} />
      {row.recurringItemId != null && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-ink">
          <IconReload className="size-3 text-bg" stroke={2.5} />
        </span>
      )}
    </span>
  );
}

function ActivityRow({
  row,
  tr,
  selectMode,
  selected,
  active,
  onOpen,
  onToggle,
  onStartSelect,
  tipAnchor,
}: {
  row: TransactionRow;
  tr: T;
  selectMode: boolean;
  selected: boolean;
  active: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onStartSelect: () => void;
  tipAnchor: boolean;
}) {
  // Press and hold starts multi-select on phones; on desktop the checkbox does.
  const { longPressProps, consumeClick } = useLongPress(onStartSelect, !selectMode);
  const review = needsCategory(row);
  const positive = row.direction === "income" || row.isReimbursement;

  return (
    <div
      className={cn(
        "group relative -mx-2 flex items-center gap-1 rounded-row px-2 transition-colors",
        selected ? "bg-mustard-soft" : active ? "bg-surface-2" : "hover:bg-surface-2/60 active:bg-surface-2",
      )}
    >
      {/* Desktop checkbox: shown on hover, and always once select mode is on. */}
      <button
        type="button"
        onClick={() => (selectMode ? onToggle() : onStartSelect())}
        aria-label={tr(selected ? "bulk.deselect" : "bulk.select")}
        aria-pressed={selected}
        className={cn(
          "hidden size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors lg:inline-flex",
          selected ? "border-ink bg-ink text-bg" : "border-line text-transparent hover:border-ink-3",
          !selectMode && "lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
        )}
      >
        <IconCheck className="size-3.5" stroke={3} />
      </button>
      <Pressable
        scale={0.99}
        type="button"
        {...longPressProps}
        onClick={() => {
          // The click the browser fires after a completed hold would otherwise also open
          // the row just selected.
          if (consumeClick()) return;
          if (selectMode) onToggle();
          else onOpen();
        }}
        aria-pressed={selectMode ? selected : undefined}
        aria-current={active ? "true" : undefined}
        data-tip-anchor={tipAnchor ? "activityRow" : undefined}
        className="flex min-h-[58px] min-w-0 flex-1 select-none items-center gap-3 py-1.5 text-left [-webkit-touch-callout:none] [touch-action:pan-y]"
      >
        {selectMode && (
          <span
            aria-hidden
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full border-2 lg:hidden",
              selected ? "border-ink bg-ink text-bg" : "border-line",
            )}
          >
            {selected && <IconCheck className="size-3.5" stroke={3} />}
          </span>
        )}
        <RowIcon row={row} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-sm font-semibold text-ink">{resolveDisplayName(row)}</span>
          <span className={cn("flex min-w-0 items-center gap-1.5 text-xs", review ? "text-warning" : "text-ink-3")}>
            <span className="truncate">{review ? [tr("needsCategory"), row.bankName].filter(Boolean).join(" · ") : subline(row, tr)}</span>
            <RowTags row={row} tr={tr} />
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 text-[15px] font-semibold tabular-nums tracking-[-0.01em]",
            positive ? "text-positive" : "text-ink",
          )}
        >
          {signedAmount(row)}
        </span>
      </Pressable>
    </div>
  );
}

/**
 * Activity's list: day groups under a DM Mono date label, one row per transaction.
 * Tapping a row reports it to the page (which shows the detail panel on desktop or the
 * bottom sheet on phones); multi-select starts with a long press on phones or the row
 * checkbox on desktop and keeps every bulk action.
 */
export function ActivityList({
  rows,
  categories,
  activeId,
  onOpen,
}: {
  rows: TransactionRow[];
  categories: Category[];
  activeId: number | null;
  onOpen: (row: TransactionRow) => void;
}) {
  const tr = useTranslations("activity");
  const tTx = useTranslations("transactions");
  const locale = useLocale();
  const [{ today, yesterday }] = useState(() => ({ today: isoToday(), yesterday: isoToday(-1) }));

  // Non-null *is* select mode; an empty set means the mode is on with nothing picked.
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null);
  const selectMode = selectedIds !== null;

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(groupRows: TransactionRow[]) {
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
      if (e.key === "Escape") setSelectedIds(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

  function dayLabel(date: string) {
    if (date === today) return tTx("today");
    if (date === yesterday) return tTx("yesterday");
    // A stored date that isn't a real date is shown verbatim, so it can be found in
    // Settings → Data health rather than reading "Invalid Date".
    if (!isValidISODate(date)) return date;
    return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  }

  const groups: { date: string; rows: TransactionRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else groups.push({ date: row.date, rows: [row] });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.date} className="flex flex-col gap-1">
          {selectMode ? (
            <button type="button" onClick={() => toggleGroup(group.rows)} className="mono-label self-start">
              {dayLabel(group.date)} · {tTx(group.rows.every((r) => selectedIds!.has(r.id)) ? "bulkSelectNoneShort" : "bulkSelectAllShort")}
            </button>
          ) : (
            <h3 className="mono-label">{dayLabel(group.date)}</h3>
          )}
          <div className="flex flex-col">
            {group.rows.map((row) => (
              <ActivityRow
                key={row.id}
                row={row}
                tr={tr}
                selectMode={selectMode}
                selected={selectedIds?.has(row.id) ?? false}
                active={row.id === activeId}
                onOpen={() => onOpen(row)}
                onToggle={() => toggle(row.id)}
                onStartSelect={() => setSelectedIds(new Set([row.id]))}
                tipAnchor={row.id === rows[0]?.id}
              />
            ))}
          </div>
        </section>
      ))}

      {selectMode && (
        <TransactionBulkBar
          selectedIds={[...selectedIds!]}
          categories={categories}
          allExcluded={selectedIds!.size > 0 && rows.filter((r) => selectedIds!.has(r.id)).every((r) => !!r.excludeFromReports)}
          total={rows.length}
          allSelected={selectedIds!.size === rows.length && rows.length > 0}
          onSelectAll={() =>
            setSelectedIds((prev) => (prev && prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))))
          }
          onDone={() => setSelectedIds(null)}
        />
      )}

      {/* Bulk select: hold a row (phones) or tick its checkbox (desktop). Shown once,
          even to someone who turned tips off before Activity was redesigned. */}
      <AnchoredTip id="activityBulkSelect" anchor="activityRow" active={!selectMode && rows.length > 1} />
    </div>
  );
}
