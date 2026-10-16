import Link from "next/link";

import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

/**
 * A Clear list row: icon tile, title + meta, and a trailing slot (amount, chip,
 * chevron). Renders a link with `href`, a button with `onClick`, else a plain div.
 * Rows sit inside a card; consecutive rows are separated by a hairline.
 */
export function ListRow({
  icon,
  title,
  meta,
  trailing,
  href,
  onClick,
  selected = false,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate text-[15px] font-bold">{title}</span>
        {meta && <span className="truncate text-[13px] text-clear-muted"><MoneyText>{meta}</MoneyText></span>}
      </span>
      {trailing}
    </>
  );
  const cls = cn(
    "flex min-h-16 w-full items-center gap-3 border-b border-clear-ground px-2 font-clear text-clear-ink no-underline last:border-b-0",
    (href || onClick) && "cursor-pointer rounded-clear-row transition-colors hover:bg-clear-tile",
    selected && "rounded-clear-row bg-clear-tile",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cls} aria-current={selected ? "true" : undefined}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-pressed={selected}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
