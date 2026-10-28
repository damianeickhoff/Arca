"use client";

import { createContext, useContext, useState } from "react";

interface ActivitySelection {
  /** Non-null *is* select mode; an empty set means the mode is on with nothing picked. */
  selectedIds: Set<number> | null;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number> | null>>;
}

const ActivitySelectionContext = createContext<ActivitySelection | null>(null);

/**
 * Activity's select mode, shared by the list (the rows, which start it with a press and
 * hold or a Shift- / Ctrl / Cmd-click, and the bulk bar) and the page around it.
 */
export function ActivitySelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null);
  return <ActivitySelectionContext.Provider value={{ selectedIds, setSelectedIds }}>{children}</ActivitySelectionContext.Provider>;
}

/** The select mode; outside the provider it keeps its own state. */
export function useActivitySelection() {
  const ctx = useContext(ActivitySelectionContext);
  const [local, setLocal] = useState<Set<number> | null>(null);
  const { selectedIds, setSelectedIds } = ctx ?? { selectedIds: local, setSelectedIds: setLocal };
  return {
    selectedIds,
    setSelectedIds,
    selectMode: selectedIds !== null,
    /** Turns select mode on, optionally with rows already picked. */
    enter: (ids: number[] = []) => setSelectedIds(new Set(ids)),
    exit: () => setSelectedIds(null),
  };
}

