"use client";

import { IconArrowDownLeft, IconArrowRight } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { useTransactionsPortal } from "@/lib/transactions-portal-state";

// Opens the Upcoming portal (see upcoming-portal.tsx) instead of navigating to
// /transactions/upcoming, so it slides in with the same animation as the
// Accounts/Budget/Reports portals rather than a page-navigation fade.
export function UpcomingBillsTile({
  count,
  total,
  icons,
}: {
  count: number;
  total: number;
  icons: { icon: string | null; iconColor: string | null; iconBackground: string | null }[];
}) {
  const { openUpcoming } = useTransactionsPortal();
  return (
    <button
      type="button"
      onClick={openUpcoming}
      className="flex items-center gap-3 mx-3 w-[calc(100%-1.5rem)] text-left rounded-2xl bg-card p-4 active:scale-[0.99] transition-transform"
    >
      {icons.length > 0 && (
        <div className="flex shrink-0 -space-x-3">
          {icons.map((u, i) => (
            <div key={i} className="rounded-xl" style={{ zIndex: icons.length - i }}>
              <Icon iconKey={u.icon} color={u.iconColor} background={u.iconBackground} size="md" />
            </div>
          ))}
        </div>
      )}
      <span className="text-base font-normal text-foreground leading-snug flex-1">
        {count} upcoming transaction{count === 1 ? "" : "s"}
        <br />this month
      </span>
      <span className="text-sm font-semibold tabular-nums text-muted-foreground shrink-0">{formatEur(total)}</span>
    </button>
  );
}

// Opens the Needs review portal (see needs-review-portal.tsx) instead of
// navigating to /transactions/needs-review — same reasoning as above.
export function NeedsReviewTile({ count, total }: { count: number; total: number }) {
  const { openNeedsReview } = useTransactionsPortal();
  return (
    <button
      type="button"
      onClick={openNeedsReview}
      className="block w-[calc(100%-1.5rem)] mx-3 text-left active:scale-[0.98] transition-transform duration-150"
    >
      <div className="flex items-center gap-4 rounded-xl bg-card p-5">
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-foreground leading-snug">
            {count} transaction{count === 1 ? "" : "s"} needs review
          </p>
          <div className="flex items-center gap-1.5 mt-1 text-foreground/60">
            <span className="flex size-5 items-center justify-center rounded-full bg-foreground/20 shrink-0">
              <IconArrowDownLeft className="size-3.5" />
            </span>
            <span className="text-sm tabular-nums">{formatEur(total)}</span>
          </div>
        </div>
        <IconArrowRight className="size-5 shrink-0 text-foreground/40" />
      </div>
    </button>
  );
}
