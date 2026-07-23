"use client";

import { createContext, useContext, type RefObject } from "react";
import { IconChevronLeft, IconXFilled } from "@tabler/icons-react";
import { useScrollElevation } from "@/lib/use-scroll-elevation";
import { ScrollHeaderBackdrop } from "@/components/scroll-header-backdrop";

// Lets the data-heavy settings panels (Accounts / Categories / Recurring) render their
// OWN sticky header — with a back button and panel-specific actions (+ / edit / filter)
// that need the panel's own client state — instead of the generic header SettingsDialog
// draws for the simpler panels. SettingsDialog provides `closePanel` through this context.
export const PanelChromeContext = createContext<{ closePanel: () => void }>({
  closePanel: () => {},
});

export function usePanelChrome() {
  return useContext(PanelChromeContext);
}

/** Sticky panel header matching SettingsDialog's generic one: circular back button,
 * centered title, right-aligned action slot. Sticks to the top of the scrolling panel.
 * `transparent` keeps the header permanently see-through (the Settings home hero, which
 * floats over Sparkles); otherwise it starts transparent and only picks up the blur +
 * bottom border once the panel has actually been scrolled. `closeIcon` swaps the back
 * chevron for an X — used only by the root menu, whose back button closes the whole
 * dialog rather than popping back to a previous panel. */
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
  const { closePanel } = usePanelChrome();
  const [ref, scrolled] = useScrollElevation();

  return (
    <div ref={ref as RefObject<HTMLDivElement>} className="sticky top-0 z-20 flex items-center gap-2 px-5 pt-5 pb-3">
      {transparent ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-0 border-b border-transparent" />
      ) : (
        <ScrollHeaderBackdrop scrolled={scrolled} />
      )}

      <button
        type="button"
        onClick={closePanel}
        aria-label={closeIcon ? "Close" : "Back"}
        className="relative flex items-center justify-center size-11 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-sm active:scale-[0.97] transition-transform shrink-0"
      >
        {closeIcon ? (
          <IconXFilled className="size-5 text-foreground" />
        ) : (
          <IconChevronLeft className="size-5 text-foreground" />
        )}
      </button>

      <h2 className="relative flex-1 min-w-0 text-center text-xl font-normal text-foreground truncate px-2">
        {title}
      </h2>

      <div className="relative flex items-center justify-end gap-2 shrink-0 min-w-11">
        {action}
      </div>
    </div>
  );
}