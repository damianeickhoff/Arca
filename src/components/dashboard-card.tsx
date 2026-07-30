// Shared typography for the dashboard's card row (budget alert, cash flow forecast,
// financial health). The cards show very different things in the middle, but they sit
// side by side — as a scroll row on a phone and as a 3-column grid from md up — so the
// frame around that middle has to be identical: title at the top, subtitle pinned to
// the bottom, both at the same size and colour in every card.
//
// Kept as class constants rather than a wrapper component: each card owns its own
// button/layout semantics (two open portals, one is a plain div), and a wrapper would
// have to re-expose all of that. Import the constants, keep your own structure.

/** Card title. Always the first element in the card. Wraps rather than truncating —
 * a card is narrow and several of these titles are two or three words, and a title cut
 * off mid-word tells the user less than a second line does. `min-w-0` so it actually
 * shrinks (and therefore wraps) beside the pill instead of pushing it off the card. */
export const DASH_CARD_TITLE = "text-xs font-semibold text-foreground break-words min-w-0";

/** Wrapper for everything between the title and the subtitle. Takes the leftover
 * height and centres its contents in it, so the middle of each card sits on the same
 * optical line however tall the row's cards end up (they stretch to the tallest in the
 * md grid). Add your own `gap-*` — the contents differ per card. */
export const DASH_CARD_BODY = "flex-1 flex flex-col justify-center";

/** Supporting line. Always the last element; `mt-auto` pins it to the bottom so the
 * subtitles line up across cards of unequal content height. */
export const DASH_CARD_SUBTITLE = "mt-auto pt-1 text-[11px] text-foreground/40 leading-snug line-clamp-2";

/**
 * The status pill that sits opposite the title — one or two words, tinted in the
 * status colour. It's what carries "how am I doing" while flicking through the row,
 * which is why the subtitle underneath can stay a neutral grey in every card.
 */
export function DashCardPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {label}
    </span>
  );
}
