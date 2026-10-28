"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { updateGuideAction } from "@/app/actions/guide";
import { applyGuideChange, type GuideChange, type GuideState, type TourId } from "@/lib/guide";
import { useFinishTransition } from "@/lib/finish-transition-state";

interface Ctx {
  /** Null while nothing may show: signed out, or still in the onboarding wizard. */
  state: GuideState | null;
  update: (change: GuideChange) => void;
  /** A tour Replay in Settings › Help asked for; it starts on its page even when seen
   *  or with tours switched off. */
  replay: TourId | null;
  requestReplay: (id: TourId) => void;
  clearReplay: () => void;
  /** True while the onboarding wizard's welcome transition still covers Home. */
  blocked: boolean;
}

const GuideContext = createContext<Ctx | null>(null);

// What a browser remembered before tips lived on the account. Read once, merged into the
// account and removed, so every browser that still has them hands them over on its next
// visit.
const LEGACY_TIPS = "arca:tips";
const LEGACY_WHATS_NEW = "arca:whatsNewVersion";
const LEGACY_UPDATE = "arca:updateAvailableSeen";

function takeLegacy(): GuideChange | null {
  try {
    const tips = localStorage.getItem(LEGACY_TIPS);
    const whatsNew = localStorage.getItem(LEGACY_WHATS_NEW);
    const update = localStorage.getItem(LEGACY_UPDATE);
    if (tips == null && whatsNew == null && update == null) return null;
    let parsed: { seen?: unknown; disabled?: unknown } = {};
    try {
      parsed = tips ? JSON.parse(tips) : {};
    } catch {
      // unreadable: nothing to carry over
    }
    localStorage.removeItem(LEGACY_TIPS);
    localStorage.removeItem(LEGACY_WHATS_NEW);
    localStorage.removeItem(LEGACY_UPDATE);
    return {
      kind: "legacy",
      tipsSeen: Array.isArray(parsed.seen) ? parsed.seen.filter((id): id is string => typeof id === "string") : [],
      tipsOff: parsed.disabled === true,
      whatsNewVersion: whatsNew || null,
      updateAvailableVersion: update || null,
    };
  } catch {
    return null;
  }
}

/**
 * Tips and page tours for the signed-in account (lib/guide.ts). Loaded once by the root
 * layout; every change is applied here at once and sent to the server, which stores the
 * same change (app/actions/guide.ts).
 */
export function GuideProvider({ initial, children }: { initial: GuideState | null; children: ReactNode }) {
  const [state, setState] = useState(initial);
  const [replay, setReplay] = useState<TourId | null>(null);
  const finish = useFinishTransition();

  // A layout refresh (router.refresh, a revalidated action) brings the stored copy, which
  // already holds every change this page sent.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setState(initial);
  }

  const signedIn = initial != null;

  const update = useCallback((change: GuideChange) => {
    setState((prev) => (prev ? applyGuideChange(prev, change) : prev));
    // A lost write only means a tip may show once more; never worth an error.
    void updateGuideAction(change).catch(() => {});
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const legacy = takeLegacy();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (legacy) update(legacy);
  }, [signedIn, update]);

  const value = useMemo<Ctx>(
    () => ({
      state,
      update,
      replay,
      requestReplay: setReplay,
      clearReplay: () => setReplay(null),
      blocked: finish.active,
    }),
    [state, update, replay, finish.active],
  );

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuide() {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuide must be used within GuideProvider");
  return ctx;
}
