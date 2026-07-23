"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import type { Category } from "@/db/schema";
import {
  IconChevronDownFilled as ChevronDown,
  IconXFilled as X,
  IconAdjustmentsHorizontal as Filter,
  IconSearch as Search,
  IconShoppingCartFilled as Cart,
  IconSparklesFilled as Sparkles,
  IconPigFilled as Pig,
  IconFolderFilled as Folder,
  IconCheck as Check,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { filterPillClass } from "@/components/filter-pill";
import { Icon } from "@/components/icon";
import { UNCATEGORIZED_ICON, UNCATEGORIZED_COLOR } from "@/lib/auto-brand";
import { cn } from "@/lib/utils";
import { BUDGET_TYPE_LABELS, normalizeBudgetType } from "@/lib/format";
import { CategoryClient } from "@/components/settings/categories/category-client";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { useIsMobile } from "@/lib/use-is-mobile";

// Force WebKit to recompute the layout/visual viewport by briefly re-writing the
// viewport <meta>. On an iOS home-screen PWA the WKWebView is left ~62px short of the
// screen after the on-screen keyboard closes (a dark strip at the bottom) until a real
// gesture nudges it; toggling the meta triggers the same recompute without a scroll.
// maximum-scale=1 is a no-op while the page is at scale 1, so there's no visible zoom.
function forceViewportRecompute() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const original = meta.getAttribute("content") ?? "width=device-width, initial-scale=1";
  meta.setAttribute("content", `${original}, maximum-scale=1`);
  requestAnimationFrame(() => meta.setAttribute("content", original));
}

interface CategoryPickerProps {
  categories: Category[];
  current?: string;
  flat?: boolean;
  onChange?: (value: string) => void;
  triggerClassName?: string;
  /** Label shown on the trigger when nothing is selected. Defaults to "Category". */
  placeholder?: string;
  /** When set, the trigger shows the selected category's icon beside its name. */
  showSelectedIcon?: boolean;
}

// A toggleable filter row inside the filter dropdown. Stays open on click (closeOnClick
// false) so several filters can be flipped in one pass; active state shows a check.
function FilterMenuItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem
      closeOnClick={false}
      onClick={onClick}
      className={cn("mt-0.5 gap-2.5 py-2.5", active && "bg-card font-medium")}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {active && <Check className="size-4 text-foreground/60" />}
    </DropdownMenuItem>
  );
}

// The filter control, extracted so it can live in the dialog header next to the
// close button. Fully controlled — filter state is owned by the picker so the
// header trigger and the grid below stay in sync.
export function CategoryFilterMenu({
  budgetType,
  onBudgetTypeChange,
  showSubcategories,
  onShowSubcategoriesChange,
  triggerClassName,
}: {
  budgetType: string;
  onBudgetTypeChange: (v: string) => void;
  showSubcategories: boolean;
  onShowSubcategoriesChange: (v: boolean) => void;
  // When set, replaces the default trigger sizing/background (used to match the
  // mobile dialog's close button, which lives in the same header row).
  triggerClassName?: string;
}) {
  const isFiltered = budgetType !== "" || !showSubcategories;
  return (
    // modal={false}: nested inside the picker Dialog, a modal menu fights the dialog's
    // focus trap / outside-press guard on first open — the trigger swallows the first
    // click and only responds after the dialog is reopened. Non-modal avoids that.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Filter categories"
        className={cn(
          "flex items-center justify-center transition-colors cursor-pointer shrink-0",
          triggerClassName ??
            cn(
              "size-9 rounded-full bg-white dark:bg-white/7",
              isFiltered ? "bg-white dark:bg-white/7 text-primary-foreground" : "bg-white dark:bg-white/7 text-foreground",
            ),
        )}
      >
        <Filter className="size-4.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-60 w-auto p-1.5">
        <div className="flex items-center gap-2.5 px-2 py-1.5 text-sm font-medium">
          <Filter className="size-4.5" />
          <span className="flex-1">Filter</span>
        </div>
        <DropdownMenuSeparator />
        <FilterMenuItem icon={<Cart className="size-4.5" />} label="Only needs" active={budgetType === "nodig"} onClick={() => onBudgetTypeChange(budgetType === "nodig" ? "" : "nodig")} />
        <FilterMenuItem icon={<Sparkles className="size-4.5" />} label="Only wants" active={budgetType === "willen"} onClick={() => onBudgetTypeChange(budgetType === "willen" ? "" : "willen")} />
        <FilterMenuItem icon={<Pig className="size-4.5" />} label="Only savings" active={budgetType === "sparen"} onClick={() => onBudgetTypeChange(budgetType === "sparen" ? "" : "sparen")} />
        <DropdownMenuSeparator />
        <FilterMenuItem icon={<Folder className="size-4.5" />} label="Only parent" active={!showSubcategories} onClick={() => onShowSubcategoriesChange(!showSubcategories)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Owns the picker's filter state and hands back the header control plus the
// values to feed into <CategoryGrid>. Keeps the filter button (in the dialog
// header) and the grid below in sync without duplicating state at each call site.
export function useCategoryFilter(options?: { triggerClassName?: string }) {
  const [budgetType, setBudgetType] = useState("");
  const [showSubcategories, setShowSubcategories] = useState(true);
  const filterMenu = (
    <CategoryFilterMenu
      budgetType={budgetType}
      onBudgetTypeChange={setBudgetType}
      showSubcategories={showSubcategories}
      onShowSubcategoriesChange={setShowSubcategories}
      triggerClassName={options?.triggerClassName}
    />
  );
  return { budgetType, showSubcategories, filterMenu };
}

// The search input + "add category" button. Extracted so it can live either at the
// bottom of the grid (default) or — for the mobile picker sheet — in the Dialog's
// pinned `footer` slot, where it floats above the keyboard without the list moving.
export function CategorySearchBar({
  search,
  onSearchChange,
  categories,
  className,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  categories: Category[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40 pointer-events-none" />
        <input
          type="text"
          placeholder="Search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-no-keyboard-scroll
          className="w-full h-11 text-sm rounded-full pl-10 pr-4 bg-white/7 border border-foreground/10 backdrop-blur-xl backdrop-saturate-150 focus:outline-none"
        />
      </div>
      <CategoryClient action="add" variant="icon" categories={categories} />
    </div>
  );
}

// A search bar that floats above the on-screen keyboard on mobile. Rendered through
// a portal onto <body> — NOT inside the vaul drawer — so it's a true viewport-fixed
// element with no transformed ancestor. That matters: an input that sits inside the
// drawer's transformed/flex layout is, at focus time, at the very bottom of the
// screen where the keyboard will appear, so iOS pans the ENTIRE webview up to reveal
// it (dragging the sheet and the page behind it). A position:fixed element that's
// already above the keyboard is considered visible, so iOS never pans — nothing
// behind it moves. The `bottom` is tracked live from the VisualViewport so the bar
// stays glued just above the keyboard whether the platform resizes or overlays it.
function FloatingSearchBar({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    let barH = 0;
    let restHeight = 0; // largest viewport height seen = keyboard-closed height
    let lastY = NaN;

    // A rAF loop positions the bar via `transform` every frame while the picker is
    // open. Two reasons this beats `position: fixed; bottom`: iOS repaints a
    // transform on a promoted layer eagerly (a `bottom` fixed element goes stale
    // after the keyboard resize until you scroll — the "only shows when I scroll"
    // bug), and the loop tracks the keyboard's slide-in animation smoothly instead
    // of waiting for sparse resize events.
    const tick = () => {
      const wrap = wrapRef.current;
      const bar = barRef.current;
      if (wrap && bar) {
        if (!barH) barH = bar.offsetHeight;
        restHeight = Math.max(restHeight, vv.height);
        const keyboardOpen = vv.height < restHeight - 80;
        // Clear the home indicator when the keyboard's down; hug the keys when it's up.
        const gapBottom = keyboardOpen ? 8 : 30;
        const y = Math.round(vv.offsetTop + vv.height - barH - gapBottom);
        if (y !== lastY) {
          wrap.style.transform = `translate3d(0, ${y}px, 0)`;
          lastY = y;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Only renders client-side (the sheet opens on user interaction), so document exists.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={wrapRef}
      data-dialog-keep-open
      className="fixed left-0 top-0 w-full px-4 z-[300] pointer-events-none"
      // Off-screen until the first rAF frame positions it; will-change/translate3d
      // promote it to its own compositor layer so iOS repaints it on its own.
      style={{ transform: "translate3d(0, -9999px, 0)", willChange: "transform" }}
    >
      <div
        ref={barRef}
        className="pointer-events-auto flex items-center h-13 rounded-full pl-4 pr-2 bg-white/7 border border-foreground/10 backdrop-blur-xl backdrop-saturate-180"
      >
        <Search className="size-5 text-foreground/40 shrink-0" />
        <input
          type="text"
          placeholder="Search category"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-no-keyboard-scroll
          className="flex-1 min-w-0 bg-transparent px-3 outline-none placeholder:text-foreground/40"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="size-9 rounded-full flex items-center justify-center text-foreground/50 hover:bg-foreground/10 shrink-0"
          >
            <X className="size-4.5" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function CategoryGrid({
  categories,
  current,
  isFormMode,
  fill = false,
  budgetType = "",
  showSubcategories = true,
  onChange,
  onClose,
  search: controlledSearch,
  onSearchChange,
  hideSearch = false,
}: {
  categories: Category[];
  current?: string;
  isFormMode: boolean;
  fill?: boolean;
  budgetType?: string;
  showSubcategories?: boolean;
  onChange: (v: string) => void;
  onClose: () => void;
  // Optional controlled search — pass these (plus hideSearch) to render the search
  // bar elsewhere, e.g. in the sheet's pinned footer. Falls back to internal state.
  search?: string;
  onSearchChange?: (v: string) => void;
  hideSearch?: boolean;
}) {
  const [internalSearch, setInternalSearch] = useState("");
  const search = controlledSearch ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;

  function select(value: string) { onChange(value); onClose(); }

  const query = search.trim().toLowerCase();

  const { topLevel, childrenByParentId } = useMemo(() => {
    // budgetType is stored in mixed vocabularies (Dutch/English) — normalize before comparing.
    const matches = (c: Category) =>
      (!budgetType || normalizeBudgetType(c.budgetType) === budgetType) && (!query || c.name.toLowerCase().includes(query));

    const idsPresent = new Set(categories.filter(matches).map((c) => c.id));
    const topLevel: Category[] = [];
    const childrenByParentId = new Map<number, Category[]>();

    for (const cat of categories) {
      if (!matches(cat)) continue;

      // "Only parent" (showSubcategories false): show real top-level categories only,
      // dropping every child instead of flattening them into the top-level list.
      if (!showSubcategories) {
        if (cat.parentCategoryId === null) topLevel.push(cat);
        continue;
      }

      // A category is "top-level" here if it has no parent, or its parent got
      // filtered out — orphaned matches are promoted so they're never lost.
      const isTop = cat.parentCategoryId === null || !idsPresent.has(cat.parentCategoryId);
      if (isTop) {
        topLevel.push(cat);
      } else {
        const siblings = childrenByParentId.get(cat.parentCategoryId!);
        if (siblings) siblings.push(cat);
        else childrenByParentId.set(cat.parentCategoryId!, [cat]);
      }
    }
    return { topLevel, childrenByParentId };
  }, [categories, budgetType, query, showSubcategories]);

  return (
    <div className={cn("flex flex-col gap-3 -mx-1 px-1", fill && "flex-1 min-h-0")}>
      <div className={cn("overflow-y-auto -mx-1 px-1", fill ? "flex-1 min-h-0 lg:flex-none lg:max-h-[60vh]" : "max-h-[50vh]")}>
        <div className="flex flex-col gap-1.5">
          {!isFormMode && !query && (
            <CategoryRow label="Alle" active={!current} onClick={() => select("")} />
          )}
          {!query && (
            <CategoryRow
              label="Uncategorized"
              iconKey={UNCATEGORIZED_ICON}
              color={UNCATEGORIZED_COLOR}
              active={current === "none"}
              onClick={() => select("none")}
            />
          )}

          {topLevel.map((cat) => {
            const children = childrenByParentId.get(cat.id) ?? [];
            return (
              <div key={cat.id} className="rounded-xl bg-[var(--dialog-content-background)] p-1.5">
                <CategoryRow
                  label={cat.name}
                  iconKey={cat.icon}
                  color={cat.color}
                  budgetType={cat.budgetType}
                  active={current === String(cat.id)}
                  onClick={() => select(String(cat.id))}
                />
                {children.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-1.5 pl-4">
                    {children.map((child) => (
                      <CategoryRow
                        key={child.id}
                        label={child.name}
                        iconKey={child.icon}
                        color={child.color}
                        budgetType={child.budgetType}
                        iconSize="xs"
                        active={current === String(child.id)}
                        onClick={() => select(String(child.id))}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {topLevel.length === 0 && (
            <p className="text-sm text-foreground/40 text-center py-6">No categories found</p>
          )}
        </div>
      </div>

      {/* Search sits below the scrollable list. Callers that render it in a pinned
          footer instead (so it floats above the keyboard) pass hideSearch. */}
      {!hideSearch && (
        <CategorySearchBar
          search={search}
          onSearchChange={setSearch}
          categories={categories}
          className="shrink-0"
        />
      )}
    </div>
  );
}

function CategoryRow({
  label,
  iconKey,
  color,
  budgetType,
  iconSize = "sm",
  active,
  onClick,
}: {
  label: string;
  iconKey?: string | null;
  color?: string | null;
  budgetType?: string | null;
  iconSize?: "xs" | "sm";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors cursor-pointer text-left",
        active ? "bg-card" : "hover:bg-card",
      )}
    >
      <span
        className={cn(
          "size-4.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
          active ? "border-primary" : "border-foreground/25",
        )}
      >
        {active && <span className="size-2.5 rounded-full bg-primary" />}
      </span>
      <Icon iconKey={iconKey ?? null} color={color ?? null} round size={iconSize} />
      <span className="flex-1 min-w-0">
        <span className={cn("block text-sm truncate", active ? "font-semibold text-foreground" : "text-foreground")}>
          {label}
        </span>
        {budgetType && (
          <span className="block text-xs text-foreground/40">
            {BUDGET_TYPE_LABELS[normalizeBudgetType(budgetType)] ?? budgetType}
          </span>
        )}
      </span>
    </button>
  );
}

export function CategoryPicker({
  categories,
  current,
  flat = false,
  onChange: onChangeProp,
  triggerClassName,
  placeholder = "Category",
  showSelectedIcon = false,
}: CategoryPickerProps) {
  const router = useRouter();
  const params = useSearchParams();
  const isFormMode = !!onChangeProp;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();
  // On mobile the filter button sits in the sheet's header row next to the close
  // button, so it takes the close button's styling.
  const { budgetType, showSubcategories, filterMenu } = useCategoryFilter({
    triggerClassName: isMobile ? "size-11 rounded-full bg-white dark:bg-white/7 text-foreground" : undefined,
  });

  // Hide the mobile bottom nav while the picker sheet is open.
  useEffect(() => {
    if (!open) return;
    return acquireNavHidden();
  }, [open]);

  // iOS home-screen PWA keyboard handling. Focusing the (bottom) search input makes
  // iOS scroll the whole document up (~353px) to reveal it, dragging the list + page
  // behind it — but iOS has already resized the viewport to sit above the keyboard,
  // so that scroll is redundant. Pin scrollY back to 0 so the dialog stays put.
  //
  // Separately, after the keyboard closes iOS leaves the WKWebView ~62px short of the
  // screen (window.innerHeight stuck at 894 vs screen 956) — a strip of system
  // background at the bottom. Only a real gesture makes WebKit recompute its size.
  // Toggling the viewport <meta> forces that recompute without a scroll; we fire it
  // when the keyboard closes and again as the picker closes.
  useEffect(() => {
    if (!open || !isMobile) return;
    const vv = window.visualViewport;
    let restHeight = vv ? vv.height : window.innerHeight;
    let keyboardWasOpen = false;

    const pin = () => {
      if (vv) restHeight = Math.max(restHeight, vv.height);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      const html = document.documentElement;
      if (html.scrollTop !== 0) html.scrollTop = 0;
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      const keyboardOpen = vv ? vv.height < restHeight - 100 : false;
      if (keyboardWasOpen && !keyboardOpen) forceViewportRecompute();
      keyboardWasOpen = keyboardOpen;
    };
    window.addEventListener("scroll", pin, true);
    vv?.addEventListener("scroll", pin);
    vv?.addEventListener("resize", pin);
    return () => {
      window.removeEventListener("scroll", pin, true);
      vv?.removeEventListener("scroll", pin);
      vv?.removeEventListener("resize", pin);
      [50, 350, 700].forEach((d) => setTimeout(forceViewportRecompute, d));
    };
  }, [open, isMobile]);

  function onChange(value: string) {
    if (onChangeProp) {
      onChangeProp(value === "none" ? "" : value);
      return;
    }
    const next = new URLSearchParams(params.toString());
    if (value) next.set("category", value);
    else next.delete("category");
    router.push(`?${next.toString()}`);
  }

  let label = placeholder;
  let selectedCat: Category | undefined;
  if (!current) label = placeholder;
  else if (current === "none") label = "Uncategorized";
  else {
    selectedCat = categories.find((c) => String(c.id) === current);
    if (selectedCat) label = selectedCat.name;
  }

  const isFiltered = !!current;

  const triggerClass = cn(
    flat
      ? filterPillClass(isFiltered, "flex-1 min-w-0")
      : `flex items-center gap-2 text-sm font-normal rounded-full pl-3 pr-3 py-2 cursor-pointer ${
          isFiltered ? "text-foreground" : "text-foreground/60"
        }`,
    triggerClassName,
  );

  const triggerContent = (
    <>
      {showSelectedIcon && selectedCat && (
        <Icon iconKey={selectedCat.icon} color={selectedCat.color} round size="xs" />
      )}
      <span className={flat || isFormMode ? "flex-1 truncate text-left" : "max-w-[140px] truncate"}>{label}</span>
      {flat && isFiltered ? (
        <span
          role="button"
          tabIndex={0}
          aria-label="Clear filter"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onChange(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onChange(""); } }}
          className="shrink-0"
        >
          <X className="size-4.5" />
        </span>
      ) : (
        <ChevronDown className="size-4.5 shrink-0" />
      )}
    </>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
        {triggerContent}
      </button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
        <DialogContent
          // Extra bottom padding on mobile so the last categories can scroll clear of
          // the floating search bar that overlays the bottom of the sheet.
          className={cn("sm:max-w-sm", isMobile && "pb-28")}
          fullHeight
          hideHandle
          headerAction={isMobile ? filterMenu : undefined}
          // On mobile the title is rendered by the sheet's own fixed header row,
          // which reserves space around the close button — a separate in-flow
          // DialogTitle here would sit right underneath it and visually overlap.
          title={isMobile ? "Category" : undefined}
        >
          {!isMobile && (
            <DialogHeader actions={filterMenu}>
              <DialogTitle>Category</DialogTitle>
            </DialogHeader>
          )}
          <CategoryGrid
            categories={categories}
            current={current}
            isFormMode={isFormMode}
            fill
            budgetType={budgetType}
            showSubcategories={showSubcategories}
            onChange={onChange}
            onClose={() => setOpen(false)}
            search={search}
            onSearchChange={setSearch}
            // On mobile the search is the floating portal bar below; on desktop it stays
            // inline at the bottom of the grid (no keyboard to float above).
            hideSearch={isMobile}
          />
        </DialogContent>
      </Dialog>
      {/* Floating search — mobile only, portalled to <body> so it's viewport-fixed. */}
      {open && isMobile && <FloatingSearchBar search={search} onSearchChange={setSearch} />}
    </>
  );
}
