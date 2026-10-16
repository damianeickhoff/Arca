"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useNavHidden } from "@/lib/nav-visibility";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  IconAdjustmentsHorizontal,
  IconArrowDownRight,
  IconArrowUpRight,
  IconInbox,
  IconMinus,
  IconCalendarDue,
  IconCamera,
  IconChevronDown,
  IconChevronRight,
  IconFileUpload,
  IconPlus,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { AnchoredTip } from "@/components/anchored-tip";
import { SPLIT_COLUMNS_WIDE } from "@/components/page-container";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { Amount } from "@/components/clear/amount";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Bank, Category, Goal } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { TransactionFilterBar, TransactionPeriodCard } from "../transaction-filter-bar";
import type { TransactionRow } from "../transaction-types";
import { ActivityList } from "./activity-list";
import { useActivityNavigation } from "./filter-transition";
import { useFadeOnChange } from "@/lib/use-motion";
import { TransactionDetailPanel } from "./detail-panel";
import type { ActivityContext, ActivityTiles } from "./context";
import { MoneyText } from "@/components/clear/money";

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
      <DropdownMenuTrigger aria-label={t("label", { order: t(current.key) })} className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
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

const CARD = "rounded-clear-card bg-clear-card";


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

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{t("title")}</h1>
          <span className="hidden text-base text-clear-ink-2 lg:inline">
            {t("subtitle", { accounts: accountCount })}
            {needsReviewCount > 0 && <> · {t("subtitleReview", { count: needsReviewCount })}</>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label={t("filtersButton")}
            className={cn(clearButtonVariants({ variant: "surface", size: "icon" }), "size-12 lg:hidden")}
          >
            <IconAdjustmentsHorizontal size={20} stroke={1.9} />
          </button>
          <Link href="/transactions/add?scan=1" className={cn(clearButtonVariants({ variant: "surface" }), "hidden lg:inline-flex")}>
            <IconCamera aria-hidden />
            {t("scanReceipt")}
          </Link>
          <Link href="/import" className={cn(clearButtonVariants({ variant: "surface" }), "hidden lg:inline-flex")}>
            <IconFileUpload aria-hidden />
            {t("importCsv")}
          </Link>
          <Link href="/transactions/add" className={cn(clearButtonVariants(), "hidden lg:inline-flex")}>
            <IconPlus aria-hidden />
            {t("addTransaction")}
          </Link>
        </div>
      </div>

      {/* Phones: every filter at once, wrapped, in a sheet. */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent title={t("filtersButton")}>
          <div className="pb-2">
            <TransactionFilterBar {...filters} layout="wrap" />
          </div>
          <Link
            href="/transactions"
            onClick={() => setFiltersOpen(false)}
            className={cn(clearButtonVariants({ variant: "secondary" }), "mt-3 w-full")}
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
          "w-full border-[1.5px] border-transparent bg-clear-card pl-10 pr-10 font-clear [&::-webkit-search-cancel-button]:appearance-none text-[15px] text-clear-ink outline-none placeholder:text-clear-placeholder focus:border-clear-ink",
          variant === "header" ? "h-12 rounded-full" : "h-[var(--bottom-bar-height)] rounded-clear-tile shadow-clear-float",
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

  if (variant === "header") return <div className="hidden min-w-0 lg:block lg:flex-[1_1_240px]">{field}</div>;
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

/**
 * In, out and net for everything the filters match: one white card, three columns
 * with a round icon, the figure and a short explanation (the explanations from sm up).
 */
function SummaryCard({ income, expense, fixed, incomeCount }: { income: number; expense: number; fixed: number; incomeCount: number }) {
  const t = useTranslations("activity.summary");
  const net = income - expense;
  const col = "flex min-w-0 flex-col gap-1.5 px-3 sm:px-[18px]";
  const head = "inline-flex items-center gap-2 text-[13px] font-bold text-clear-ink-2 sm:text-sm";
  const dot = "hidden size-[26px] shrink-0 items-center justify-center rounded-full sm:inline-flex [&_svg]:size-3.5";
  const fig = "truncate text-base sm:text-xl xl:text-[24px] 2xl:text-[26px]";
  const sub = "hidden truncate text-[13px] text-clear-muted sm:block";
  return (
    <section aria-label={t("label")} className="grid h-full grid-cols-3 rounded-clear-card bg-clear-card px-1 py-4 font-clear sm:px-2 lg:py-[18px]">
      <div className={col}>
        <span className={head}>
          <span aria-hidden className={cn(dot, "bg-clear-mint text-clear-mint-ink")}><IconArrowDownRight stroke={2.4} /></span>
          {t("in")}
        </span>
        <Amount value={income} className={cn(fig, "text-clear-positive")} />
        <span className={sub}>{t("inSub", { count: incomeCount })}</span>
      </div>
      <div className={cn(col, "border-l border-clear-line")}>
        <span className={head}>
          <span aria-hidden className={cn(dot, "bg-clear-peach text-clear-negative")}><IconArrowUpRight stroke={2.4} /></span>
          {t("out")}
        </span>
        <Amount value={expense} sign="none" className={fig} />
        <span className={sub}><MoneyText>{fixed > 0 ? t("outSub", { amount: formatEur(fixed) }) : t("outSubNone")}</MoneyText></span>
      </div>
      <div className={cn(col, "border-l border-clear-line")}>
        <span className={head}>
          <span aria-hidden className={cn(dot, "bg-clear-tile text-clear-ink")}><IconMinus stroke={2.4} /></span>
          {t("net")}
        </span>
        <Amount value={net} sign="always" className={cn(fig, net >= 0 ? "text-clear-positive" : "text-clear-negative")} />
        <span className={sub}>{net >= 0 ? t("netSubPositive") : t("netSubNegative")}</span>
      </div>
    </section>
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
  fixed,
  incomeCount,
  showMoreHref,
  hasMore,
  tiles,
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

  // Anything beyond the period narrows the list; "Clear all filters" shows then.
  const filtered = !!(filters.direction || filters.category || filters.account || filters.budgetType || filters.recurring || filters.search || filters.min || filters.max);

  // Filter changes run as one transition: the list and the figures dim while the new
  // results load, then fade in when the filters (or sort) actually changed.
  const { navigate, pending } = useActivityNavigation();
  const resultsKey = [filters.from, filters.to, filters.direction, filters.category, filters.account, filters.budgetType, filters.recurring, filters.search, filters.min, filters.max, filters.sort, filters.dir].join("|");
  const listRef = useFadeOnChange<HTMLDivElement>(resultsKey);
  const summaryRef = useFadeOnChange<HTMLDivElement>(resultsKey);
  const dim = cn("transition-opacity duration-200", pending && "opacity-55");

  return (
    // Desktop: the page itself never scrolls. The summary row and the filter row sit on
    // top; the list and the transaction share the rest side by side, each scrolling
    // inside its card. Phones: one column (chips, summary, link tiles, list) at its
    // natural height, with room at the bottom for the docked search bar.
    <div className="flex flex-col gap-5 pb-[var(--bottom-bar-clearance)] lg:min-h-0 lg:flex-1 lg:gap-3.5 lg:pb-0">
      {/* Period · In / Out / Net · upcoming · needs a category */}
      <div className="order-2 flex flex-col gap-3 lg:order-none lg:flex-row lg:flex-wrap lg:items-stretch">
        <div className="hidden min-w-0 lg:block lg:flex-[0_1_200px]">
          <TransactionPeriodCard {...filters} />
        </div>
        <div ref={summaryRef} className={cn("min-w-0 lg:flex-[3_1_440px]", dim)}>
          <SummaryCard income={income} expense={expense} fixed={fixed} incomeCount={incomeCount} />
        </div>
        {/* The two link cards stack in one column beside the summary. */}
        <div className="flex min-w-0 flex-col gap-3 empty:hidden lg:flex-[1_1_260px]">
          {tiles.upcoming && (
            <LinkTile
              href="/transactions/upcoming"
              icon={<IconCalendarDue size={20} stroke={1.9} />}
              title={t("tiles.upcoming", { count: tiles.upcoming.count })}
              sub={t("tiles.upcomingSub", { amount: formatEur(tiles.upcoming.total), date: tiles.upcoming.until })}
            />
          )}
          {tiles.needsReview && (
            <LinkTile
              href="/transactions/needs-review"
              warn
              icon={<IconInbox size={20} stroke={1.9} />}
              title={t("tiles.needsReview", { count: tiles.needsReview.count })}
              sub={t("tiles.needsReviewSub")}
            />
          )}
        </div>
      </div>

      {/* Search (desktop), the filter chips and "Clear all filters" */}
      <div role="search" className="order-1 flex items-center gap-2.5 lg:order-none lg:flex-wrap">
        <ActivitySearch search={filters.search} variant="header" />
        <div className="min-w-0 flex-1 lg:flex-none">
          <TransactionFilterBar {...filters} periodCardOnDesktop />
        </div>
        <button
          type="button"
          onClick={() => navigate("/transactions")}
          aria-hidden={!filtered}
          tabIndex={filtered ? undefined : -1}
          className={cn(
            "hidden h-12 cursor-pointer items-center overflow-hidden whitespace-nowrap text-sm font-bold text-clear-ember-text transition-[max-width,opacity,padding] duration-200 ease-out hover:underline lg:inline-flex",
            filtered ? "max-w-48 px-2 opacity-100" : "pointer-events-none max-w-0 px-0 opacity-0",
          )}
        >
          {t("clearFilters")}
        </button>
      </div>

      <div className={cn("order-3 flex flex-col gap-5 lg:order-none lg:grid lg:min-h-0 lg:flex-1", SPLIT_COLUMNS_WIDE)}>
        {/* Row 3, left: the list, scrolling inside its card on desktop */}
        <div className="relative lg:min-h-0 lg:overflow-hidden lg:rounded-clear-card lg:bg-clear-card">
          <div ref={listRef} className={cn("clear-scrollbar lg:h-full lg:overflow-y-auto lg:px-4 lg:pb-10 lg:pt-5", dim)}>
            {filteredCount === 0 ? (
              <div className={cn(CARD, "flex flex-col items-center gap-4 px-6 py-14 text-center lg:border-0 lg:shadow-none")}>
                <p className="text-sm text-clear-muted">{tTx("noneFound")}</p>
                <Link href="/import" className="inline-flex h-10 items-center gap-2 rounded-full bg-clear-primary px-4 text-[13px] font-bold text-clear-primary-ink">
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
                  title={t("listTitle")}
                  count={t("results", { count: filteredCount })}
                  headerAction={<SortMenu sort={filters.sort} dir={filters.dir} />}
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
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-12 rounded-b-clear-card bg-gradient-to-b from-transparent to-clear-card lg:block" />
        </div>

        {/* Right: the transaction (desktop), as tall as the list */}
        {isDesktop && (
          <div className={cn(CARD, "min-h-0 overflow-hidden")}>
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
      </div>

      {/* Phones: the same panel in a bottom sheet. */}
      {!isDesktop && (
        <Dialog open={sheetRow != null} onOpenChange={(v) => !v && closeSheet()}>
          <DialogContent title={<span className="sr-only">{t("detail.title")}</span>}>
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
                onDeleted={closeSheet}
              />
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
      <AnchoredTip id="activityDetailTabs" anchor="activityDetailTabs" active={isDesktop ? desktopRow != null : sheetRow != null} />
      <AnchoredTip id="activityHistory" anchor="activityHistory" active={isDesktop ? desktopRow != null : sheetRow != null} />
      <AnchoredTip id="activityKeys" anchor="activityKeys" active={isDesktop} />
    </div>
  );
}

function LinkTile({ href, icon, title, sub, warn }: { href: string; icon: React.ReactNode; title: string; sub: string; warn?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[58px] items-center gap-3 rounded-clear-tile px-4 text-clear-ink no-underline transition-colors lg:flex-1",
        // White cards on the grey ground get a soft ring on hover, not a grey fill (which
        // would make them disappear into the ground).
        warn ? "bg-clear-peach hover:ring-2 hover:ring-clear-ember/30" : "bg-clear-card hover:ring-2 hover:ring-clear-ink/10",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
          warn ? "bg-clear-card text-clear-ember-text" : "bg-clear-sky text-clear-sky-ink",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-sm font-bold">{title}</span>
        <span className="truncate text-[13px] text-clear-ink-2"><MoneyText>{sub}</MoneyText></span>
      </span>
      <IconChevronRight size={16} stroke={2} aria-hidden className="ml-auto shrink-0 text-clear-muted" />
    </Link>
  );
}
