import Link from "next/link";

import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

/**
 * The Clear card: borderless white (dark: #17171A) on the grey ground, 24px radius,
 * no shadow. `hero` is the single "answer" card per page — black in light mode,
 * inverted in dark mode. Cards render as <section> so each one is a landmark-able
 * region; pass aria-label when it has no visible heading.
 */
export function ClearCard({
  hero = false,
  className,
  ...props
}: React.ComponentProps<"section"> & { hero?: boolean }) {
  return (
    <section
      data-slot="clear-card"
      className={cn(
        "flex min-w-0 flex-col gap-[18px] rounded-clear-card p-6 font-clear",
        hero ? "bg-clear-hero text-clear-hero-ink" : "bg-clear-card text-clear-ink",
        className,
      )}
      {...props}
    />
  );
}

/** Card title on the left (18px bold, optional subtitle) and one action on the right. */
export function ClearCardHeader({
  title,
  subtitle,
  action,
  as: Heading = "h2",
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Heading className="m-0 text-lg font-bold">{title}</Heading>
        {subtitle && <span className="text-sm text-clear-muted"><MoneyText>{subtitle}</MoneyText></span>}
      </div>
      {action}
    </div>
  );
}

/** The orange text link used as a card action ("Open Plan", "View all"). */
export function ClearCardLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("text-sm font-bold text-clear-ember-text no-underline hover:underline", className)}>
      {children}
    </Link>
  );
}

/** A grey tile inside a card (stat boxes, grouped field lists, previews). */
export function ClearTile({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-clear-tile bg-clear-tile p-4", className)} {...props} />;
}
