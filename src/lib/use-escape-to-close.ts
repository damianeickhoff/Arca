"use client";

import { useEffect, useRef } from "react";

// Escape-to-close for the hand-rolled full-screen overlays (the createPortal +
// `fixed inset-0` portals: Reports, Budget, Upcoming, Needs review, Category
// detail, Merchant detail, Debt simulation, global search). The vaul-based
// <Dialog> sheets get this for free from Radix underneath — these don't, because
// they're plain divs.
//
// A module-level stack rather than one listener per overlay: several of these can
// be open at once (category detail opens from inside the Budget portal, for
// example), and Escape should peel off the topmost one only, not collapse the
// whole pile. Registration order is activation order, which matches visual
// stacking here since each nested overlay opens from the one below it.

interface Entry {
  close: () => void;
  /**
   * Set for overlays that render ABOVE an open vaul sheet (body-portalled popups
   * opened from inside a Dialog, e.g. the Budget portal's strategy picker). Those
   * have to take Escape away from Radix; everything else defers to it.
   */
  aboveDialog: boolean;
}

const stack: Entry[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;

  if (!top.aboveDialog) {
    // A vaul sheet opened on top of an overlay owns the Escape key — Radix's own
    // dismissable layer closes it, and we must not also pop the overlay behind it
    // in the same keystroke. Radix doesn't mark the event, so checking for an open
    // drawer in the DOM is the only reliable signal.
    if (document.querySelector('[data-vaul-drawer][data-state="open"]')) return;
  }

  e.preventDefault();
  // Radix listens in the capture phase on `document`; this listener is capture
  // phase on `window`, one step earlier, so stopping propagation here is what
  // keeps an aboveDialog overlay from also dismissing the sheet underneath it.
  e.stopPropagation();
  top.close();
}

/**
 * Closes the overlay on Escape while `active` is true. Only the most recently
 * activated overlay responds, so nested overlays close one level per press.
 */
export function useEscapeToClose(
  active: boolean,
  onClose: () => void,
  options: { aboveDialog?: boolean } = {},
) {
  const aboveDialog = options.aboveDialog ?? false;
  // The stack entry has to stay identity-stable for the lifetime of the open
  // overlay (it's what we splice out again), but must always call the current
  // onClose — callers pass inline arrow functions.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!active) return;
    const entry: Entry = { close: () => closeRef.current(), aboveDialog };
    stack.push(entry);
    if (!listening) {
      window.addEventListener("keydown", onKeyDown, { capture: true });
      listening = true;
    }
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0 && listening) {
        window.removeEventListener("keydown", onKeyDown, { capture: true });
        listening = false;
      }
    };
  }, [active, aboveDialog]);
}
