"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface Ctx {
  actions: ReactNode;
  setActions: (n: ReactNode) => void;
}

const BudgetHeaderActionsContext = createContext<Ctx | null>(null);

// The Budget portal's own fixed header (back button + centered "Budget" title) lives
// in DashboardHeaderBar, while the edit/delete buttons that belong on its right side
// are rendered deep inside `budgetContent` (a separate server-provided subtree that
// DashboardHeaderBar can't reach into). This context lets that nested content publish
// a node into the header's action slot instead.
export function BudgetHeaderActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <BudgetHeaderActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </BudgetHeaderActionsContext.Provider>
  );
}

export function BudgetHeaderActionsSlot() {
  const ctx = useContext(BudgetHeaderActionsContext);
  return <>{ctx?.actions ?? null}</>;
}

export function useBudgetHeaderActions(node: ReactNode) {
  const ctx = useContext(BudgetHeaderActionsContext);
  const setActions = ctx?.setActions;
  useEffect(() => {
    setActions?.(node);
    return () => setActions?.(null);
  }, [node, setActions]);
}
