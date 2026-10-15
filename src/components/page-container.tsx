import { cn } from "@/lib/utils";

// ─── Legacy (mustard) page layout ────────────────────────────────────────────
//
// These primitives belong to the pre-Clear pages. Migrated pages use the Clear layout
// described in AGENTS.md ("Clear design system") instead; delete each export here once
// its last user has been migrated.
//
//   • <PageShell header={…}>  — phone 20px gutters; desktop 84px header row, 36px side
//     padding, 4px 36px 36px content padding, 20px between sections.
//   • PAGE_COLUMN              — an in-flow element that must line up with page content.
//   • SPLIT_GRID / SPLIT_GRID_WIDE — the two-column desktop page layouts.
//   • SHEET_COLUMN             — a readable centred column for sheets, dialogs, tips and
//     docked bars (in flow, or combined with `fixed inset-x-0`).

/** In-flow page width: the full width, no cap. */
export const PAGE_COLUMN = "w-full";

/**
 * The desktop two-column page layout: a main column plus a right column that grows with
 * the screen instead of staying a fixed width. Phones stack.
 *   • SPLIT_GRID       — right column one third of the space, at least 380px (Plan).
 *   • SPLIT_GRID_WIDE  — right column two fifths, at least 460px, for a detail panel next
 *                        to a list (Activity).
 */
export const SPLIT_GRID =
  "flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(380px,1fr)] lg:items-start";
export const SPLIT_GRID_WIDE =
  "flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(460px,2fr)] lg:items-start";
/** Just the column template of SPLIT_GRID_WIDE, for a grid that defines its own rows
 *  (Activity: link tiles | summary, then list | transaction). */
export const SPLIT_COLUMNS_WIDE = "lg:grid-cols-[minmax(0,3fr)_minmax(460px,2fr)]";

/** A readable centred column for sheet and dialog content. */
export const SHEET_COLUMN = "mx-auto w-full max-w-2xl";

/**
 * The legacy page primitive. One tree for every width: phones get 20px gutters and the
 * page's own (mobile) header; from lg the optional `header` sits in an 84px row with
 * 36px side padding, and the body gets 4px 36px 36px padding with 20px between its
 * direct children.
 */
export function PageShell({
  header,
  children,
  className,
  bodyClassName,
}: {
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn(PAGE_COLUMN, "px-5 pt-[var(--sat)] lg:px-9 lg:pt-0", className)}>
      {header && <div className="flex h-[62px] items-center pt-[18px] lg:h-[84px] lg:pt-0">{header}</div>}
      <div className={cn("flex flex-col gap-5 lg:pt-1 lg:pb-9", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Legacy wrapper for pages not yet rebuilt on PageShell. */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(PAGE_COLUMN, "px-4 lg:px-9", className)}>{children}</div>;
}
