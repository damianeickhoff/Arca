"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface Ctx {
  open: boolean;
  everOpened: boolean;
  /** True for exactly one render after openBudgetCreate() — BudgetPortal consumes
   *  it to jump straight into the create/edit flow instead of the portal's own
   *  empty-state landing screen, then clears it via clearAutoCreate(). */
  autoCreate: boolean;
  openBudget: () => void;
  openBudgetCreate: () => void;
  closeBudget: () => void;
  clearAutoCreate: () => void;
}

const BudgetPortalContext = createContext<Ctx | null>(null);

// Lets the dashboard's "left in budget" alert card (a server-rendered sibling of
// DashboardHeaderBar) open the same Budget portal as the header's wallet icon,
// without either owning the other. Wraps the whole dashboard page; DashboardHeaderBar
// reads its open state from here instead of keeping its own.
export function BudgetPortalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);

  function openBudget() {
    setEverOpened(true);
    setOpen(true);
  }
  // Used by the dashboard's "no budget" card — opens the portal and skips its
  // empty-state landing screen straight into the create-budget flow.
  function openBudgetCreate() {
    setEverOpened(true);
    setOpen(true);
    setAutoCreate(true);
  }
  function closeBudget() {
    setOpen(false);
  }
  function clearAutoCreate() {
    setAutoCreate(false);
  }

  return (
    <BudgetPortalContext.Provider value={{ open, everOpened, autoCreate, openBudget, openBudgetCreate, closeBudget, clearAutoCreate }}>
      {children}
    </BudgetPortalContext.Provider>
  );
}

export function useBudgetPortal() {
  const ctx = useContext(BudgetPortalContext);
  if (!ctx) throw new Error("useBudgetPortal must be used within BudgetPortalProvider");
  return ctx;
}
