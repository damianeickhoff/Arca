"use client";

import { useCallback, useRef } from "react";

const HOLD_MS = 450;
/** How far the pointer may drift before the hold is read as a scroll or a drag. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Press-and-hold on a control, for both touch and mouse — the gesture that opens
 * multi-select on a transaction row.
 *
 * Built on pointer events rather than touch events so one implementation covers a
 * finger, a mouse and a stylus. The hold is abandoned as soon as the pointer moves
 * appreciably, so scrolling a list never trips it.
 *
 * Returns props to spread on the element plus `consumeClick()`: a hold is always
 * followed by a click the browser still dispatches, and the caller must swallow that
 * one click so the hold doesn't also perform the tap action.
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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Cleared before anything else, and regardless of `enabled`: the click to swallow
      // always belongs to the same interaction that set the flag, so a fresh press means
      // any earlier hold is spent. Without this, a hold the user drags away from (no
      // click ever arrives) would eat their next genuine tap.
      fired.current = false;
      // Primary button / primary touch only — a right-click or a second finger isn't a hold.
      if (!enabled || e.button !== 0) return;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        cancel();
        onLongPress();
      }, HOLD_MS);
    },
    [enabled, onLongPress, cancel],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!origin.current) return;
    const dx = Math.abs(e.clientX - origin.current.x);
    const dy = Math.abs(e.clientY - origin.current.y);
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) cancel();
  }, [cancel]);

  /** True exactly once after a hold completed — call it first in your onClick and bail
   *  out when it returns true. */
  const consumeClick = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return {
    longPressProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // A finger held on a row otherwise raises the OS text-selection / callout menu.
      onContextMenu: (e: React.MouseEvent) => {
        if (enabled) e.preventDefault();
      },
    },
    consumeClick,
  };
}
