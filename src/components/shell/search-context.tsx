"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { GlobalSearchOverlay } from "@/components/global-search-overlay";
import { useNavHidden } from "@/lib/nav-visibility";

// Search stays the existing full-screen overlay, opened with Cmd/Ctrl+K from anywhere
// or from the shell's search controls (the sidebar field, the phone tab bar button). The overlay is owned here,
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
