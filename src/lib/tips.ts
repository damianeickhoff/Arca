"use client";

import { useCallback, useEffect, useState } from "react";
import { useGuide } from "@/lib/guide-context";
import type { TipId } from "@/lib/guide";

// Tips — one-time, one-sentence explainers shown the first time the user reaches a
// rarer feature (receipt scan, CSV import, the bank connection, AI, …). Pages explain
// themselves with a page tour instead (components/page-tour.tsx). Which tips exist and
// what the account has seen live in lib/guide.ts; the Tips switch in Settings › Help
// (and "Don't show again" on any tip card) turns every one of them off.

export type { TipId };

// Only one tip or tour is ever on screen. Several surfaces can be mounted at once (a
// portal over a page, a dialog over that portal) and two stacking is exactly the
// "forced through a tutorial" feel these are meant to avoid. Whoever claims the slot
// first wins; the other stays unrecorded and gets its turn on a later visit.
let slotHolder: string | null = null;

export function claimGuideSlot(key: string): boolean {
  if (slotHolder !== null && slotHolder !== key) return false;
  slotHolder = key;
  return true;
}

export function releaseGuideSlot(key: string) {
  if (slotHolder === key) slotHolder = null;
}

/** Anything modal on screen: a dialog or sheet, a popover, an open menu. A tip or tour
 *  never starts over one, except a tip that belongs to it (see useContextualTip). The
 *  tour card itself carries data-guide; a sheet still sliding away is data-state=closed. */
export const OVERLAY_SELECTOR =
  '[data-vaul-drawer][data-state="open"], [role="dialog"]:not([data-guide]):not([data-state="closed"]), [role="alertdialog"], [role="menu"]';

export function overlayOpen(): boolean {
  return document.querySelector(OVERLAY_SELECTOR) != null;
}

/** Whether a tip is still owed to this account (and tips are on). */
export function useTipPending(id: TipId): boolean {
  const { state } = useGuide();
  return state != null && state.tipsOn && !state.tipsSeen.includes(id);
}

/** How long a surface has to settle before its tip slides in — long enough that the
 *  tip reads as a response to arriving somewhere, not as part of the page load. */
export const SHOW_DELAY_MS = 700;

/**
 * Drives one tip. `active` is what "the user is actually looking at this feature"
 * means for the caller — a dialog's `open`, a portal's visibility, or just `true`
 * for a plain page. The tip is claimed and recorded only once `active` has held for
 * SHOW_DELAY_MS, so briefly-mounted surfaces don't burn their tip.
 *
 * `overDialog`: the tip belongs to the dialog, sheet or popover that is open (its
 * feature lives in there), so an open overlay doesn't hold it back.
 * `onShown`: a tip that repeats on a new occasion (the version cards) records that
 * occasion itself instead of being marked seen for good.
 */
export function useContextualTip(id: TipId, active: boolean, options: { overDialog?: boolean; onShown?: () => void } = {}) {
  const { state, update, blocked } = useGuide();
  const { overDialog = false, onShown } = options;
  const [visible, setVisible] = useState(false);
  const pending = state != null && state.tipsOn && (onShown != null || !state.tipsSeen.includes(id));
  // Recording the tip as seen makes it no longer pending; it stays up regardless.
  const eligible = visible || pending;

  useEffect(() => {
    if (!active || !eligible || blocked) return;
    const timer = setTimeout(() => {
      if (!overDialog && overlayOpen()) return;
      if (!claimGuideSlot(id)) return;
      if (onShown) onShown();
      else update({ kind: "tipSeen", id });
      setVisible(true);
    }, SHOW_DELAY_MS);

    return () => {
      clearTimeout(timer);
      releaseGuideSlot(id);
      setVisible(false);
    };
    // onShown is a fresh closure every render; the tip only cares about it at the moment it shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, active, eligible, blocked, overDialog, update]);

  const dismiss = useCallback(() => {
    releaseGuideSlot(id);
    setVisible(false);
  }, [id]);

  /** "Don't show again": the Tips switch off, for every tip. */
  const dismissAll = useCallback(() => {
    update({ kind: "switch", which: "tips", on: false });
    releaseGuideSlot(id);
    setVisible(false);
  }, [id, update]);

  return { visible, dismiss, dismissAll };
}
