"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { useNavHidden } from "@/lib/nav-visibility";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconAdjustmentsHorizontal, IconCamera, IconFileUpload, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { AnchoredTip } from "@/components/anchored-tip";
import { SPLIT_GRID_WIDE } from "@/components/page-container";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { InkLineChart } from "@/components/ui/ink-line-chart";
import { PageHeading } from "@/components/ui/page-heading";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Bank, Category, Goal } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { TransactionFilterBar } from "../transaction-filter-bar";
import type { TransactionRow } from "../transaction-types";
import { ActivityList } from "./activity-list";
import { TransactionDetailPanel } from "./detail-panel";

export type ActivityFilters = {
  cats: Category[];
  banks: Bank[];
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  direction?: string;
  category?: string;
  account?: string;
  budgetType?: string;
  recurring?: boolean;
  search?: string;
  min?: string;
  max?: string;
};

const CARD = "rounded-card border border-line bg-surface shadow-card";

// ── viewport ───────────────────────────────────────────────────────────────────

const DESKTOP_QUERY = "(min-width: 1024px)";
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** lg and up: the detail panel sits inline; below it opens as a bottom sheet. */
function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
}

// ── header ─────────────────────────────────────────────────────────────────────

/**
 * Activity's header row: the title with "Every transaction across N accounts · M need a
 * category" from lg; phone actions are search and a Filters button (every chip in a
 * sheet); desktop actions are Scan receipt, Import CSV, search and Add transaction.
 */
export function ActivityHeader({
  accountCount,
  needsReviewCount,
  filters,
}: {
  accountCount: number;
  needsReviewCount: number;
  filters: ActivityFilters;
}) {
  const t = useTranslations("activity");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pill =
    "inline-flex h-[42px] items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2";

  return (
    <>
      <PageHeading
        className="w-full"
        title={t("title")}
        subtitle={
          <span className="hidden lg:inline">
            {t("subtitle", { accounts: accountCount })}
            {needsReviewCount > 0 && <> · {t("subtitleReview", { count: needsReviewCount })}</>}
          </span>
        }
        actions={
          <>
            {/* Desktop: the header field filters the list (Cmd/Ctrl+K still opens the
                global search). Phones search from the bar docked above the tab bar. */}
            <ActivitySearch search={filters.search} variant="header" />
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label={t("filtersButton")}
              className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink lg:hidden"
            >
              <IconAdjustmentsHorizontal size={18} stroke={1.8} />
            </button>
            <Link href="/transactions/add?scan=1" className={cn(pill, "hidden lg:inline-flex")}>
              <IconCamera size={16} stroke={1.8} />
              {t("scanReceipt")}
            </Link>
            <Link href="/import" className={cn(pill, "hidden lg:inline-flex")}>
              <IconFileUpload size={16} stroke={1.8} />
              {t("importCsv")}
            </Link>
            <Link
              href="/transactions/add"
              className="hidden h-[42px] items-center gap-2 whitespace-nowrap rounded-full bg-mustard px-[18px] text-sm font-bold text-mustard-ink lg:inline-flex"
            >
              <IconPlus size={16} stroke={2} />
              {t("addTransaction")}
            </Link>
          </>
        }
      />

      {/* Phones: every filter at once, wrapped, in a sheet. */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent title={t("filtersButton")}>
          <div className="pb-2">
            <TransactionFilterBar {...filters} layout="wrap" />
          </div>
          <Link
            href="/transactions"
            onClick={() => setFiltersOpen(false)}
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full border border-line bg-surface text-sm font-bold text-ink"
          >
            {t("clearFilters")}
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── search ─────────────────────────────────────────────────────────────────────

/**
 * Searches the transaction list (the `search` URL param, debounced). Two placements:
 *   • "header" — desktop only, in the page header where the global search pill sits on
 *     other pages; Cmd/Ctrl+K still opens the global overlay.
 *   • "bottom" — phones only, a bar docked just above the floating tab bar, out of the
 *     way of the list and within thumb reach. Hidden during bulk select and while a
 *     sheet is open.
 */
function ActivitySearch({ search, variant }: { search?: string; variant: "header" | "bottom" }) {
  const t = useTranslations("activity");
  const tTx = useTranslations("transactions");
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(search ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(query: string) {
    const next = new URLSearchParams(params.toString());
    if (query) next.set("search", query);
    else next.delete("search");
    next.delete("limit");
    next.delete("tx");
    router.push(`?${next.toString()}`, { scroll: false });
  }

  const field = (
    <div className="relative w-full">
      <IconSearch className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          const q = e.target.value;
          setValue(q);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => push(q), 300);
        }}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        className={cn(
          "w-full border border-line bg-surface pl-10 pr-10 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-mustard focus:ring-3 focus:ring-mustard/25",
          variant === "header" ? "h-[42px] rounded-full" : "h-[var(--bottom-bar-height)] rounded-banner shadow-float",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => { setValue(""); push(""); }}
          aria-label={tTx("clear")}
          className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:text-ink"
        >
          <IconX className="size-4" />
        </button>
      )}
    </div>
  );

  if (variant === "header") return <div className="hidden w-[300px] lg:block">{field}</div>;
  return (
    <div
      data-hide-under-sheet=""
      data-tip-anchor="activitySearchBar"
      className="fixed inset-x-4 z-[55] lg:hidden"
      style={{ bottom: "var(--bottom-bar-offset)" }}
    >
      {field}
    </div>
  );
}

// ── summary ────────────────────────────────────────────────────────────────────

function SummaryCard({ income, expense, sparkline }: { income: number; expense: number; sparkline: number[] }) {
  const t = useTranslations("activity.summary");
  const net = income - expense;
  const fig = "amount text-[22px] tabular-nums";
  return (
    <div className={cn(CARD, "px-[18px] py-3.5 lg:px-5 lg:py-4")}>
      <div className="flex items-center gap-3.5 lg:grid lg:grid-cols-3 lg:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="mono-label">{t("in")}</span>
          <span className={cn(fig, "truncate text-positive")}>+{formatEur(income).replace(/,00$/, "")}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 border-l border-line pl-3.5 lg:pl-3">
          <span className="mono-label">{t("out")}</span>
          <span className={cn(fig, "truncate text-ink")}>−{formatEur(expense).replace(/,00$/, "")}</span>
        </div>
        <div className="hidden min-w-0 flex-col gap-0.5 border-l border-line pl-3 lg:flex">
          <span className="mono-label">{t("net")}</span>
          <span className={cn(fig, "truncate text-mustard-strong")}>
            {net >= 0 ? "+" : "−"}
            {formatEur(Math.abs(net)).replace(/,00$/, "")}
          </span>
        </div>
        {sparkline.length > 1 && (
          <div className="w-[90px] shrink-0 lg:hidden" aria-hidden>
            <InkLineChart values={sparkline} width={90} height={36} gradientId="activity-sparkline" grid={false} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── page body ──────────────────────────────────────────────────────────────────

/**
 * The redesigned Activity page body — one responsive tree. Phones: chips, summary,
 * the Upcoming tile, needs-review, search, then the day-grouped list; tapping a row
 * opens the detail panel as a bottom sheet. From lg: the list (with chips, count and
 * search) on the left and a 460px right column with the summary and the inline detail
 * panel for the selected row.
 */
export function ActivityView({
  filters,
  categories,
  savingsGoals,
  rows,
  filteredCount,
  income,
  expense,
  sparkline,
  showMoreHref,
  hasMore,
  upcomingSlot,
  needsReviewSlot,
}: {
  filters: ActivityFilters;
  categories: Category[];
  savingsGoals: Goal[];
  rows: TransactionRow[];
  filteredCount: number;
  income: number;
  expense: number;
  sparkline: number[];
  showMoreHref: string;
  hasMore: boolean;
  upcomingSlot?: React.ReactNode;
  needsReviewSlot?: React.ReactNode;
}) {
  const t = useTranslations("activity");
  const tTx = useTranslations("transactions");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();
  // The bulk bar takes the bottom of the screen (and hides the tab bar) while bulk
  // select is on; the docked search bar steps aside with it.
  const navHidden = useNavHidden();

  // Category changes made in the panel show in the list immediately; the list's rows
  // are a server snapshot until the refresh lands.
  const [overrides, setOverrides] = useState<Map<number, number | null>>(new Map());
  const resolved = rows.map((row) => {
    if (!overrides.has(row.id)) return row;
    const id = overrides.get(row.id) ?? null;
    const cat = categories.find((c) => c.id === id);
    return {
      ...row,
      categoryId: id,
      categoryName: cat?.name ?? null,
      categoryColor: cat?.color ?? null,
      categoryIcon: cat?.icon ?? null,
      categoryBudgetType: cat?.budgetType ?? null,
    };
  });

  // Desktop keeps a selected row (the first one until you pick another); phones open
  // the sheet for a tapped row.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetId, setSheetId] = useState<number | null>(null);

  // Deep link: /transactions?tx=<id> selects (desktop) or opens (phones) that row once.
  const txParam = searchParams.get("tx");
  const [openedTx, setOpenedTx] = useState<string | null>(null);
  if (txParam && txParam !== openedTx) {
    const target = rows.find((r) => String(r.id) === txParam);
    if (target) {
      setOpenedTx(txParam);
      setSelectedId(target.id);
      setSheetId(target.id);
    }
  }

  const desktopRow = resolved.find((r) => r.id === selectedId) ?? resolved[0] ?? null;
  const sheetRow = !isDesktop ? resolved.find((r) => r.id === sheetId) ?? null : null;
  // Remembered so the sheet keeps its content while it animates closed.
  const [lastSheetRow, setLastSheetRow] = useState<TransactionRow | null>(null);
  if (sheetRow && sheetRow.id !== lastSheetRow?.id) setLastSheetRow(sheetRow);
  const shownSheetRow = sheetRow ?? lastSheetRow;

  function open(row: TransactionRow) {
    setSelectedId(row.id);
    if (!isDesktop) setSheetId(row.id);
  }

  function closeSheet() {
    setSheetId(null);
    if (searchParams.get("tx")) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("tx");
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "/transactions", { scroll: false });
    }
  }

  const panelProps = {
    categories,
    savingsGoals,
    onCategorized: (id: number, categoryId: number | null) => setOverrides((m) => new Map(m).set(id, categoryId)),
  };

  return (
    <div className={cn(SPLIT_GRID_WIDE, "pb-[var(--bottom-bar-clearance)] lg:pb-0")}>
      {/* Left: chips, count, entry tiles, search, list */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3.5">
        <div className="order-1 flex items-center gap-3 lg:order-none">
          <div className="min-w-0 flex-1">
            <TransactionFilterBar {...filters} />
          </div>
          <span className="hidden shrink-0 text-[13px] text-ink-3 lg:inline">{t("results", { count: filteredCount })}</span>
        </div>
        {(upcomingSlot || needsReviewSlot) && (
          <div className="order-3 flex flex-col gap-2 empty:hidden lg:order-none lg:grid lg:grid-cols-2 lg:gap-3">
            {upcomingSlot}
            {needsReviewSlot}
          </div>
        )}
        <div className={cn("order-5 lg:order-none", "lg:rounded-card lg:border lg:border-line lg:bg-surface lg:px-[22px] lg:py-4 lg:shadow-card")}>
          {filteredCount === 0 ? (
            <div className={cn(CARD, "flex flex-col items-center gap-4 px-6 py-14 text-center lg:border-0 lg:shadow-none")}>
              <p className="text-sm text-ink-3">{tTx("noneFound")}</p>
              <Link href="/import" className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-bold text-bg">
                <IconFileUpload size={16} stroke={1.8} />
                {tTx("importCsv")}
              </Link>
            </div>
          ) : (
            <>
              <ActivityList rows={resolved} categories={categories} activeId={isDesktop ? desktopRow?.id ?? null : null} onOpen={open} />
              {hasMore && (
                <div className="pt-4 text-center">
                  <Link
                    href={showMoreHref}
                    scroll={false}
                    className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-[13px] font-semibold text-ink hover:bg-surface-2"
                  >
                    {tTx("showMore", { count: filteredCount - rows.length })}
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right (desktop): summary + inline detail panel */}
      <div className="contents lg:sticky lg:top-6 lg:flex lg:min-w-0 lg:flex-col lg:gap-3.5">
        <div className="order-2 lg:order-none">
          <SummaryCard income={income} expense={expense} sparkline={sparkline} />
        </div>
        {isDesktop && desktopRow && (
          <div className={cn(CARD, "max-h-[calc(100dvh-3rem-120px)] overflow-y-auto p-[22px]")}>
            <TransactionDetailPanel
              key={desktopRow.id}
              row={desktopRow}
              {...panelProps}
              onDeleted={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>

      {/* Phones: the same panel in a bottom sheet. */}
      {!isDesktop && (
        <Dialog open={sheetRow != null} onOpenChange={(v) => !v && closeSheet()}>
          <DialogContent title={<span className="sr-only">{t("detail.title")}</span>}>
            {shownSheetRow && (
              <TransactionDetailPanel key={shownSheetRow.id} row={shownSheetRow} {...panelProps} onDeleted={closeSheet} />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Phones: list search docked above the tab bar. */}
      {!navHidden && <ActivitySearch search={filters.search} variant="bottom" />}

      {/* One-time tips for the new pieces — shown even to people who turned tips off. */}
      <AnchoredTip id="activitySearchBar" anchor="activitySearchBar" active={!isDesktop && !navHidden} />
      <AnchoredTip id="activityFilters" anchor="activityFilters" />
      <AnchoredTip id="activityDetail" anchor="activityDetail" active={isDesktop || sheetRow != null} />
    </div>
  );
}

