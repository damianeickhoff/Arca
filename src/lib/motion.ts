"use client";

// Single source of truth for animation physics. Always import motion primitives
// from here (`m`, not `motion`) — the app runs under <LazyMotion strict> (see
// motion-provider.tsx), so importing the full `motion.*` components anywhere
// would defeat the bundle-size guardrail and throw at runtime.
export {
  LazyMotion,
  m,
  AnimatePresence,
  MotionConfig,
  LayoutGroup,
  useReducedMotion,
  domAnimation,
  // domMax adds layout + drag projection on top of domAnimation. Load it only
  // where a subtree genuinely needs layout animations (via a nested <LazyMotion
  // features={domMax}>) — the app-wide provider deliberately stays on domAnimation.
  domMax,
  animate,
} from "motion/react";

// Springs — one vocabulary, used everywhere
export const spring = {
  /** Tap feedback — quick in, quick out */
  press: { type: "spring", stiffness: 500, damping: 30, mass: 0.8 },
  /** Sliding indicators, toggles, tab pills */
  snappy: { type: "spring", stiffness: 350, damping: 28 },
  /** Cards, sheets, entrances */
  gentle: { type: "spring", stiffness: 170, damping: 24 },
} as const;

// The app's house curve — same as .nav-pill-indicator / search-content-in
// in globals.css (--ease-out-quart).
export const easeOutQuart = [0.16, 1, 0.3, 1] as const;

// Stagger presets — pair StaggerContainer/StaggerItem (ui/stagger.tsx) or use raw.
export const listContainer = {
  animate: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } },
} as const;

export const listItem = {
  initial: { opacity: 0, y: 14 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.34, ease: easeOutQuart },
  },
} as const;

// Cap the entrance waterfall on long lists — items past this index appear together.
export const STAGGER_CAP = 12;
