"use client";

import { useLayoutEffect, useRef } from "react";

// Small layout animations driven by the Web Animations API — they run after React has
// committed the new layout, so nothing about the markup or the CSS has to change.
// Both respect prefers-reduced-motion.

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animates an element's width whenever a render changes it (a filter chip growing an
 * avatar and an x, a label swapping). Flex siblings that grow into the free space — the
 * search field beside the chips — follow along frame by frame, so they ease too.
 * The element should clip its content (overflow-hidden) while it animates.
 */
export function useAnimatedWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const last = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.getBoundingClientRect().width;
    const prev = last.current;
    last.current = width;
    if (prev == null || Math.abs(prev - width) < 1 || reducedMotion()) return;
    el.animate([{ width: `${prev}px` }, { width: `${width}px` }], { duration: 220, easing: EASE });
  });

  return ref;
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
