import Link from "next/link";
import { cn } from "@/lib/utils";

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
