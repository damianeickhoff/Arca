"use client";

import { m, listItem, STAGGER_CAP } from "@/lib/motion";

// Mount-only staggered entrance for list rows/cards: fade + rise, delayed by
// index. Items past STAGGER_CAP appear together so long lists don't waterfall
// forever. Pure enter animation — no exit, no layout tracking.
export function StaggerItem({
  index = 0,
  className,
  children,
  ...props
}: React.ComponentProps<typeof m.div> & { index?: number }) {
  const delay = 0.05 + Math.min(index, STAGGER_CAP) * 0.035;
  return (
    <m.div
      initial={listItem.initial}
      animate={{
        ...listItem.animate,
        transition: { ...listItem.animate.transition, delay },
      }}
      className={className}
      {...props}
    >
      {children}
    </m.div>
  );
}
