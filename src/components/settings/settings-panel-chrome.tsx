"use client";

import { createContext, useContext, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { IconChevronLeft, IconXFilled } from "@tabler/icons-react";
import { useScrollElevation } from "@/lib/use-scroll-elevation";
import { ScrollHeaderBackdrop } from "@/components/scroll-header-backdrop";
import { cn } from "@/lib/utils";

// Lets the data-heavy settings panels (Accounts / Categories / Recurring / …) render
// their OWN header — with panel-specific actions (+ / edit / filter) that need the
// panel's own client state — instead of the generic header the host draws for the
// simpler panels. Two hosts provide it:
//   • SettingsDialog (phones, variant "sheet"): a sticky row with a back button that
//     calls `closePanel` to slide the panel away.
//   • the /settings page (variant "page"): the panel sits in a card next to the
//     settings navigation, so there is nothing to go back to — the header is the
//     card's title row (title, subtitle, actions) and draws no back button.
// `title` / `subtitle` are the host's translated copy for the open panel; they win
// over the title a panel passes itself.
export interface PanelChrome {
  closePanel: () => void;
  variant?: "sheet" | "page";
  title?: string;
  subtitle?: string;
}

export const PanelChromeContext = createContext<PanelChrome>({
  closePanel: () => {},
});

export function usePanelChrome() {
  return useContext(PanelChromeContext);
}

/** The open panel's header. In the dialog: circular back button, centred title,
 * right-aligned action slot, sticky to the top of the scrolling panel. `transparent`
 * keeps it permanently see-through (the Settings home hero, which floats over
 * Sparkles); otherwise it picks up the blur + bottom border once the panel has been
 * scrolled. `closeIcon` swaps the back chevron for an X — used only by the root menu,
 * whose button closes the whole dialog rather than popping back to a previous panel.
 * On the /settings page it renders as the panel card's title row instead. */
export function PanelHeader({
  title,
  action,
  transparent = false,
  closeIcon = false,
}: {
  title: string;
  action?: React.ReactNode;
  transparent?: boolean;
  closeIcon?: boolean;
}) {
  const t = useTranslations("settings");
  const chrome = usePanelChrome();
  const [ref, scrolled] = useScrollElevation();
  const heading = chrome.title ?? title;

  if (chrome.variant === "page") {
    // Sticks to the top of the panel card's scroller. The card pads its scroller by
    // --panel-gutter; the header bleeds over that padding so content scrolling under
    // it never shows at the sides.
    return (
      <div
        ref={ref as RefObject<HTMLDivElement>}
        className={cn(
          "sticky top-[var(--sat,0px)] z-20 -mx-[var(--panel-gutter,0px)] flex flex-wrap items-start justify-between gap-3 border-b bg-clear-card px-[calc(var(--panel-gutter,0px)+1rem)] pt-6 pb-4 font-clear text-clear-ink transition-colors lg:pt-7",
          scrolled ? "border-clear-line" : "border-transparent",
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] lg:text-2xl">{heading}</h2>
          {chrome.subtitle && <span className="text-sm text-clear-muted">{chrome.subtitle}</span>}
        </div>
        {action && <div className="flex shrink-0 items-center justify-end gap-2">{action}</div>}
      </div>
    );
  }

  return (
    <div ref={ref as RefObject<HTMLDivElement>} className="sticky top-0 z-20 flex items-center gap-2 px-5 pt-5 pb-3">
      {transparent ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-0 border-b border-transparent" />
      ) : (
        <ScrollHeaderBackdrop scrolled={scrolled} />
      )}

      <button
        type="button"
        onClick={chrome.closePanel}
        aria-label={closeIcon ? t("close") : t("back")}
        className="relative flex items-center justify-center size-11 rounded-full border border-line bg-surface hover:bg-surface-2 active:scale-[0.97] transition-transform shrink-0"
      >
        {closeIcon ? (
          <IconXFilled className="size-5 text-ink" />
        ) : (
          <IconChevronLeft className="size-5 text-ink" />
        )}
      </button>

      <h2 className="heading relative min-w-0 flex-1 truncate px-2 text-center text-lg text-ink">
        {heading}
      </h2>

      <div className="relative flex items-center justify-end gap-2 shrink-0 min-w-11">
        {action}
      </div>
    </div>
  );
}
