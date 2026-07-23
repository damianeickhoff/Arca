"use client";

import { usePathname } from "next/navigation";
import { m, easeOutQuart } from "@/lib/motion";

// Drill-down transition for the /menu page family. The root template.tsx only
// remounts when the top-level segment changes, so hops between menu subpages
// (all under /menu) play no animation — this wrapper re-keys on the full
// pathname instead, sliding each subpage in from the right like a native
// settings stack. Motion resets transform to none when the animation settles,
// so fixed children (e.g. the categories add-FAB) re-anchor to the viewport
// after the ~300ms entrance.
export function MenuTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <m.div
      key={pathname}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: easeOutQuart }}
    >
      {children}
    </m.div>
  );
}
