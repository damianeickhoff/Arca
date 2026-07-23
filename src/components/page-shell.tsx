import { cn } from "@/lib/utils";

// The single home of the mobile/desktop breakpoint split. Every page renders
// <PageShell mobile={…} desktop={…} /> — mobile/desktop page components must not
// branch on `lg:` themselves.
//
// The -mt-14 cancels MainContent's pt-[calc(3.5rem+var(--sat))] so pages that render
// their own sticky mobile header sit flush under the status bar (see main-content.tsx).
// `mobileClassName` is the escape hatch for pages with a non-standard mobile wrapper
// (e.g. the dashboard's full-bleed gradient hero).
export function PageShell({
  mobile,
  desktop,
  mobileClassName,
}: {
  mobile: React.ReactNode;
  desktop: React.ReactNode;
  mobileClassName?: string;
}) {
  return (
    <div>
      {/* MainContent already reserves --nav-clearance at the bottom on mobile, so the
          mobile branch fills the rest of the viewport instead of a full 100dvh — stacking
          both would make even a short page scrollable past its last real pixel. */}
      <div className={cn("lg:hidden -mt-14 min-h-[calc(100dvh-var(--nav-clearance))] flex flex-col", mobileClassName)}>{mobile}</div>
      <div className="hidden lg:block min-h-dvh">{desktop}</div>
    </div>
  );
}
