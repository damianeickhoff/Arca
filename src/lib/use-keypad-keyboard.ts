"use client";

import { useEffect, useRef } from "react";

// Hardware keyboard / numpad entry for the on-screen amount keypads, so they
// aren't mouse-only on desktop. Shared by NumericKeypad and AmountKeypad — both
// speak the same key names ("0".."9", ",", "back", "÷", "×", "−", "+").

/**
 * Maps a physical key (top-row digits or numpad) to a keypad key name. The
 * numpad's decimal key reports "." or "," depending on the keyboard layout, and
 * both mean the same thing here.
 */
function keypadKeyFor(e: KeyboardEvent, calcEnabled: boolean): string | null {
  if (e.key >= "0" && e.key <= "9") return e.key;
  if (e.key === "," || e.key === ".") return ",";
  if (e.key === "Backspace" || e.key === "Delete") return "back";
  if (!calcEnabled) return null;
  if (e.key === "/" || e.key === "÷") return "÷";
  if (e.key === "*" || e.key === "×") return "×";
  if (e.key === "-" || e.key === "−") return "−";
  if (e.key === "+") return "+";
  return null;
}

/**
 * Binds number-key entry to a keypad. Attach the returned ref to the keypad's
 * root element — it's used to work out whether this keypad is the one actually
 * on screen, which is what keeps several mounted keypads from all reacting to
 * the same keystroke.
 *
 * `onEnter` (optional) fires on Enter, for surfaces where the keypad sits next
 * to a single primary action (Save / Done).
 */
export function useKeypadKeyboard({
  calcEnabled,
  onKey,
  onEnter,
}: {
  calcEnabled?: boolean;
  onKey: (key: string) => void;
  onEnter?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Latest callbacks without re-binding the listener every render — callers pass
  // inline closures over their own amount state.
  const onKeyRef = useRef(onKey);
  const onEnterRef = useRef(onEnter);
  useEffect(() => {
    onKeyRef.current = onKey;
    onEnterRef.current = onEnter;
  });

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Never hijack typing into a real field (a note sheet, a picker's search).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      const isEnter = e.key === "Enter";
      const key = isEnter ? null : keypadKeyFor(e, !!calcEnabled);
      if (!isEnter && key === null) return;
      if (isEnter && !onEnterRef.current) return;

      // Several keypads can be mounted at once (a quick-edit overlay opens over a
      // page that already has one, and dialogs keep their content around while
      // animating out). Rather than track which layer owns the keyboard, just ask
      // whether this keypad is the thing actually on screen at its own centre —
      // anything covering it wins the keystroke, and a keypad behind an overlay
      // or inside a `pointer-events: none` wrapper stays silent.
      const root = rootRef.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !root.contains(hit)) return;

      e.preventDefault();
      if (isEnter) onEnterRef.current?.();
      else onKeyRef.current(key!);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [calcEnabled]);

  return rootRef;
}
