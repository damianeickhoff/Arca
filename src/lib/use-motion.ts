"use client";

import { useLayoutEffect, useRef } from "react";

// Small layout animations driven by the Web Animations API — they run after React has
// committed the new layout, so nothing about the markup or the CSS has to change.
// It respects prefers-reduced-motion.

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fades and lifts an element in again whenever `key` changes — new results after a
 * filter or sort change, instead of the list swapping in one frame.
 */
export function useFadeOnChange<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  const prevKey = useRef(key);

  useLayoutEffect(() => {
    if (prevKey.current === key) return;
    prevKey.current = key;
    if (reducedMotion()) return;
    ref.current?.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 260, easing: EASE },
    );
  }, [key]);

  return ref;
}
