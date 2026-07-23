"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type PanelKey =
  | "accounts" | "categories" | "recurring" | "brandIcons"
  | "financialMonth" | "monthOverrides"
  | "import" | "appearance" | "privacy" | "appLock" | "language" | "currency"
  | "help" | "users";

interface Ctx {
  requestedPanel: PanelKey | null;
  requestPanel: (key: PanelKey) => void;
  clearRequest: () => void;
}

const SettingsPortalContext = createContext<Ctx | null>(null);

// Lets server-rendered siblings of SettingsDialog (e.g. the dashboard's Accounts
// card) request that the Settings dialog open directly to a given panel, without
// either owning the other's state. Wraps the whole dashboard page; SettingsDialog
// watches `requestedPanel` and opens itself to that panel when it changes.
export function SettingsPortalProvider({ children }: { children: ReactNode }) {
  const [requestedPanel, setRequestedPanel] = useState<PanelKey | null>(null);

  function requestPanel(key: PanelKey) {
    setRequestedPanel(key);
  }
  function clearRequest() {
    setRequestedPanel(null);
  }

  return (
    <SettingsPortalContext.Provider value={{ requestedPanel, requestPanel, clearRequest }}>
      {children}
    </SettingsPortalContext.Provider>
  );
}

export function useSettingsPortal() {
  const ctx = useContext(SettingsPortalContext);
  if (!ctx) throw new Error("useSettingsPortal must be used within SettingsPortalProvider");
  return ctx;
}
