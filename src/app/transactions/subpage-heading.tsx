import Link from "next/link";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { MoneyText } from "@/components/clear/money";

/**
 * The heading row of a page that lives under Activity (Upcoming, Needs a category).
 * Desktop: an "Activity ›" breadcrumb above the 40px title, the subtitle under it and
 * the actions on the right. Phones: a round back button beside the 26px title.
 * Every string arrives translated.
 */
export function SubpageHeading({
  parentHref,
  parentLabel,
  breadcrumbLabel,
  title,
  subtitle,
  actions,
}: {
  parentHref: string;
  /** The parent page's name: the breadcrumb text and the back button's label. */
  parentLabel: string;
  /** The breadcrumb's accessible name ("Breadcrumb"). */
  breadcrumbLabel: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
      <div className="flex min-w-0 items-center gap-3 lg:flex-col lg:items-start lg:gap-1.5">
        <Link
          href={parentHref}
          aria-label={parentLabel}
          className={cn(clearButtonVariants({ variant: "surface", size: "icon" }), "lg:hidden")}
        >
          <IconChevronLeft aria-hidden />
        </Link>
        <nav aria-label={breadcrumbLabel} className="hidden items-center gap-1.5 text-sm font-bold text-clear-muted lg:flex">
          <Link href={parentHref} className="text-clear-ember-text no-underline hover:underline">
            {parentLabel}
          </Link>
          <IconChevronRight size={14} stroke={2.4} aria-hidden />
          <span aria-current="page" className="text-clear-ink-2">
            {title}
          </span>
        </nav>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 truncate text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{title}</h1>
          {subtitle && (
            <span className="hidden text-base text-clear-ink-2 lg:inline">
              <MoneyText>{subtitle}</MoneyText>
            </span>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
