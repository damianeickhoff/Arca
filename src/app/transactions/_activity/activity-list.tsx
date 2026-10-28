"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconRepeat } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { Amount } from "@/components/clear/amount";
import { Pressable } from "@/components/ui/pressable";
import { formatEur } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import { resolveTransactionIcon } from "@/lib/auto-brand";
import { resolveDisplayName } from "@/lib/friendly-names";
import { transactionTime } from "@/lib/transaction-time";
import { useLongPress } from "@/lib/use-long-press";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";
import { TransactionBulkBar } from "../transaction-bulk-bar";
import type { TransactionRow } from "../transaction-types";
import { MoneyText } from "@/components/clear/money";
import { useActivitySelection } from "./select-mode";

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

/** The amount a row counts for, signed: money out negative, money in positive. */
function signedValue(row: Pick<TransactionRow, "direction" | "amount" | "correctedAmount" | "isReimbursement">) {
  const value = Math.abs(row.isReimbursement ? row.amount : row.correctedAmount ?? row.amount);
  return row.direction === "expense" && !row.isReimbursement ? -value : value;
}

/** "−€42,18" / "+€24,50": the sign leads, typographic minus for money going out. */
export function signedAmount(row: Pick<TransactionRow, "direction" | "amount" | "correctedAmount" | "isReimbursement">) {
  const value = signedValue(row);
  return `${value < 0 ? "−" : "+"}${formatEur(Math.abs(value))}`;
}

type Tag = { key: string; label: string; tone: string; dot: string };

/** The tags a row carries, as pills before the amount: Paid back, Split, Recurring, Not in reports. */
function rowTags(row: TransactionRow, tr: T): Tag[] {
  const tags: Tag[] = [];
  if (row.isReimbursement) tags.push({ key: "paidBack", label: tr("tags.paidBack"), tone: "bg-clear-mint text-clear-mint-ink", dot: "bg-clear-positive-fill" });
  if (row.isSplit) tags.push({ key: "split", label: tr("tags.split"), tone: "bg-clear-lilac text-clear-lilac-ink", dot: "bg-clear-lilac-ink" });
  if (row.recurringItemId != null) tags.push({ key: "recurring", label: tr("tags.recurring"), tone: "bg-clear-sky text-clear-sky-ink", dot: "bg-clear-info-fill" });
  if (row.excludeFromReports) tags.push({ key: "excluded", label: tr("tags.notInReports"), tone: "bg-clear-stone text-clear-stone-ink", dot: "bg-clear-muted" });
  return tags;
}

/** The row icon: the category / merchant / brand icon as a rounded tile, or a dashed
 *  "?" tile while the row still needs a category. `round` keeps the circle. On phones a
 *  recurring row gets a small repeat badge on the tile (desktop shows the Recurring pill). */
export function RowIcon({ row, size = "md", round = false }: { row: TransactionRow; size?: "md" | "xl"; round?: boolean }) {
  if (needsCategory(row)) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center border-[1.5px] border-dashed border-clear-ember-text bg-clear-peach font-bold text-clear-ember-text",
          round ? "rounded-full" : "rounded-clear-icon",
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
      <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} initials={ic.initials} round={round} size={size} soft />
      {row.recurringItemId != null && (
        <span aria-hidden className="absolute -right-1.5 -bottom-1.5 flex size-[18px] items-center justify-center rounded-full bg-clear-sky text-clear-sky-ink ring-2 ring-clear-card lg:hidden">
          <IconRepeat className="size-[11px]" stroke={2.6} />
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
  dateLabel,
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
  /** In a flat (amount-sorted) list each row shows its own date. */
  dateLabel?: string;
  /** The first row is the Activity tour's "a transaction" step. */
  tipAnchor?: boolean;
}) {
  // Press and hold starts select mode (phones); on desktop Shift- or Ctrl/Cmd-click does.
  const { longPressProps, consumeClick } = useLongPress(onStartSelect, !selectMode);
  const value = signedValue(row);
  const tags = rowTags(row, tr);
  const name = resolveDisplayName(row);
  // Under the name: the time of day when the bank gave one, else the account (and the
  // date first in a flat list).
  const sub = [dateLabel, transactionTime(row.rawDescription) ?? row.bankName].filter(Boolean).join(" · ");

  return (
    <div
      data-row-id={row.id}
      data-tip-anchor={tipAnchor ? "activityRow" : undefined}
      className={cn(
        "relative flex items-center rounded-clear-row px-1 transition-colors duration-150 lg:px-3",
        selected ? "bg-clear-peach" : active ? "bg-clear-tile" : "hover:bg-clear-tile/60 active:bg-clear-tile",
      )}
    >
      <Pressable
        scale={0.99}
        type="button"
        {...longPressProps}
        onClick={(e) => {
          // The click the browser fires after a completed hold would otherwise also open
          // the row just selected.
          if (consumeClick()) return;
          if (selectMode) onToggle();
          else if (e.shiftKey || e.ctrlKey || e.metaKey) onStartSelect();
          else onOpen();
        }}
        aria-pressed={selectMode ? selected : undefined}
        aria-current={active ? "true" : undefined}
        className="flex min-h-[62px] min-w-0 flex-1 select-none items-center gap-3 py-2 text-left [-webkit-touch-callout:none] [touch-action:pan-y] lg:min-h-16 lg:gap-3.5"
      >
        {/* In select mode the icon tile crossfades into a round check in the same spot,
            so nothing in the row shifts. The whole row is the control; the check is
            only its picture. */}
        <span className="relative inline-flex shrink-0">
          <span className={cn("inline-flex transition-[opacity,scale] duration-[160ms] motion-reduce:transition-none [&_.rounded-clear-icon]:size-11!", selectMode && "scale-90 opacity-0")}>
            <RowIcon row={row} />
          </span>
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-[opacity,scale] duration-[160ms] motion-reduce:transition-none",
              selectMode ? "opacity-100" : "pointer-events-none scale-75 opacity-0",
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border-2 transition-colors duration-[160ms] motion-reduce:transition-none",
                selected ? "border-clear-primary bg-clear-primary text-clear-primary-ink" : "border-clear-line bg-clear-card text-transparent",
              )}
            >
              <IconCheck className="size-3" stroke={3.5} />
            </span>
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold text-clear-ink">{name}</span>
          {sub && <span className="truncate text-[13px] text-clear-ink-2">{sub}</span>}
        </span>
        {tags.length > 0 && (
          <span className="hidden shrink-0 flex-wrap justify-end gap-1.5 sm:flex">
            {tags.map((tag) => (
              <span key={tag.key} className={cn("inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold", tag.tone)}>
                <span aria-hidden className={cn("size-[7px] rounded-full", tag.dot)} />
                {tag.label}
              </span>
            ))}
          </span>
        )}
        <Amount
          value={value}
          sign="always"
          className={cn("min-w-[88px] shrink-0 text-right text-base tracking-[-0.01em] lg:min-w-[104px]", value >= 0 ? "text-clear-positive" : "text-clear-ink")}
          centsClassName="text-[0.75em] opacity-100"
        />
      </Pressable>
    </div>
  );
}

/**
 * Activity's list: day groups — the day in type (Today, with the date beside it muted)
 * and that day's net on the right — with one row per transaction. Tapping a row reports
 * it to the page (which shows the detail panel on desktop or the bottom sheet on phones).
 * Select mode (see select-mode.tsx) starts from the Select button, a press and hold on a
 * row, or a Shift- / Ctrl / Cmd-click; the rows then toggle and the bulk bar carries
 * every bulk action.
 */
export function ActivityList({
  rows,
  categories,
  activeId,
  onOpen,
  grouped = true,
}: {
  rows: TransactionRow[];
  categories: Category[];
  activeId: number | null;
  onOpen: (row: TransactionRow) => void;
  /** Day groups only make sense in date order; sorted by amount the list is flat. */
  grouped?: boolean;
}) {
  const tr = useTranslations("activity");
  const tTx = useTranslations("transactions");
  const locale = useLocale();
  const [{ today, yesterday }] = useState(() => ({ today: isoToday(), yesterday: isoToday(-1) }));

  const { selectedIds, setSelectedIds, selectMode, enter, exit } = useActivitySelection();
  // Only rows on screen count: a selection made before a filter change keeps nothing
  // the new list no longer shows.
  const picked = selectedIds ? rows.filter((r) => selectedIds.has(r.id)).map((r) => r.id) : [];
  const allSelected = rows.length > 0 && picked.length === rows.length;

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Unticking the last row keeps select mode on; Done or Deselect leaves it.
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

  // Escape leaves select mode — the keyboard equivalent of the bar's Deselect. Not while
  // a dialog (the category or merchant picker, the delete confirm) is open: there
  // Escape closes that dialog only.
  useEffect(() => {
    if (!selectMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      setSelectedIds(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, setSelectedIds]);

  function shortDate(date: string) {
    // A stored date that isn't a real date is shown verbatim, so it can be found in
    // Settings → Data health rather than reading "Invalid Date".
    if (!isValidISODate(date)) return date;
    return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  }

  /** The day in type: "Today" with "Thu 15 Oct" beside it, or just "Tue 13 Oct". */
  function dayLabel(date: string): { label: string; date?: string } {
    if (date === today) return { label: tTx("today"), date: shortDate(date) };
    if (date === yesterday) return { label: tTx("yesterday"), date: shortDate(date) };
    return { label: shortDate(date) };
  }

  const groups: { date: string; rows: TransactionRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (grouped && last && last.date === row.date) last.rows.push(row);
    else if (grouped || groups.length === 0) groups.push({ date: row.date, rows: [row] });
    else last.rows.push(row);
  }

  return (
    <div className="flex flex-col font-clear">
      {groups.map((group) => {
        const net = group.rows.reduce((sum, r) => sum + signedValue(r), 0);
        const day = dayLabel(group.date);
        return (
          <section key={group.date} className="flex flex-col">
            {grouped && (
              <div className="flex items-baseline justify-between gap-3 px-1 pt-3.5 pb-1 lg:px-3 lg:pb-1.5">
                {selectMode ? (
                  <button type="button" onClick={() => toggleGroup(group.rows)} className="cursor-pointer text-left text-[15px] font-extrabold text-clear-ink">
                    {day.label} <span className="text-[13px] font-bold text-clear-ember-text">· {tTx(group.rows.every((r) => selectedIds!.has(r.id)) ? "bulkSelectNoneShort" : "bulkSelectAllShort")}</span>
                  </button>
                ) : (
                  <h3 className="m-0 inline-flex min-w-0 items-baseline gap-2">
                    <span className="text-[15px] font-extrabold text-clear-ink">{day.label}</span>
                    {day.date && <span className="truncate text-[13px] font-normal text-clear-ink-2">{day.date}</span>}
                  </h3>
                )}
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-clear-ink-2">
                  {net >= 0 ? "+" : "−"}
                  <MoneyText>{formatEur(Math.abs(net))}</MoneyText>
                </span>
              </div>
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
                  onStartSelect={() => enter([row.id])}
                  dateLabel={grouped ? undefined : shortDate(row.date)}
                  tipAnchor={row.id === rows[0]?.id}
                />
              ))}
            </div>
          </section>
        );
      })}

      {selectMode && (
        <TransactionBulkBar
          selectedIds={picked}
          categories={categories}
          allExcluded={picked.length > 0 && rows.filter((r) => selectedIds!.has(r.id)).every((r) => !!r.excludeFromReports)}
          total={rows.length}
          allSelected={allSelected}
          onSelectAll={() => setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
          onDone={exit}
        />
      )}
    </div>
  );
}
