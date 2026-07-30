"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence, spring } from "@/lib/motion";
import { CONTENT_COLUMN } from "@/components/page-container";
import { TipCard } from "@/components/tip-card";
import { useContextualTip, type TipId } from "@/lib/tips";
import { cn } from "@/lib/utils";

/**
 * The one-time explainer for a feature the user has just opened — see src/lib/tips.ts
 * for the storage and single-slot rules, and <AnchoredTip> for the variant that points
 * at a specific control instead.
 *
 * It drops in from the top rather than floating above the bottom nav: the bottom of
 * the screen is where this app puts everything the user is trying to reach (the nav
 * pill, the floating add button, every sheet), and a card parked there would be in
 * the way of the very feature it's describing. Portalled to <body> at z-90 — above
 * the full-screen portals (z-45/z-70) and the sheets (z-50) it gets shown over.
 */
export function ContextualTip({ id, active = true }: { id: TipId; active?: boolean }) {
  const { visible, dismiss, dismissAll } = useContextualTip(id, active);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the body portal can't render until after mount, or SSR and hydration disagree
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <m.div
          key={id}
          initial={{ opacity: 0, y: -28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20, transition: { duration: 0.18 } }}
          transition={spring.gentle}
          // pointer-events-none on the positioning wrapper so the full-width column
          // never swallows taps on whatever sits beside the card.
          className={cn(CONTENT_COLUMN, "fixed inset-x-0 top-0 z-[90] px-4 pointer-events-none")}
          style={{ paddingTop: "calc(var(--sat) + 0.75rem)" }}
          role="status"
          // A tip can be shown over an open vaul sheet (the receipt scanner). Without
          // this marker, tapping its buttons reads as an outside-interaction and closes
          // the sheet underneath — see keepOpenOnOutside in components/ui/dialog.tsx.
          // The card's own pointer-events-auto is what gets it past the body-level
          // pointer-events lock vaul applies while a modal sheet is open.
          data-dialog-keep-open=""
        >
          <TipCard id={id} onDismiss={dismiss} onDismissAll={dismissAll} />
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
