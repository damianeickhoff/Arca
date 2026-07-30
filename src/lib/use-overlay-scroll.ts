"use client";

import { useEffect, useRef } from "react";

// Lets a body-portalled overlay scroll while a sheet is open behind it.
//
// Radix's Dialog overlay (which vaul's Drawer.Overlay renders) wraps itself in
// react-remove-scroll. That library attaches `wheel`/`touchmove` listeners to
// `document` and calls preventDefault() on every event whose target is not inside
// the drawer's own content or one of its declared "shards". Our full-screen
// portals (merchant profile, category detail) render into <body>, outside both —
// so while any sheet is open they are completely unscrollable, by wheel and by
// touch alike. There is no public way to register as a shard from out here.
//
// The interception point: react-remove-scroll listens on `document` in the BUBBLE
// phase, so a CAPTURE listener on `window` runs first and can stop the event
// before it ever gets there. Stopping propagation does not stop the browser from
// scrolling — only preventDefault() would — so the overlay scrolls natively again.

/**
 * Returns a ref to put on the overlay's root element. While `active`, wheel and
 * touch events originating inside that element are hidden from the scroll lock.
 */
export function useOverlayScroll(active: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    function allowScroll(e: Event) {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) {
        // Deliberately not preventDefault() — that would cancel the scroll we're
        // trying to allow. This only hides the event from the lock's own listener.
        e.stopPropagation();
      }
    }
    window.addEventListener("wheel", allowScroll, { capture: true });
    window.addEventListener("touchmove", allowScroll, { capture: true });
    return () => {
      window.removeEventListener("wheel", allowScroll, { capture: true });
      window.removeEventListener("touchmove", allowScroll, { capture: true });
    };
  }, [active]);

  return rootRef;
}
