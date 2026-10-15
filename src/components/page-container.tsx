import { cn } from "@/lib/utils";

// ─── The page layout rule ────────────────────────────────────────────────────
//
// Pages do NOT set their own max width or centre themselves. The app shell
// (components/shell/app-shell.tsx + main-content.tsx) puts a 240px sidebar on the left
// from lg up, and page content takes ALL of the remaining width, left-aligned against
// the sidebar — only on very wide screens (2xl) is it capped, at 1600px, still
// left-aligned. Desktop layouts use multi-column grids (a main column plus a 380–460px
// right column), never one stretched column.
//
// Use the primitives below instead of hand-rolled `mx-auto max-w-*` wrappers:
//   • <PageShell header={…}>  — every page: phone 20px gutters; desktop 84px header row,
//     36px side padding, 4px 36px 36px content padding, 20px between sections.
//   • PAGE_COLUMN              — an in-flow element that must line up with page content.
//   • FULLSCREEN_OVERLAY       — add to a `fixed inset-0` page-like overlay so it fills
//     the main area next to the sidebar.
//   • SHEET_COLUMN / SHEET_FIXED — sheets, dialogs, tips and docked bars: a readable
//     centred column (in flow / for fixed elements, which also clears the sidebar).
//
// AGENTS.md repeats this rule.

/** In-flow page width: everything next to the sidebar, capped at 1600px on 2xl. */
export const PAGE_COLUMN = "w-full 2xl:max-w-[1600px]";

/** For `fixed inset-0` / `fixed inset-x-0` page-like overlays: start right of the sidebar. */
export const FULLSCREEN_OVERLAY = "lg:left-60";

/** A readable centred column for sheet and dialog content (in flow). */
export const SHEET_COLUMN = "mx-auto w-full max-w-2xl";

/** The same column for a fixed element (a sheet, a docked bar, a tip): centred over the
 *  main area, clear of the sidebar from lg. Must be combined with `fixed inset-x-0`. */
export const SHEET_FIXED = cn(SHEET_COLUMN, "lg:left-60");

/**
 * The shared page primitive. One tree for every width: phones get 20px gutters and the
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

/**
 * Legacy wrapper for pages not yet rebuilt on PageShell: full width next to the sidebar
 * (no centred column any more), phone gutters as before, 36px desktop gutters.
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(PAGE_COLUMN, "px-4 lg:px-9", className)}>{children}</div>;
}
