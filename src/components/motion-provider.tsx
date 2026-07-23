"use client";

import { LazyMotion, domAnimation, MotionConfig } from "motion/react";

// App-wide motion setup: LazyMotion keeps the bundle to the ~15kB domAnimation
// feature set (`strict` throws if anyone imports the full `motion.*` components
// instead of `m.*`), and MotionConfig honors the user's prefers-reduced-motion
// setting for every animation in the tree.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
