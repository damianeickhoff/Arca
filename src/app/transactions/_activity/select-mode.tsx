"use client";

import { createContext, useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCheck, IconListCheck } from "@tabler/icons-react";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { cn } from "@/lib/utils";

interface ActivitySelection {
  /** Non-null *is* select mode; an empty set means the mode is on with nothing picked. */
  selectedIds: Set<number> | null;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number> | null>>;
}

const ActivitySelectionContext = createContext<ActivitySelection | null>(null);

/**
 * Activity's select mode, shared by the header (the phone Select button), the filter
 * row (the desktop Select button) and the list (the rows and the bulk bar).
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

/**
 * "Select" — turns on select mode; while it is on, the same button reads "Done" (black)
 * and turns it off. Desktop: a labelled surface button beside the filters. Phones: a
 * round button in the page header.
 */
export function ActivitySelectButton({ layout, disabled }: { layout: "desktop" | "phone"; disabled?: boolean }) {
  const t = useTranslations("activity.bulk");
  const { selectMode, enter, exit } = useActivitySelection();
  const label = selectMode ? t("done") : t("select");
  const variant = selectMode ? "primary" : "surface";
  const Glyph = selectMode ? IconCheck : IconListCheck;

  return (
    <button
      type="button"
      onClick={() => (selectMode ? exit() : enter())}
      disabled={disabled && !selectMode}
      aria-pressed={selectMode}
      aria-label={layout === "phone" ? label : undefined}
      data-tip-anchor="activitySelect"
      className={cn(
        layout === "desktop"
          ? cn(clearButtonVariants({ variant, size: "md" }), "hidden lg:inline-flex")
          : cn(clearButtonVariants({ variant, size: "icon" }), "size-12 lg:hidden"),
      )}
    >
      <Glyph aria-hidden size={layout === "phone" ? 20 : undefined} stroke={layout === "phone" ? 1.9 : 2} />
      {layout === "desktop" && label}
    </button>
  );
}
