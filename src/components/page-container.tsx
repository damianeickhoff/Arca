import { cn } from "@/lib/utils";

// The one column width every surface in the app shares — pages, the bottom nav pill,
// dialog sheets, and the full-screen portals (Budget, Analytics, currency converter,
// category detail, merchant profile). Change it here and everything moves together.
//
// Below 768px this is a no-op, so phones are unaffected; above it, content stops
// widening and centres instead of stretching across the monitor.
// 4xl (896px) rather than 3xl: the dashboard's "Spending by category" row lays its
// five cards out side by side at desktop widths, which a 3xl column couldn't fit at a
// comfortable card size. Every page and sheet shares this column, so it widens as one
// — the app is still the mobile layout centred, just a little roomier.
export const CONTENT_COLUMN = "mx-auto w-full max-w-4xl";

// The single content column every page renders into. There is one layout in this app
// — the mobile one — and on a wide screen it is that same layout centred rather than a
// second, stretched-out design.
//
// Pages with a full-bleed background (the dashboard's gradient hero) put the
// background on an outer wrapper and this inside it, so the colour still runs edge
// to edge while the content stays in the column.
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(CONTENT_COLUMN, "px-4", className)}>{children}</div>;
}
