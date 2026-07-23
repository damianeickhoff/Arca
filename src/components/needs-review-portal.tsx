"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronLeft, IconArrowDownLeft } from "@tabler/icons-react";
import { useTransactionsPortal } from "@/lib/transactions-portal-state";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { formatEur } from "@/lib/format";
import { NeedsReviewList } from "@/app/transactions/needs-review/needs-review-list";
import type { Category, Goal } from "@/db/schema";
import type { TransactionDetail } from "@/app/transactions/transaction-types";

// Dashboard-only entry point for the needs-review queue — same slide-up shell as
// the Accounts/Budget/Reports/Upcoming portals, so it opens with the same
// animation instead of the default page-navigation fade. The standalone
// /transactions/needs-review route is untouched.
export function NeedsReviewPortal({
  rows,
  categories,
  savingsGoals,
}: {
  rows: TransactionDetail[];
  categories: Category[];
  savingsGoals: Goal[];
}) {
  const { needsReviewOpen: open, needsReviewEverOpened: everOpened, closeNeedsReview: close } = useTransactionsPortal();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal must not render until after mount, to avoid SSR/hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return acquireNavHidden();
  }, [open]);

  const springOut = "cubic-bezier(0.32, 0.72, 0, 1)";
  const springIn = "cubic-bezier(0.16, 1, 0.3, 1)";

  if (!mounted || !everOpened) return null;

  const total = rows.reduce((sum, r) => sum + (r.correctedAmount ?? r.amount), 0);

  return createPortal(
    <>
      <div
        className="fixed inset-x-0 bottom-0 bg-background"
        style={{
          top: 0,
          zIndex: 45,
          opacity: open ? 1 : 0,
          pointerEvents: "none",
          transition: open
            ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)"
            : "opacity 320ms ease",
        }}
      />
      <div
        className="fixed inset-x-0 bottom-0 flex flex-col"
        style={{
          top: 0,
          zIndex: 45,
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(24px)",
          transition: open
            ? `opacity 400ms ease 180ms, transform 500ms ${springIn} 160ms`
            : `opacity 220ms ease, transform 260ms ${springOut}`,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div className="shrink-0 grid grid-cols-[auto_1fr_auto] items-center px-4 pb-3" style={{ paddingTop: "calc(0.75rem + var(--sat))" }}>
          <button
            type="button"
            onClick={close}
            aria-label="Back"
            className="size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-xs flex items-center justify-center active:scale-[0.97] transition-transform"
          >
            <IconChevronLeft className="size-5" />
          </button>
          <h1 className="text-lg text-foreground text-center truncate">Needs review</h1>
          <div className="size-11" />
        </div>

        <div
          className="flex-1 relative overflow-y-auto overflow-x-hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="pb-24 space-y-4">
            <div className="px-4">
              <p className="text-sm text-muted-foreground">
                {rows.length} transaction{rows.length === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-background shrink-0">
                  <IconArrowDownLeft className="size-4" />
                </span>
                <span className="text-2xl font-semibold tabular-nums">{formatEur(total)}</span>
              </div>
            </div>

            <div className="px-4">
              {rows.length === 0 ? (
                <div className="rounded-2xl bg-card py-16 text-center text-muted-foreground text-sm">
                  Nothing to review — every transaction has a category.
                </div>
              ) : (
                <NeedsReviewList rows={rows} categories={categories} savingsGoals={savingsGoals} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
