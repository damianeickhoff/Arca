"use client";

import { useEffect, useRef } from "react";
import { animate, easeOutQuart, useReducedMotion } from "@/lib/motion";
import { formatEur } from "@/lib/format";
import { useDashboardShouldAnimate } from "@/lib/dashboard-animation";

// Same whole-part treatment as <SplitEur> (nl-NL grouping from the formatEur output) —
// keep the two in sync. No cents: whole units only.
function wholeFrom(formatted: string) {
  const [wholePart] = formatted.split(",");
  return wholePart.replace(/\./g, ",").replace(/\s/g, "");
}

/**
 * Drop-in animated variant of <SplitEur>: counts the whole-euro part up from 0
 * once on mount. Falls back to a static value under prefers-reduced-motion.
 * Keep `tabular-nums` on the parent (as the dashboard already does) so
 * privacy-mode blur still applies.
 */
export function AnimatedEur({
  value,
  duration = 0.9,
}: {
  value: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const shouldAnimate = useDashboardShouldAnimate();
  const whole = wholeFrom(formatEur(value));
  // Tracks the value we last animated to/from — mount-entrance counts up from 0,
  // but later changes (e.g. tapping through the wallet's cash-flow/balance views)
  // should count from whatever was previously on screen, not restart from 0.
  const prevValue = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || !ref.current) return;
    const isMount = prevValue.current === null;
    const from = isMount ? 0 : prevValue.current!;
    prevValue.current = value;
    // Only the mount entrance is gated by the once-per-session flag (so
    // back-navigating to the dashboard doesn't replay it) — later value changes
    // should always animate.
    if (isMount && !shouldAnimate) return;
    const controls = animate(from, value, {
      duration,
      ease: easeOutQuart,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = wholeFrom(formatEur(v));
      },
    });
    return () => controls.stop();
  }, [value, reduced, duration, shouldAnimate]);

  return <span ref={ref}>{whole}</span>;
}
