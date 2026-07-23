"use client";

import { useEffect, useState } from "react";

// Current on-screen-keyboard height in px (0 when no keyboard is showing),
// measured from the VisualViewport API. Deliberately used only in places where
// over-estimating is harmless (extra padding) — never to reposition an element
// via `bottom`, since that fights whatever the platform's own keyboard-resize
// behavior is already doing and can double up instead of cancelling out.
export function useKeyboardHeight(active: boolean): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      const covered = window.innerHeight - vv!.height - vv!.offsetTop;
      setHeight(Math.max(0, Math.round(covered)));
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setHeight(0);
    };
  }, [active]);

  return height;
}
