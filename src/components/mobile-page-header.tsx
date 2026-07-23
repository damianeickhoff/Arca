"use client";

import { cn } from "@/lib/utils";
import { useScrolled } from "@/lib/use-scrolled";

// The standard mobile page header: hamburger left, glass action buttons right,
// sticky under the iOS status bar. The class strings must stay byte-identical to
// the markup this replaces across the pages — this is de-duplication, not redesign.
//
// Pages with a non-standard header (e.g. transactions' search pill, settings'
// blurred backdrop) pass `children` instead of `actions` to get the bare sticky
// container and provide their own row.
//
// A pre-blurred frost layer sits behind the row and fades in once content
// scrolls underneath (opacity only — backdrop-filter itself is never animated).
function HeaderFrost() {
  const scrolled = useScrolled(8);
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-x-0 bottom-0 top-[calc(-1*var(--sat))] -z-10 pointer-events-none",
        "bg-background/70 backdrop-blur-md",
        "[mask-image:linear-gradient(to_bottom,black_0%,black_70%,transparent_100%)]",
        "transition-opacity duration-250",
        scrolled ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

export function MobilePageHeader({
  actions,
  children,
  className,
}: {
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  if (children) {
    return (
      <div className={cn("sticky top-[var(--sat)] z-40", className)}>
        <HeaderFrost />
        {children}
      </div>
    );
  }
  return (
    <div className={cn("sticky top-[var(--sat)] z-40 flex items-center justify-end px-4 pt-2 pb-3", className)}>
      <HeaderFrost />
      <div className="flex items-center gap-3">{actions}</div>
    </div>
  );
}
