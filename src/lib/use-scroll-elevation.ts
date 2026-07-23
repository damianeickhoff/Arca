"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Tracks whether the nearest scrolling ancestor of the element the returned
// ref is attached to has been scrolled past `threshold`. Walks up from the
// element itself to find the real scroll container (handles headers nested
// inside a local `overflow-y-auto` dialog/drawer body), falling back to the
// window for plain full-page routes where the element's ancestors don't
// scroll on their own.
export function useScrollElevation(threshold = 8) {
  const ref = useRef<HTMLElement | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let node: HTMLElement | null = el.parentElement;
    let scrollTarget: HTMLElement | Window = window;
    while (node) {
      const style = getComputedStyle(node);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        scrollTarget = node;
        break;
      }
      node = node.parentElement;
    }

    const getScrollTop = () =>
      scrollTarget === window ? window.scrollY : (scrollTarget as HTMLElement).scrollTop;

    const handleScroll = () => setScrolled(getScrollTop() > threshold);
    handleScroll();
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollTarget.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return [ref, scrolled] as const;
}

// Variant for when the header isn't nested inside its scroll container (e.g. a
// dialog's header row rendered as a sibling of the scrollable body) — pass the
// scroll container's own ref directly instead of auto-detecting one.
export function useContainerScrolled(containerRef: RefObject<HTMLElement | null>, threshold = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => setScrolled(el.scrollTop > threshold);
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [containerRef, threshold]);

  return scrolled;
}
