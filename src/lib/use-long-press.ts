"use client";

import { useCallback, useRef } from "react";

/** Comfortably under iOS's own ~500ms text-selection/callout gesture, which competes
 *  for the same hold and cancels ours if it wins. */
const HOLD_MS = 400;
/** How far the contact may drift before the hold is read as a scroll or a drag. A finger
 *  resting on a phone screen wanders several pixels on its own, so this is far more
 *  generous than a mouse would need. */
const MOVE_TOLERANCE_PX = 16;

/** Set once any touch is seen anywhere in the app. Touch devices also emit synthetic
 *  mouse events a moment later, and without this the mouse path would start a second,
 *  overlapping hold on the same gesture. */
let sawTouch = false;

/**
 * Press-and-hold on a control, for both touch and mouse — the gesture that opens
 * multi-select on a transaction row.
 *
 * Deliberately built on *separate* touch and mouse handlers rather than unified pointer
 * events. The rows this is used on are `motion` components whose own `whileTap` gesture
 * already consumes the pointer-event stream, and iOS additionally fires `pointercancel`
 * when its selection UI kicks in mid-hold — between them, the pointer path is unreliable
 * on a phone. Touch events sit outside both.
 *
 * The hold is abandoned as soon as the contact moves appreciably, so scrolling a list
 * never trips it.
 *
 * Returns props to spread on the element plus `consumeClick()`: a completed hold is still
 * followed by a click, and the caller must swallow that one click so the hold doesn't also
 * perform the tap action.
 */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    origin.current = null;
  }, []);

  const start = useCallback(
    (x: number, y: number) => {
      // Cleared before anything else, and regardless of `enabled`: the click to swallow
      // always belongs to the same interaction that set the flag, so a fresh press means
      // any earlier hold is spent. Without this, a hold the user drags away from (no
      // click ever arrives) would eat their next genuine tap.
      fired.current = false;
      if (!enabled) return;
      origin.current = { x, y };
      timer.current = setTimeout(() => {
        fired.current = true;
        cancel();
        onLongPress();
      }, HOLD_MS);
    },
    [enabled, onLongPress, cancel],
  );

  const moved = useCallback(
    (x: number, y: number) => {
      if (!origin.current) return;
      if (Math.abs(x - origin.current.x) > MOVE_TOLERANCE_PX || Math.abs(y - origin.current.y) > MOVE_TOLERANCE_PX) {
        cancel();
      }
    },
    [cancel],
  );

  /** True exactly once after a hold completed — call it first in your onClick and bail
   *  out when it returns true. */
  const consumeClick = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return {
    longPressProps: {
      onTouchStart: (e: React.TouchEvent) => {
        sawTouch = true;
        const t = e.touches[0];
        if (t) start(t.clientX, t.clientY);
      },
      onTouchMove: (e: React.TouchEvent) => {
        const t = e.touches[0];
        if (t) moved(t.clientX, t.clientY);
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,

      onMouseDown: (e: React.MouseEvent) => {
        if (sawTouch || e.button !== 0) return;
        start(e.clientX, e.clientY);
      },
      onMouseMove: (e: React.MouseEvent) => {
        if (sawTouch) return;
        moved(e.clientX, e.clientY);
      },
      onMouseUp: cancel,
      onMouseLeave: cancel,

      // A finger held on a row otherwise raises the OS text-selection / callout menu,
      // which would both cover the row and cancel the gesture.
      onContextMenu: (e: React.MouseEvent) => {
        if (enabled) e.preventDefault();
      },
    },
    consumeClick,
  };
}
