"use client";

import { useCallback, useEffect, useState } from "react";

// Contextual tips — one-time, one-sentence explainers shown the first time the user
// reaches a feature (receipt scan, CSV import, the budget portal, …). They pick up
// where the register wizard leaves off: instead of a longer tour up front, each
// feature explains itself once, in place, and never again.
//
// Deliberately client-only (localStorage, so per-device) for the same reason the
// dashboard's no-budget card is — this is a UI nicety, not account data worth a
// schema change and a server round-trip on every surface that shows a tip.

const STORAGE_KEY = "arca:tips";

// Two shapes share this list, one storage record and one on-screen slot:
//   • feature tips — a card that drops in from the top the first time a feature is
//     opened, explaining what it does (<ContextualTip>).
//   • pointer tips — a card pinned next to a specific control, explaining where
//     something lives or that a row is tappable (<AnchoredTip>).
export type TipId =
  // feature tips
  | "receiptScan"
  | "csvImport"
  | "recurring"
  | "recurringWholeWord"
  | "merchant"
  | "budget"
  | "budgetStrategy"
  | "reports"
  | "forecast"
  | "health"
  | "keyboardShortcuts"
  | "importBalance"
  | "dataHealth"
  // pointer tips
  | "importDatePreview"
  | "bulkSelect"
  | "budgetLocation"
  | "reportsLocation"
  | "healthCard"
  | "settingsLocation"
  | "strategyLocation"
  | "transactionDetail";

interface TipState {
  /** Tips already shown. A tip is recorded the moment it appears rather than when
   *  it's acknowledged, so navigating away without tapping "Got it" still counts —
   *  the promise is "never more than once", not "until you read it". */
  seen: TipId[];
  /** Set by "Don't show again" — suppresses every remaining tip, not just that one. */
  disabled: boolean;
}

const EMPTY: TipState = { seen: [], disabled: false };

/** Tips for features added after a user could already have pressed "Don't show
 *  again" — a blanket opt-out taken months ago shouldn't hide something that
 *  didn't exist yet. They still respect `seen`, so they appear exactly once. */
const IGNORES_DISABLED: readonly TipId[] = ["keyboardShortcuts", "importBalance", "importDatePreview", "dataHealth", "bulkSelect", "recurringWholeWord"];

function isSuppressed(state: TipState, id: TipId): boolean {
  if (state.seen.includes(id)) return true;
  return state.disabled && !IGNORES_DISABLED.includes(id);
}

function readState(): TipState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<TipState>;
    return {
      seen: Array.isArray(parsed.seen) ? (parsed.seen as TipId[]) : [],
      disabled: parsed.disabled === true,
    };
  } catch {
    return EMPTY;
  }
}

function writeState(state: TipState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private browsing etc.) — the tip simply isn't
    // remembered, which is the harmless failure direction.
  }
}

/** Whether a tip is still owed to this user. Lets a caller skip work it would only
 *  need in order to show one — a pointer tip polling the DOM for its anchor, say. */
export function isTipPending(id: TipId): boolean {
  return !isSuppressed(readState(), id);
}

/** Wipes the record, so every tip is due again. Not wired to any UI yet — kept as
 *  the one supported way to undo "Don't show again" from a console or a future
 *  settings row, instead of callers hand-rolling the storage key. */
export function resetTips() {
  writeState(EMPTY);
}

// Only one tip is ever on screen. Several surfaces can be mounted at once (a portal
// over a page, a dialog over that portal) and two tips stacking is exactly the
// "forced through a tutorial" feel these are meant to avoid. Whoever claims the slot
// first wins; the other stays unrecorded and gets its turn on a later visit.
let slotHolder: TipId | null = null;

/** How long a surface has to settle before its tip slides in — long enough that the
 *  tip reads as a response to arriving somewhere, not as part of the page load. */
const SHOW_DELAY_MS = 700;

/**
 * Drives one tip. `active` is what "the user is actually looking at this feature"
 * means for the caller — a dialog's `open`, a portal's visibility, or just `true`
 * for a plain page. The tip is claimed and recorded only once `active` has held for
 * SHOW_DELAY_MS, so briefly-mounted surfaces don't burn their tip.
 */
export function useContextualTip(id: TipId, active: boolean) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (isSuppressed(readState(), id)) return;

    const timer = setTimeout(() => {
      if (slotHolder !== null) return;
      slotHolder = id;
      const current = readState();
      writeState({ ...current, seen: [...current.seen, id] });
      setVisible(true);
    }, SHOW_DELAY_MS);

    return () => {
      clearTimeout(timer);
      if (slotHolder === id) slotHolder = null;
      setVisible(false);
    };
  }, [id, active]);

  const dismiss = useCallback(() => {
    if (slotHolder === id) slotHolder = null;
    setVisible(false);
  }, [id]);

  const dismissAll = useCallback(() => {
    writeState({ ...readState(), disabled: true });
    if (slotHolder === id) slotHolder = null;
    setVisible(false);
  }, [id]);

  return { visible, dismiss, dismissAll };
}
