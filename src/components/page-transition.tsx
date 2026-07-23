"use client";

import { usePathname } from "next/navigation";

// App-wide page-enter fade. Lives in the root layout (which persists across
// navigations) and re-keys on the pathname, so the CSS fade replays on EVERY
// route change — top-level tab switches AND nested drill-downs (e.g.
// /transactions → /transactions/upcoming) alike. The old root template.tsx only
// re-ran on top-level segment changes, which is why nested pages felt static.
//
// Deliberately a CSS animation, not a motion value: motion drives opacity via
// requestAnimationFrame, which browsers pause in backgrounded tabs — leaving the
// whole page stuck at the initial opacity:0 (blank) until the tab regains focus.
// A CSS keyframe has no such dependency and the element's resting opacity is 1,
// so it can never get stuck invisible.
//
// Opacity-only by design: several pages render position:fixed / position:sticky
// children (the transactions FAB and page headers) whose behaviour a transform
// on this wrapper would break. Keyed on pathname (not the full URL) so
// search-param-only changes — the dashboard's month/bank filters — don't re-fade.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-fade-in">
      {children}
    </div>
  );
}
