import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A page's title row: the title (28px on phones, 30px from lg), an optional subtitle
 * line in ink-3, and whatever actions the page puts on the right (search, filters,
 * the primary button).
 */
export function PageHeading({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-center gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <h1 className="heading truncate text-[28px] leading-[1.15] text-ink lg:text-[30px]">{title}</h1>
        {subtitle && <p className="truncate text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * A section's title with an optional link on the right in accent-strong — "Coming up
 * · €1.173 due", "Spending · All categories". Pass `href` for a link, or `onClick`
 * for an in-page action; `link` alone renders as a plain caption.
 */
export function SectionHead({
  title,
  link,
  href,
  onClick,
  size = "md",
  className,
}: {
  title: React.ReactNode;
  link?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const linkClass = "shrink-0 text-[13px] font-semibold text-mustard-strong hover:underline underline-offset-4";
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <h2 className={cn("heading leading-[1.15] text-ink", size === "sm" ? "text-[17px]" : "text-lg")}>{title}</h2>
      {link != null &&
        (href ? (
          <Link href={href} className={linkClass}>
            {link}
          </Link>
        ) : onClick ? (
          <button type="button" onClick={onClick} className={linkClass}>
            {link}
          </button>
        ) : (
          <span className="shrink-0 text-[13px] font-semibold text-mustard-strong">{link}</span>
        ))}
    </div>
  );
}
