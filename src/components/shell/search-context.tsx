"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { GlobalSearchOverlay } from "@/components/global-search-overlay";
import { useNavHidden } from "@/lib/nav-visibility";
import { cn } from "@/lib/utils";

// Search stays the existing full-screen overlay, opened with Cmd/Ctrl+K from anywhere
// or from a search button a page puts in its own header. The overlay is owned here,
// once, by the app shell — pages only ask for it to open.

interface SearchContextValue {
  /** Opens the overlay, expanding from `origin` when given (the button's rect). */
  openSearch: (origin?: DOMRect | null) => void;
}

const SearchContext = createContext<SearchContextValue>({ openSearch: () => {} });

export function useGlobalSearch() {
  return useContext(SearchContext);
}

export function SearchProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const navHidden = useNavHidden();

  const openSearch = useCallback((origin?: DOMRect | null) => {
    setOriginRect(origin ?? null);
    setOpen(true);
  }, []);

  // Ctrl/Cmd+K opens search from anywhere. Skipped while a full-screen overlay holds
  // the screen (the key belongs to whatever is in front) or a sheet is open.
  useEffect(() => {
    if (!enabled || navHidden) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "k" && e.key !== "K") return;
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.altKey || e.shiftKey) return;
      if (document.querySelector('[data-vaul-drawer][data-state="open"]')) return;
      e.preventDefault();
      setOriginRect(null);
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, navHidden]);

  const value = useMemo(() => ({ openSearch }), [openSearch]);

  return (
    <SearchContext.Provider value={value}>
      {children}
      {enabled && <GlobalSearchOverlay open={open} onClose={() => setOpen(false)} originRect={originRect} />}
    </SearchContext.Provider>
  );
}

/**
 * The header search control. A 40px round icon button on phones; from lg up, a wide
 * pill that reads like a field and shows the keyboard shortcut.
 */
export function SearchButton({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const { openSearch } = useGlobalSearch();
  return (
    <button
      type="button"
      onClick={(e) => openSearch(e.currentTarget.getBoundingClientRect())}
      aria-label={t("search")}
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2.5 rounded-full border border-line bg-surface text-ink transition-colors hover:bg-surface-2",
        "w-10 lg:w-[300px] lg:justify-start lg:px-4 lg:text-ink-3",
        className,
      )}
    >
      <IconSearch size={18} stroke={1.8} className="shrink-0" />
      <span className="hidden flex-1 text-left text-[13px] lg:inline">{t("searchPlaceholder")}</span>
      <span className="hidden font-mono text-[11px] lg:inline">{t("searchShortcut")}</span>
    </button>
  );
}
