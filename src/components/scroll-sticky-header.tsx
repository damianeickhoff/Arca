"use client";

import type { RefObject } from "react";
import { cn } from "@/lib/utils";
import { useScrollElevation } from "@/lib/use-scroll-elevation";

// Client-component wrapper for the app's ad-hoc per-page sticky headers (most of
// which live in server component pages, so the scroll hook can't be inlined
// directly there). Transparent at rest; `scrolledClassName` (the page's existing
// blur/background/border classes) is applied only once the page has been
// scrolled past the threshold.
export function ScrollStickyHeader({
  children,
  className,
  scrolledClassName,
}: {
  children: React.ReactNode;
  className?: string;
  scrolledClassName: string;
}) {
  const [ref, scrolled] = useScrollElevation();

  return (
    <div
      ref={ref as RefObject<HTMLDivElement>}
      className={cn(className, "transition-colors duration-300", scrolled ? scrolledClassName : "border-b border-transparent")}
    >
      {children}
    </div>
  );
}
