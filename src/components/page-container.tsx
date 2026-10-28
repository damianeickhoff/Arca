// ─── Shared layout classes ───────────────────────────────────────────────────
//
// Pages use the Clear layout described in AGENTS.md ("Clear design system"); the legacy
// page primitives (PageShell, PageContainer, SPLIT_GRID*) are gone. What is left:
//   • SHEET_COLUMN — a readable centred column for sheets, dialogs, tips and docked
//     bars (in flow, or combined with `fixed inset-x-0`).

/** A readable centred column for sheet and dialog content. */
export const SHEET_COLUMN = "mx-auto w-full max-w-2xl";
