"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  IconHome,
  IconHomeFilled,
  IconTarget,
  IconTargetArrow,
  IconSearch,
  IconX,
  IconCreditCard,
  IconCreditCardFilled,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { m, spring, AnimatePresence } from "@/lib/motion";
import { useEffect, useRef, useState } from "react";
import { GlobalSearchOverlay } from "@/components/global-search-overlay";
import { useNavHidden } from "@/lib/nav-visibility";

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; stroke?: number }>;
  IconActive: React.ComponentType<{ size?: number; stroke?: number }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/",       label: "Home",  Icon: IconHome,   IconActive: IconHomeFilled },
  { href: "/goals",  label: "Goals", Icon: IconTarget, IconActive: IconTargetArrow },
  { href: "/debts",  label: "Debts", Icon: IconCreditCard, IconActive: IconCreditCardFilled },
];

// Morphs between the search glyph and a close cross — used on the bottom-nav
// search button and mirrored on the search overlay's own close button so the
// two read as the same element continuing its animation across the transition.
export function SearchCloseIcon({ open, size }: { open: boolean; size: number }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span
        key={open ? "close" : "search"}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
        transition={spring.snappy}
        className="flex items-center justify-center"
      >
        {open ? <IconX size={size} stroke={1.5} /> : <IconSearch size={size} stroke={1.5} />}
      </m.span>
    </AnimatePresence>
  );
}

// Shared background pill that slides between active tabs. Rather than a
// single FLIP-animated element (see the desktop Nav's layoutId pill), this
// keeps a second "echo" blob briefly alive at the tab it's leaving — both
// wrapped in the goo filter (goo-filter-defs.tsx) so the two overlapping
// circles blur together and pinch apart as the lead blob travels, instead of
// just sliding. Percentage-based (index / count) since the tabs are
// equal-width flex-1 columns, so no DOM measurement is needed.
function LiquidTabIndicator({ activeIndex, count }: { activeIndex: number; count: number }) {
  const prevIndexRef = useRef(activeIndex);
  const [echo, setEcho] = useState<{ index: number; id: number } | null>(null);

  useEffect(() => {
    const prev = prevIndexRef.current;
    prevIndexRef.current = activeIndex;
    if (prev === activeIndex || prev === -1) return;
    const id = Date.now();
    setEcho({ index: prev, id });
    const t = setTimeout(() => setEcho((e) => (e?.id === id ? null : e)), 320);
    return () => clearTimeout(t);
  }, [activeIndex]);

  const widthPct = 100 / count;
  const leftPct = (i: number) => `${i * widthPct}%`;

  return (
    // The goo filter's contrast matrix crushes low-alpha pixels to zero, so the
    // blobs are drawn fully opaque *inside* the filtered layer, then the whole
    // composited result is dimmed from *outside* it via a plain CSS opacity —
    // that preserves the 10%/14% tint look without the filter erasing it.
    <div className="absolute inset-0 pointer-events-none opacity-10 dark:opacity-[0.14]">
      <div className="absolute inset-0" style={{ filter: "url(#goo)" }}>
        {echo && (
          <m.span
            key={echo.id}
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            className="absolute inset-y-0 rounded-full bg-foreground dark:bg-white"
            style={{ width: `${widthPct}%`, left: leftPct(echo.index) }}
          />
        )}
        {activeIndex !== -1 && (
          <m.span
            initial={false}
            animate={{ left: leftPct(activeIndex) }}
            transition={spring.snappy}
            className="absolute inset-y-0 rounded-full bg-foreground dark:bg-white"
            style={{ width: `${widthPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

export const pillContainerClass = cn(
  "glass-nav relative flex items-center rounded-full transition-all duration-300 ease-in-out overflow-hidden",
  "bg-white/70 dark:bg-white/7",
  "backdrop-blur-lg backdrop-saturate-80 dark:backdrop-blur-lg",
  "border-1 border-white/10 dark:border-0",
  "shadow-[0_6px_18px_rgba(109,109,109,0.178),inset_0_1px_1px_rgba(255,255,255,0.205)]",
  "dark:shadow-none",
  "p-[4px]",
);

export function MobileBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [compact, setCompact] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const searchSegmentRef = useRef<HTMLDivElement>(null);
  const navHidden = useNavHidden();

  useEffect(() => {
    let lastY = window.scrollY;
    // Positive = scrolled down, negative = scrolled up.
    // We only commit to a new state once we've accumulated enough distance in
    // one direction, so tiny bounces and micro-scrolls don't trigger the transition.
    let accumulated = 0;
    const THRESHOLD = 55;

    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;

      if (Math.abs(delta) < 2) return;

      // Accumulate in the current direction; reset to zero when direction reverses.
      if (delta > 0) {
        accumulated = Math.max(0, accumulated) + delta;
      } else {
        accumulated = Math.min(0, accumulated) + delta;
      }

      // Going compact only makes sense once we're past the top (prevents the
      // elastic-bounce snap at y=0 from triggering the shrink animation).
      if (accumulated > THRESHOLD && y > 80) {
        setCompact(true);
        accumulated = 0;
      } else if (accumulated < -THRESHOLD) {
        setCompact(false);
        accumulated = 0;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function openSearch() {
    // Capture the button's rect before it starts expanding, so the fullscreen
    // overlay's clip-path animates from the same spot as the dashboard's search button.
    setOriginRect(searchSegmentRef.current?.getBoundingClientRect() ?? null);
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
  }

  if (pathname === "/login" || pathname === "/register" || pathname === "/offline") return null;
  if (searchParams.get("embed") === "1") return null;
  // Hidden while a full-screen overlay (e.g. the category picker) is open.
  if (navHidden) return null;

  const isActive = (item: NavItem) =>
    pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
  const activeIndex = NAV_ITEMS.findIndex(isActive);

  return (
    <>
      <nav
        className={cn(
          "lg:hidden fixed left-6 right-6 bottom-5 z-[60] flex items-center gap-3 transition-all duration-300 ease-in-out",
          compact && !searchOpen ? "right-14 left-14" : "",
        )}
      >
        {/* Nav pill — collapses away entirely when search is open; closing happens
            via the search button morphing into a cross instead. */}
        <div
          className={cn(pillContainerClass, "min-w-0 overflow-hidden")}
          style={{
            flex: searchOpen ? "0 0 0px" : "1 1 auto",
            opacity: searchOpen ? 0 : 1,
            padding: searchOpen ? 0 : undefined,
            border: searchOpen ? "none" : undefined,
            pointerEvents: searchOpen ? "none" : "auto",
          }}
        >
          {!searchOpen && (
            <div className="relative flex items-center justify-between w-full">
              <LiquidTabIndicator activeIndex={activeIndex} count={NAV_ITEMS.length} />
              {NAV_ITEMS.map((item) => {
                const { href, label, Icon, IconActive } = item;
                const active = isActive(item);
                const iconSize = compact ? 23 : 25;
                const className = cn(
                  "relative flex-1 flex items-center justify-center transition-all duration-300 ease-in-out",
                  active
                    ? "text-foreground dark:text-white"
                    : "text-foreground dark:text-white hover:text-foreground/70 dark:hover:text-white/70",
                );
                // Oval — same height for all items so the bar height is uniform. The
                // active background now lives in the shared LiquidTabIndicator above.
                const inner = (
                  <m.span
                    whileTap={{ scale: 0.9 }}
                    transition={spring.press}
                    className={cn(
                      "relative z-10 flex items-center justify-center rounded-full transition-all duration-300 ease-in-out",
                      compact ? "h-11 w-full" : "h-13 w-full",
                    )}
                  >
                    {active ? <IconActive size={iconSize} /> : <Icon size={iconSize} stroke={1.5} />}
                  </m.span>
                );

                return (
                  <Link key={href} href={href} aria-label={label} className={className}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Search — a standalone circular button; tapping it opens the same full-page
            search overlay used elsewhere in the app (GlobalSearchOverlay), expanding
            from this button's position. Its icon morphs from a magnifying glass into
            a cross, which then doubles as the overlay's close button. */}
        <div
          ref={searchSegmentRef}
          className={cn(pillContainerClass, "relative min-w-0")}
          style={{ flex: searchOpen ? "1 1 auto" : "0 0 auto" }}
        >
          <button
            type="button"
            onClick={searchOpen ? closeSearch : openSearch}
            aria-label={searchOpen ? "Close search" : "Search"}
            className={cn(
              "flex items-center justify-center rounded-full text-foreground dark:text-white w-full",
              compact ? "size-11" : "size-13",
            )}
          >
            <SearchCloseIcon open={searchOpen} size={compact ? 23 : 25} />
          </button>
        </div>
      </nav>

      <GlobalSearchOverlay open={searchOpen} onClose={closeSearch} originRect={originRect} />
    </>
  );
}
