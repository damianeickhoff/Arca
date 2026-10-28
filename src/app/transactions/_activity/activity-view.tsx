"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useNavHidden } from "@/lib/nav-visibility";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCamera, IconChevronDown, IconFileUpload, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { PageTour } from "@/components/page-tour";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { cn } from "@/lib/utils";
import type { Bank, Category, Goal } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { TransactionFilters } from "../transaction-filter-bar";
import type { TransactionRow } from "../transaction-types";
import { ActivityList } from "./activity-list";
import { useActivityNavigation } from "./filter-transition";
import { useFadeOnChange } from "@/lib/use-motion";
import { TransactionDetailPanel } from "./detail-panel";
import type { ActivityContext, ActivitySpendChart, ActivityTiles } from "./context";
import { ActivitySideCards, PeriodHero } from "./period-hero";
import { useActivitySelection } from "./select-mode";

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
  sort?: string;
  dir?: string;
};

// The list's sort orders, as the page's sort / dir URL params. Newest first is the default.
const SORTS = [
  { key: "newest", sort: "date", dir: "desc" },
  { key: "oldest", sort: "date", dir: "asc" },
  { key: "highest", sort: "amount", dir: "desc" },
  { key: "lowest", sort: "amount", dir: "asc" },
] as const;

/** "Newest first ▾": changes the list's order, keeping every filter. */
function SortMenu({ sort, dir }: { sort?: string; dir?: string }) {
  const t = useTranslations("activity.sort");
  const { navigate } = useActivityNavigation();
  const params = useSearchParams();
  const current = SORTS.find((o) => o.sort === (sort ?? "date") && o.dir === (dir === "asc" ? "asc" : "desc")) ?? SORTS[0];

  function choose(option: (typeof SORTS)[number]) {
    const next = new URLSearchParams(params.toString());
    if (option.key === "newest") {
      next.delete("sort");
      next.delete("dir");
    } else {
      next.set("sort", option.sort);
      next.set("dir", option.dir);
    }
    next.delete("limit");
    next.delete("tx");
    navigate(`?${next.toString()}`);
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger aria-label={t("label", { order: t(current.key) })} className={cn(clearButtonVariants({ variant: "secondary", size: "sm" }), "h-11")}>
        {t(current.key)}
        <IconChevronDown aria-hidden stroke={2.2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-48 p-1.5">
        {SORTS.map((o) => (
          <DropdownMenuItem key={o.key} onClick={() => choose(o)} aria-checked={o.key === current.key} className={o.key === current.key ? "font-bold" : undefined}>
            {t(o.key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── header ─────────────────────────────────────────────────────────────────────

/**
 * Activity's header row: the title with "Every transaction across N accounts · M need a
 * category" from lg; the phone action is Filters (every filter in a sheet); desktop
 * actions are Scan receipt, Import CSV and Add transaction. Select mode starts from a
 * press and hold on a row (or a Shift- / Ctrl / Cmd-click), so there is no Select button.
 */
export function ActivityHeader({
  accountCount,
  needsReviewCount,
  filters,
  receiptScan,
}: {
  accountCount: number;
  needsReviewCount: number;
  filters: ActivityFilters;
  /** The local AI server has a vision model (Settings › AI), so receipts can be scanned. */
  receiptScan: boolean;
}) {
  const t = useTranslations("activity");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{t("title")}</h1>
        <span className="hidden text-base text-clear-ink-2 lg:inline">
          {t("subtitle", { accounts: accountCount })}
          {needsReviewCount > 0 && <> · {t("subtitleReview", { count: needsReviewCount })}</>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TransactionFilters {...filters} layout="header" />
        {receiptScan && (
          <Link href="/transactions/add?scan=1" className={cn(clearButtonVariants({ variant: "surface" }), "hidden lg:inline-flex")}>
            <IconCamera aria-hidden />
            {t("scanReceipt")}
          </Link>
        )}
        <Link href="/settings?panel=import" className={cn(clearButtonVariants({ variant: "surface" }), "hidden lg:inline-flex")}>
          <IconFileUpload aria-hidden />
          {t("importCsv")}
        </Link>
        <Link href="/transactions/add" className={cn(clearButtonVariants(), "hidden lg:inline-flex")}>
          <IconPlus aria-hidden />
          {t("addTransaction")}
        </Link>
      </div>
    </div>
  );
}

// ── search ─────────────────────────────────────────────────────────────────────

/**
 * Searches the transaction list (the `search` URL param, debounced). Two placements:
 *   • "toolbar" — desktop only, in the list card's toolbar; Cmd/Ctrl+K still opens the
 *     global search.
 *   • "bottom" — phones only, a bar docked just above the floating tab bar, out of the
 *     way of the list and within thumb reach. Hidden during bulk select and while a
 *     sheet is open.
 */
function ActivitySearch({ search, variant }: { search?: string; variant: "toolbar" | "bottom" }) {
  const t = useTranslations("activity");
  const tTx = useTranslations("transactions");
  const { navigate } = useActivityNavigation();
  const params = useSearchParams();
  const [value, setValue] = useState(search ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(query: string) {
    const next = new URLSearchParams(params.toString());
    if (query) next.set("search", query);
    else next.delete("search");
    next.delete("limit");
    next.delete("tx");
    navigate(`?${next.toString()}`);
  }

  const field = (
    <div className="relative w-full">
      <IconSearch className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-clear-muted" />
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
          "w-full border-[1.5px] border-transparent pl-10 pr-10 font-clear [&::-webkit-search-cancel-button]:appearance-none text-[15px] text-clear-ink outline-none placeholder:text-clear-placeholder focus:border-clear-ink",
          variant === "toolbar" ? "h-11 rounded-full bg-clear-tile" : "h-[var(--bottom-bar-height)] rounded-clear-tile bg-clear-card shadow-clear-float",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => { setValue(""); push(""); }}
          aria-label={tTx("clear")}
          className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-clear-muted hover:text-clear-ink"
        >
          <IconX className="size-4" />
        </button>
      )}
    </div>
  );

  if (variant === "toolbar") return <div className="min-w-[180px] flex-1">{field}</div>;
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

// ── page body ──────────────────────────────────────────────────────────────────

/**
 * The Activity page body — one responsive tree. Phones: the period hero, the Needs a
 * category / Upcoming tiles, then the day-grouped list in a card; tapping a row opens
 * the detail panel as a bottom sheet, search is docked above the tab bar and Filters
 * sits in the header. From lg: one grid of two columns (two thirds, one third) — the
 * hero beside the stacked Needs a category and Upcoming cards, and under them the list
 * (with its toolbar: search, Filters, sort) beside the inline detail
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
  fixed,
  incomeCount,
  showMoreHref,
  hasMore,
  tiles,
  chart,
  context,
}: {
  filters: ActivityFilters;
  categories: Category[];
  savingsGoals: Goal[];
  rows: TransactionRow[];
  filteredCount: number;
  income: number;
  expense: number;
  /** The part of `expense` that went to recurring bills. */
  fixed: number;
  /** How many incoming transactions `income` adds up. */
  incomeCount: number;
  showMoreHref: string;
  hasMore: boolean;
  tiles: ActivityTiles;
  chart: ActivitySpendChart;
  context: ActivityContext;
}) {
  const t = useTranslations("activity");
  const tTx = useTranslations("transactions");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();
  // The bulk bar takes the bottom of the screen (and hides the tab bar) while bulk
  // select is on; the docked search bar steps aside with it.
  const navHidden = useNavHidden();
  const { selectMode } = useActivitySelection();

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
    context,
    onCategorized: (id: number, categoryId: number | null) => setOverrides((m) => new Map(m).set(id, categoryId)),
  };

  // Position of a row among the loaded rows, and its neighbours for ↑/↓.
  function neighbours(id: number | undefined) {
    const i = resolved.findIndex((r) => r.id === id);
    return { index: i + 1, prev: i > 0 ? resolved[i - 1] : null, next: i >= 0 && i < resolved.length - 1 ? resolved[i + 1] : null };
  }
  const desk = neighbours(desktopRow?.id);
  const sheet = neighbours(shownSheetRow?.id);
  const deskPrevId = desk.prev?.id ?? null;
  const deskNextId = desk.next?.id ?? null;

  // Desktop: ↑/↓ move the selection (outside text fields, open sheets and menus), and
  // the selected row is kept in view inside the scrolling list.
  useEffect(() => {
    if (!isDesktop) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector('[data-vaul-drawer][data-state="open"], [role="menu"]')) return;
      const target = e.key === "ArrowDown" ? deskNextId : deskPrevId;
      if (target == null) return;
      e.preventDefault();
      setSelectedId(target);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, deskNextId, deskPrevId]);

  const selectedRowId = isDesktop ? desktopRow?.id : undefined;
  useEffect(() => {
    if (selectedRowId == null) return;
    document.querySelector(`[data-row-id="${selectedRowId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedRowId]);

  // Filter changes run as one transition: the list and the figures dim while the new
  // results load, then fade in when the filters (or sort) actually changed.
  const { pending } = useActivityNavigation();
  const resultsKey = [filters.from, filters.to, filters.direction, filters.category, filters.account, filters.budgetType, filters.recurring, filters.search, filters.min, filters.max, filters.sort, filters.dir].join("|");
  const listRef = useFadeOnChange<HTMLDivElement>(resultsKey);
  const summaryRef = useFadeOnChange<HTMLDivElement>(resultsKey);
  const dim = cn("transition-opacity duration-200", pending && "opacity-55");
  const hasSide = !!(tiles.upcoming || tiles.needsReview);

  return (
    // Desktop: the hero row on top; under it the list, at its natural height (its
    // toolbar sticks to the top of the window), beside the transaction, which stays in
    // view while the page scrolls. Phones: one column, with room at the bottom for the
    // docked search bar.
    <div className="flex flex-col gap-3.5 pb-[var(--bottom-bar-clearance)] lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)] lg:items-start lg:gap-5 lg:pb-0">
      {/* The period: left after spending, in / out, spending per day */}
      <div ref={summaryRef} className={cn("min-w-0 lg:flex lg:flex-col lg:self-stretch lg:[&>section]:flex-1", dim, !hasSide && "lg:col-span-2")}>
        <PeriodHero income={income} expense={expense} fixed={fixed} incomeCount={incomeCount} chart={chart} />
      </div>
      {hasSide && (
        <>
          <div className="hidden min-w-0 lg:flex lg:flex-col lg:self-stretch [&>div]:flex-1">
            <ActivitySideCards tiles={tiles} layout="desktop" />
          </div>
          <div className="lg:hidden">
            <ActivitySideCards tiles={tiles} layout="phone" />
          </div>
        </>
      )}

      {/* The list, with its toolbar on desktop */}
      <section aria-label={t("listTitle")} className="flex min-w-0 flex-col rounded-clear-card bg-clear-card lg:self-stretch">
        {isDesktop && (
          <div role="search" className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-2 rounded-t-clear-card bg-clear-card px-5 pt-5 pb-2">
            <h2 className="m-0 mr-2 ml-1 hidden shrink-0 text-lg font-bold whitespace-nowrap text-clear-ink xl:block">
              {t("listTitle")}
            </h2>
            <ActivitySearch search={filters.search} variant="toolbar" />
            <TransactionFilters {...filters} layout="toolbar" />
            <SortMenu sort={filters.sort} dir={filters.dir} />
          </div>
        )}
        <div ref={listRef} className={cn("px-3 pt-0.5 pb-2.5 lg:px-5 lg:pt-0 lg:pb-5", dim)}>
          {filteredCount === 0 ? (
            <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
              <p className="text-sm text-clear-muted">{tTx("noneFound")}</p>
              <Link href="/settings?panel=import" className="inline-flex h-10 items-center gap-2 rounded-full bg-clear-primary px-4 text-[13px] font-bold text-clear-primary-ink">
                <IconFileUpload size={16} stroke={1.8} />
                {tTx("importCsv")}
              </Link>
            </div>
          ) : (
            <>
              <ActivityList
                rows={resolved}
                categories={categories}
                activeId={isDesktop ? desktopRow?.id ?? null : null}
                onOpen={open}
                grouped={(filters.sort ?? "date") === "date"}
              />
              {hasMore && (
                <div className="pt-4 text-center">
                  <Link href={showMoreHref} scroll={false} className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
                    {tTx("showMore", { count: filteredCount - rows.length })}
                    <IconChevronDown size={15} stroke={1.8} />
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Right: the transaction (desktop), in view while the page scrolls */}
      {isDesktop && (
        <div className="sticky top-5 h-[min(calc(100dvh-40px),860px)] min-h-[520px] overflow-hidden rounded-clear-card bg-clear-card">
          {desktopRow ? (
            <TransactionDetailPanel
              key={desktopRow.id}
              row={desktopRow}
              {...panelProps}
              layout="card"
              position={{
                index: desk.index,
                total: filteredCount,
                onPrev: desk.prev ? () => setSelectedId(desk.prev!.id) : undefined,
                onNext: desk.next ? () => setSelectedId(desk.next!.id) : undefined,
              }}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <p className="p-6 text-sm text-clear-muted">{tTx("noneFound")}</p>
          )}
        </div>
      )}

      {/* Phones: the same panel in a bottom sheet; its header row brings the close button. */}
      {!isDesktop && (
        <Dialog open={sheetRow != null} onOpenChange={(v) => !v && closeSheet()}>
          <DialogContent hideHeaderRow title={t("detail.title")} className="px-4 pt-4">
            {shownSheetRow && (
              <TransactionDetailPanel
                key={shownSheetRow.id}
                row={shownSheetRow}
                {...panelProps}
                layout="sheet"
                position={{
                  index: sheet.index,
                  total: filteredCount,
                  onPrev: sheet.prev ? () => setSheetId(sheet.prev!.id) : undefined,
                  onNext: sheet.next ? () => setSheetId(sheet.next!.id) : undefined,
                }}
                onClose={closeSheet}
                onDeleted={closeSheet}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Phones: list search docked above the tab bar. */}
      {!navHidden && <ActivitySearch search={filters.search} variant="bottom" />}

      {/* One-time tips for the new pieces — shown even to people who turned tips off. */}
      <PageTour id="activity" ready={rows.length > 0 && !selectMode} />
    </div>
  );
}
