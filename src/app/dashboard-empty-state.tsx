import Link from "next/link";
import { IconPlus, IconUpload } from "@tabler/icons-react";

// Same "no data available yet" copy as before, plus a way to get to the first
// transaction without leaving the dashboard.
export function DashboardEmptyState() {
  return (
<div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground text-sm">
  <p className="text-xs">No data available yet.</p>

  <div className="flex items-center gap-2">
    <Link
      href="/import"
      className="flex items-center justify-center pr-5 gap-1.5 h-9 px-4 rounded-full bg-foreground/8 text-foreground text-xs font-semibold active:scale-95 transition-transform"
    >
      <IconUpload className="size-3.5" />
      Import a CSV
    </Link>
    <p>or</p>
    <Link
      href="/transactions/add"
      className="flex items-center gap-1.5 h-9 px-4 pr-6 rounded-full bg-foreground/8 text-foreground text-xs font-semibold active:scale-95 transition-transform"
    >
      <IconPlus className="size-3.5" />
      Create transaction
    </Link>
  </div>
</div>
  );
}
