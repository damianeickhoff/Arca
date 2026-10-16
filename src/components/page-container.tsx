// ─── Shared layout classes ───────────────────────────────────────────────────
//
// Pages use the Clear layout described in AGENTS.md ("Clear design system"); the legacy
// page primitives (PageShell, PageContainer, SPLIT_GRID*) are gone. What is left:
//   • SPLIT_COLUMNS_WIDE — Activity's list | transaction column template.
//   • SHEET_COLUMN       — a readable centred column for sheets, dialogs, tips and
//     docked bars (in flow, or combined with `fixed inset-x-0`).

/** The list | transaction column template: the right column two fifths, at least
 *  460px, for a detail panel next to a list (Activity). */
export const SPLIT_COLUMNS_WIDE = "lg:grid-cols-[minmax(0,3fr)_minmax(460px,2fr)]";

/** A readable centred column for sheet and dialog content. */
export const SHEET_COLUMN = "mx-auto w-full max-w-2xl";
