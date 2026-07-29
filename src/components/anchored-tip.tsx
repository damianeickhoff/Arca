"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence, spring } from "@/lib/motion";
import { TipCard } from "@/components/tip-card";
import { isTipPending, useContextualTip, type TipId } from "@/lib/tips";

/** Mark the control a tip points at: `data-tip-anchor="budgetButton"`. A plain data
 *  attribute rather than a ref so the tip can be declared anywhere in the tree —
 *  several of these controls sit deep inside components that have no business
 *  knowing a tip exists. */
export type TipAnchor =
  | "budgetButton"
  | "budgetEdit"
  | "reportsButton"
  | "settingsTrigger"
  | "transactionRow";

const CARD_WIDTH = 320;
/** Breathing room between the card and the control it points at. */
const GAP = 12;
/** Minimum distance from the card to the edge of the screen. */
const GUTTER = 12;
const ARROW = 12;
/** How long to keep looking for the anchor before giving up — it may be below the
 *  fold, still streaming in, or simply not on this screen. Giving up silently is the
 *  point: the tip stays unrecorded and gets another go next time. */
const ANCHOR_TIMEOUT_MS = 4000;
const ANCHOR_POLL_MS = 150;

interface Placement {
  /** Viewport rect of the anchor, used for the highlight ring. */
  anchor: { top: number; left: number; width: number; height: number; radius: string };
  /** Card box — one of top/bottom is set, never both. */
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  below: boolean;
  /** Arrow offset from the card's left edge, clamped so it stays on the card. */
  arrowX: number;
}

/** Grow a computed `border-radius` so the ring sits parallel to the control's own
 *  corners. Bails out to a sane fixed radius for the elliptical (`10px / 20px`) form,
 *  which nothing in this app uses and which won't survive a per-token calc(). */
function inflateRadius(radius: string, by: number) {
  if (!radius || radius.includes("/")) return "16px";
  return radius
    .split(/\s+/)
    .map((token) => `calc(${token} + ${by}px)`)
    .join(" ");
}

function measure(el: Element): Placement | null {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Zero-sized means hidden (display:none, an unmounted panel, a collapsed row);
  // fully off-screen means the user has scrolled past whatever this is about. Either
  // way there's nothing to point at, so the caller stands down.
  if (r.width === 0 && r.height === 0) return null;
  if (r.bottom < 0 || r.top > vh) return null;

  // Is the control the thing you'd actually hit if you tapped it? A hit-test at its
  // own centre catches everything a rect can't see: a full-screen portal covering the
  // dashboard, a sheet over the list, a faded-out header row. Cheaper and far more
  // general than teaching every call site which overlays exist above it.
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!hit || !el.contains(hit)) return null;

  const width = Math.min(CARD_WIDTH, vw - GUTTER * 2);
  const centre = r.left + r.width / 2;
  const left = Math.min(Math.max(centre - width / 2, GUTTER), vw - GUTTER - width);

  // Placed by which half of the screen the anchor sits in, rather than by measuring
  // the card: the card's height depends on how the copy wraps, so measuring it means
  // rendering first and moving afterwards — a visible jump. Anchoring the far edge
  // (bottom, for a card above) lets it grow in the safe direction instead.
  const below = r.top + r.height / 2 < vh / 2;

  return {
    anchor: { top: r.top, left: r.left, width: r.width, height: r.height, radius: getComputedStyle(el).borderRadius },
    left,
    top: below ? r.bottom + GAP : undefined,
    bottom: below ? undefined : vh - r.top + GAP,
    width,
    below,
    arrowX: Math.min(Math.max(centre - left, 24), width - 24),
  };
}

function samePlacement(a: Placement | null, b: Placement | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left && a.top === b.top && a.bottom === b.bottom &&
    a.width === b.width && a.arrowX === b.arrowX && a.below === b.below &&
    a.anchor.top === b.anchor.top && a.anchor.left === b.anchor.left &&
    a.anchor.width === b.anchor.width && a.anchor.height === b.anchor.height
  );
}

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
      const el = document.querySelector(`[data-tip-anchor="${anchor}"]`);
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
            className="fixed pointer-events-none border-2 border-foreground/35"
            style={{
              top: placement.anchor.top - 5,
              left: placement.anchor.left - 5,
              width: placement.anchor.width + 10,
              height: placement.anchor.height + 10,
              borderRadius: inflateRadius(placement.anchor.radius, 5),
              boxShadow: "0 0 0 6px color-mix(in srgb, var(--foreground) 8%, transparent)",
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
            <div
              aria-hidden
              className="absolute bg-[var(--dialog-content-background)] rotate-45 rounded-[3px]"
              style={{
                width: ARROW,
                height: ARROW,
                left: placement.arrowX - ARROW / 2,
                top: placement.below ? -ARROW / 2 + 2 : undefined,
                bottom: placement.below ? undefined : -ARROW / 2 + 2,
              }}
            />
            <div className="relative">
              <TipCard id={id} onDismiss={dismiss} onDismissAll={dismissAll} compact />
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
