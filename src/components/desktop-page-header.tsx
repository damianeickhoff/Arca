"use client";

import { cn } from "@/lib/utils";
import { useScrollElevation } from "@/lib/use-scroll-elevation";

// The desktop page header on the mobile design system: token-based translucent
// backdrop instead of the legacy ad-hoc bg-white/40 bar, heading font shared with
// card/dialog titles. Replaces the per-page copies of the old sticky header.
// Transparent at rest, picks up the blur + bottom border only once the page has
// actually been scrolled.
export function DesktopPageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const [ref, scrolled] = useScrollElevation();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={cn(
        "sticky top-0 z-10 px-8 py-4 flex items-end justify-between gap-4 transition-colors duration-300",
        scrolled
          ? "bg-background/70 backdrop-blur-xl backdrop-saturate-150 border-b border-black/5 dark:border-white/10"
          : "border-b border-transparent",
        className,
      )}
    >
      <div className="mt-6">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-foreground/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
