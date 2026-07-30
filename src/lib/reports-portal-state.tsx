"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type ReportTab = "rapporten" | "trends" | "vermogen" | "prognose" | "health";

interface Ctx {
  open: boolean;
  everOpened: boolean;
  activeTab: ReportTab;
  /** Opens the Insights portal, optionally jumping straight to a given tab. */
  openReports: (tab?: ReportTab) => void;
  closeReports: () => void;
  setActiveTab: (tab: ReportTab) => void;
}

const ReportsPortalContext = createContext<Ctx | null>(null);

// Lets server-rendered siblings of DashboardHeaderBar (the Cash Flow Forecast card)
// open the same Insights portal as the header's chart icon — and land on a specific
// tab — without either owning the other. Same pattern as BudgetPortalProvider;
// DashboardHeaderBar reads its open/tab state from here instead of keeping its own.
export function ReportsPortalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportTab>("rapporten");

  function openReports(tab?: ReportTab) {
    if (tab) setActiveTab(tab);
    setEverOpened(true);
    setOpen(true);
  }
  function closeReports() {
    setOpen(false);
  }

  return (
    <ReportsPortalContext.Provider value={{ open, everOpened, activeTab, openReports, closeReports, setActiveTab }}>
      {children}
    </ReportsPortalContext.Provider>
  );
}

export function useReportsPortal() {
  const ctx = useContext(ReportsPortalContext);
  if (!ctx) throw new Error("useReportsPortal must be used within ReportsPortalProvider");
  return ctx;
}
