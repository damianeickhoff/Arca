"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence, spring } from "@/lib/motion";
import { TipCard } from "@/components/tip-card";
import { isTipPending, useContextualTip, type TipId } from "@/lib/tips";
import {
  ANCHOR_POLL_MS,
  ANCHOR_TIMEOUT_MS,
  ARROW,
  findAnchor,
  inflateRadius,
  measure,
  samePlacement,
  type Placement,
  type TipAnchor,
} from "@/lib/tip-placement";

// Geometry lives in @/lib/tip-placement so <TipWalkthrough> can point at controls the
// same way. Re-exported here because call sites already import the type from this module.
export type { TipAnchor };

/**
 * A tip pinned next to a control — "your budget lives here", "tap a row for the
 * details". Shares its storage, its one-at-a-time slot and its card with
 * <ContextualTip> (see src/lib/tips.ts); the difference is only where it sits and
 * that it draws a ring around what it is talking about.
 *
 * Nothing is blocked while it's up: no dimming backdrop, and the ring is
 * pointer-transparent, so the user can just tap the thing being pointed at — which
 * also dismisses the tip, since at that point it has done its job.
 */
export function AnchoredTip({
  id,
  anchor,
  active = true,
}: {
  id: TipId;
  anchor: TipAnchor;
  active?: boolean;
}) {
  const [anchorEl, setAnchorEl] = useState<Element | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the body portal can't render until after mount, or SSR and hydration disagree
  useEffect(() => { setMounted(true); }, []);

  // Look for the anchor only while the tip is actually owed — every other render of
  // this component (the overwhelming majority, once the user has seen it) does no
  // DOM work at all.
  useEffect(() => {
    if (!active || !isTipPending(id)) return;
    const deadline = Date.now() + ANCHOR_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function look() {
      const el = findAnchor(anchor);
      if (el && measure(el)) {
        setAnchorEl(el);
        return;
      }
      if (Date.now() < deadline) timer = setTimeout(look, ANCHOR_POLL_MS);
    }
    look();
    return () => {
      clearTimeout(timer);
      setAnchorEl(null);
    };
  }, [id, anchor, active]);

  // The slot is claimed (and the tip recorded as seen) only once the anchor is
  // resolved, so a tip whose control isn't on screen this time isn't spent.
  const { visible, dismiss, dismissAll } = useContextualTip(id, active && anchorEl != null);

  // Track the anchor while the card is up: scrolling, a rotation, or a list
  // reflowing underneath all move it. If it goes away entirely, so does the tip.
  const reposition = useCallback(() => {
    if (!anchorEl) return;
    const next = anchorEl.isConnected ? measure(anchorEl) : null;
    // Keep the previous object when nothing moved — the periodic re-check below runs
    // while the card is on screen, and a fresh object every time would re-render (and
    // re-animate) a card that hasn't budged.
    setPlacement((prev) => (samePlacement(prev, next) ? prev : next));
    if (!next) dismiss();
  }, [anchorEl, dismiss]);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the anchor's layout out of the DOM is exactly what this effect synchronises; nothing renders until it has
    reposition();
    let frame = 0;
    function onViewportChange() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reposition);
    }
    window.addEventListener("scroll", onViewportChange, { passive: true, capture: true });
    window.addEventListener("resize", onViewportChange);
    // A slow re-check on top of the events, so the card also notices things no
    // scroll or resize reports — a sheet opening over its control, the control's
    // own row being re-rendered away underneath it. Only ever runs while a tip is
    // actually on screen, which is a handful of seconds in a user's whole life.
    const recheck = setInterval(reposition, 500);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(recheck);
      window.removeEventListener("scroll", onViewportChange, { capture: true });
      window.removeEventListener("resize", onViewportChange);
    };
  }, [visible, reposition]);

  // Tapping the control the tip points at answers the tip.
  useEffect(() => {
    if (!visible || !anchorEl) return;
    const el = anchorEl;
    el.addEventListener("click", dismiss);
    return () => el.removeEventListener("click", dismiss);
  }, [visible, anchorEl, dismiss]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {visible && placement && (
        <m.div
          key={id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16 } }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[90] pointer-events-none"
          role="status"
          // Same reasoning as <ContextualTip>: a pointer tip can sit over an open
          // vaul sheet, and its buttons must not read as an outside-interaction.
          data-dialog-keep-open=""
        >
          {/* Highlight ring — sits over the control, but pointer-transparent, so the
              control stays tappable underneath it. */}
          <m.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={spring.gentle}
            className="fixed pointer-events-none border-2 border-clear-ember"
            style={{
              top: placement.anchor.top - 5,
              left: placement.anchor.left - 5,
              width: placement.anchor.width + 10,
              height: placement.anchor.height + 10,
              borderRadius: inflateRadius(placement.anchor.radius, 5),
              boxShadow: "0 0 0 6px color-mix(in srgb, var(--arca-accent) 22%, transparent)",
            }}
          />

          <m.div
            initial={{ opacity: 0, y: placement.below ? -10 : 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement.below ? -8 : 8, transition: { duration: 0.16 } }}
            transition={spring.gentle}
            className="fixed"
            style={{ left: placement.left, top: placement.top, bottom: placement.bottom, width: placement.width }}
          >
            {/* Arrow — a rotated square peeking out from behind the card, so it picks
                up the card's own background in either theme. */}
            {placement.arrow && (
              <div
                aria-hidden
                className="absolute bg-clear-card border border-clear-line rotate-45 rounded-[3px]"
                style={{
                  width: ARROW,
                  height: ARROW,
                  left: placement.arrowX - ARROW / 2,
                  top: placement.below ? -ARROW / 2 + 2 : undefined,
                  bottom: placement.below ? undefined : -ARROW / 2 + 2,
                }}
              />
            )}
            <div className="relative">
              <TipCard id={id} onDismiss={dismiss} onDismissAll={dismissAll} compact maxHeight={placement.maxHeight} />
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
