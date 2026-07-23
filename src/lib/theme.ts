"use client";

import { useCallback, useEffect, useState } from "react";

// Theme is client-side only (localStorage), applied as a `.dark` class on <html> by the
// blocking inline script in src/app/layout.tsx before hydration. "system" is represented
// by the ABSENCE of the localStorage key, so legacy stored 'light'/'dark' values and the
// inline script's no-key fallback keep working without migration.
export type ThemeMode = "light" | "system" | "dark";

const KEY = "theme";
// Custom event so multiple mounted toggle instances (desktop sidebar + mobile menu)
// stay in sync — the `storage` event only fires in OTHER tabs.
const EVT = "app-themechange";

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getMode(): ThemeMode {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function resolveIsDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && prefersDark().matches);
}

function apply(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", resolveIsDark(mode));
}

export function setMode(mode: ThemeMode) {
  if (mode === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, mode);
  apply(mode);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useTheme() {
  // Hydration-safe: the theme is unknowable during SSR, so state starts at the defaults
  // and a one-time effect syncs from the DOM/localStorage (same pattern the old boolean
  // toggle used).
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const sync = () => {
      const m = getMode();
      setModeState(m);
      setIsDark(resolveIsDark(m));
    };
    sync();
    const mq = prefersDark();
    // Live-follow the OS while in system mode.
    const onOsChange = () => {
      if (getMode() === "system") {
        apply("system");
        sync();
      }
    };
    mq.addEventListener("change", onOsChange);
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      mq.removeEventListener("change", onOsChange);
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((m: ThemeMode) => setMode(m), []);

  const cycle = useCallback(() => {
    const order: ThemeMode[] = ["light", "system", "dark"];
    set(order[(order.indexOf(getMode()) + 1) % order.length]);
  }, [set]);

  return { mode, isDark, setMode: set, cycle };
}
