"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface Ctx {
  upcomingOpen: boolean;
  upcomingEverOpened: boolean;
  openUpcoming: () => void;
  closeUpcoming: () => void;
  needsReviewOpen: boolean;
  needsReviewEverOpened: boolean;
  openNeedsReview: () => void;
  closeNeedsReview: () => void;
}

const TransactionsPortalContext = createContext<Ctx | null>(null);

// Lets the dashboard's "Upcoming Bills" and "needs review" tiles open as in-page
// portals (same slide-up shell as the Accounts/Budget/Reports portals) instead of
// navigating to their standalone /transactions/upcoming and /transactions/needs-review
// routes — those routes stay in place for their other entry point
// (src/app/transactions/mobile.tsx), this just gives the dashboard its own,
// non-navigating way in. Mirrors BudgetPortalProvider.
export function TransactionsPortalProvider({ children }: { children: ReactNode }) {
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [upcomingEverOpened, setUpcomingEverOpened] = useState(false);
  const [needsReviewOpen, setNeedsReviewOpen] = useState(false);
  const [needsReviewEverOpened, setNeedsReviewEverOpened] = useState(false);

  function openUpcoming() {
    setUpcomingEverOpened(true);
    setUpcomingOpen(true);
  }
  function closeUpcoming() {
    setUpcomingOpen(false);
  }
  function openNeedsReview() {
    setNeedsReviewEverOpened(true);
    setNeedsReviewOpen(true);
  }
  function closeNeedsReview() {
    setNeedsReviewOpen(false);
  }

  return (
    <TransactionsPortalContext.Provider
      value={{
        upcomingOpen,
        upcomingEverOpened,
        openUpcoming,
        closeUpcoming,
        needsReviewOpen,
        needsReviewEverOpened,
        openNeedsReview,
        closeNeedsReview,
      }}
    >
      {children}
    </TransactionsPortalContext.Provider>
  );
}

export function useTransactionsPortal() {
  const ctx = useContext(TransactionsPortalContext);
  if (!ctx) throw new Error("useTransactionsPortal must be used within TransactionsPortalProvider");
  return ctx;
}
