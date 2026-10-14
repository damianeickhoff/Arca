"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { m, AnimatePresence, spring } from "@/lib/motion";
import { TipCard } from "@/components/tip-card";
import { isTipPending, markTipSeen, type TipId } from "@/lib/tips";
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

/**
 * A stepped tour of the controls on one screen — the add-debt and add-saving forms are
 * a wall of unlabelled icon buttons, and explaining them one per visit (which is what a
 * screenful of independent <AnchoredTip>s would do, since only one tip may hold the slot
 * at a time) would take a dozen visits to get through.
 *
 * So this owns its own visibility rather than useContextualTip's: it runs once
 * automatically, then stays reachable forever from a help button via `replayToken`. Copy
 * lives at `tips.<id>.steps.<anchor>.{title,body}`, one entry per step.
 *
 * Steps whose control isn't on screen are skipped rather than stalling the tour — a
 * button can be conditionally rendered (the linked-bills row is disabled in one mode),
 * and a tour that dead-ends on it would be worse than one that's a card shorter.
 */
export function TipWalkthrough({
  id,
  steps,
  active = true,
  replayToken = 0,
}: {
  id: TipId;
  /** In the order the user should meet them. */
  steps: readonly TipAnchor[];
  active?: boolean;
  /** Bump to replay the tour from the start, regardless of whether it's been seen. */
  replayToken?: number;
}) {
  const t = useTranslations("tips");
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [anchorEl, setAnchorEl] = useState<Element | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the body portal can't render until after mount, or SSR and hydration disagree
  useEffect(() => { setMounted(true); }, []);

  // First run: only when the tour is still owed. Recorded as seen the moment it starts,
  // matching the rest of the tip system ("never more than once", not "until you read it").
  useEffect(() => {
    if (!active || !isTipPending(id)) return;
    const timer = setTimeout(() => {
      markTipSeen(id);
      setIndex(0);
      setRunning(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [id, active]);

  // Replay from the help button — deliberately ignores `seen`. A bumped token from a
  // parent click is only observable here; the alternative is threading an imperative
  // handle through every caller.
  useEffect(() => {
    if (replayToken === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starting the tour *is* the effect
    setIndex(0);
    setRunning(true);
  }, [replayToken]);

  const stop = useCallback(() => {
    setRunning(false);
    setAnchorEl(null);
    setPlacement(null);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= steps.length) { stop(); return i; }
      return i + 1;
    });
  }, [steps.length, stop]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Resolve the current step's control, skipping past any that aren't on screen.
  useEffect(() => {
    if (!running) return;
    const anchor = steps[index];
    // Nothing to resolve; the render guard below keeps the card hidden either way.
    if (!anchor) return;
    const deadline = Date.now() + ANCHOR_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function look() {
      const el = findAnchor(anchor);
      if (el && measure(el)) { setAnchorEl(el); return; }
      if (Date.now() < deadline) { timer = setTimeout(look, ANCHOR_POLL_MS); return; }
      // Never resolved — move along rather than leaving the tour stuck on a card
      // pointing at nothing.
      if (index + 1 < steps.length) setIndex(index + 1);
      else stop();
    }
    look();
    return () => { clearTimeout(timer); setAnchorEl(null); };
  }, [running, index, steps, stop]);

  // Track the control while its card is up: scrolling, rotation and a re-rendering
  // form all move it.
  const reposition = useCallback(() => {
    if (!anchorEl) return;
    const nextPlacement = anchorEl.isConnected ? measure(anchorEl) : null;
    setPlacement((prev) => (samePlacement(prev, nextPlacement) ? prev : nextPlacement));
  }, [anchorEl]);

  useEffect(() => {
    if (!anchorEl) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the anchor's layout out of the DOM is exactly what this effect synchronises
    reposition();
    let frame = 0;
    function onViewportChange() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reposition);
    }
    window.addEventListener("scroll", onViewportChange, { passive: true, capture: true });
    window.addEventListener("resize", onViewportChange);
    const recheck = setInterval(reposition, 500);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(recheck);
      window.removeEventListener("scroll", onViewportChange, { capture: true });
      window.removeEventListener("resize", onViewportChange);
    };
  }, [anchorEl, reposition]);

  if (!mounted) return null;

  const anchor = steps[index];
  const isLast = index + 1 >= steps.length;
  const show = running && placement != null && anchor != null;

  return createPortal(
    <AnimatePresence>
      {show && (
        <m.div
          key={`${id}-${anchor}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16 } }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[90] pointer-events-none"
          role="status"
          // Same reasoning as <ContextualTip>: the card sits over an open sheet, and its
          // buttons must not read as an outside-interaction that closes it.
          data-dialog-keep-open=""
        >
          {/* Highlight ring — pointer-transparent, so the control stays usable. */}
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
              <TipCard
                id={id}
                compact
                title={t(`${id}.steps.${anchor}.title`)}
                body={t(`${id}.steps.${anchor}.body`)}
                onDismiss={stop}
                onDismissAll={stop}
                footer={
                  <div className="mt-3.5 flex items-center justify-between gap-1">
                    <span className="text-xs text-foreground/40 tabular-nums pl-1">
                      {index + 1}/{steps.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={stop}
                        className="h-9 px-3 rounded-full text-sm text-foreground/45 active:scale-[0.97] transition-transform"
                      >
                        {t("skipTour")}
                      </button>
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={back}
                          className="h-9 px-3 rounded-full text-sm text-foreground/70 active:scale-[0.97] transition-transform"
                        >
                          {t("back")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={isLast ? stop : next}
                        className="h-9 px-5 rounded-full bg-foreground text-background text-sm font-semibold active:scale-[0.97] transition-transform"
                      >
                        {isLast ? t("gotIt") : t("next")}
                      </button>
                    </div>
                  </div>
                }
              />
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
