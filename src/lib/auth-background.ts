import type { CSSProperties } from "react";

export interface AuthBackgroundPreset {
  id: string;
  label: string;
  // Dark-theme palette (fades down into near-black / the dark --background).
  colors: string[];
  // Light-theme palette (fades down into white / the light --background). Same hue
  // identity as `colors`, just lighter/softer so it reads on a bright surface. Falls
  // back to `colors` if a preset ever omits it.
  lightColors: string[];
  angle: number;
}

// A handful of curated color-fade options for the login/onboarding pages —
// no custom colors, no image upload, just pick one and go. Matches the
// dashboard wallet hero's blue (--wallet-background: rgb(3, 33, 157)) by
// keeping "midnight" as the default so the auth pages read as the same app.
//
// Each preset carries two palettes: `colors` for the dark theme and `lightColors`
// for the light theme. The stored per-user choice is just the preset id, so the same
// id resolves to the right palette in whichever theme is active — see authBackgroundStyle.
export const AUTH_BACKGROUND_PRESETS: AuthBackgroundPreset[] = [
  {
    id: "midnight",
    label: "Midnight",
    colors: ["#0a1a5c", "#03219d", "#2563eb", "#050505"],
    lightColors: ["#3b5bdb", "#4c6ef5", "#74a0f7", "#dbe4ff"],
    angle: 170,
  },
  {
    id: "sunset",
    label: "Sunset",
    colors: ["#ed8139", "#d43b2f", "#691d42", "#2b1029"],
    lightColors: ["#ffa94d", "#ff8787", "#e64980", "#ffdeeb"],
    angle: 170,
  },
  {
    id: "violet",
    label: "Violet Dusk",
    colors: ["#db90fd", "#6a30f4", "#23118b", "#040323"],
    lightColors: ["#b197fc", "#845ef7", "#7048e8", "#e5dbff"],
    angle: 170,
  },
  {
    id: "emerald",
    label: "Emerald Night",
    colors: ["#065f46", "#0ea5e9", "#050505"],
    lightColors: ["#099268", "#20c997", "#63e6be", "#c3fae8"],
    angle: 170,
  },
  {
    id: "rose",
    label: "Rose Quartz",
    colors: ["#be185d", "#a855f7", "#1e1b4b", "#050505"],
    lightColors: ["#f06595", "#cc5de8", "#b197fc", "#fcc2d7"],
    angle: 170,
  },
];

export const DEFAULT_AUTH_BACKGROUND_ID = AUTH_BACKGROUND_PRESETS[0].id;

export function getAuthBackgroundPreset(id: string | null | undefined): AuthBackgroundPreset {
  return AUTH_BACKGROUND_PRESETS.find((p) => p.id === id) ?? AUTH_BACKGROUND_PRESETS[0];
}

// Builds the two-layer background image string for one theme: a top-to-bottom overlay
// that fades the color wash into --background, over the preset's diagonal color gradient.
// `fadeColor` is the tint the overlay fades *through* before it reaches --background —
// black in dark mode (so colors sink into the near-black page) and white in light mode
// (so they wash out over the bright page instead of leaving a dark smudge).
function buildImage(colors: string[], angle: number, fadeStop: number, fadeColor: string): string {
  const [c1, c2 = c1, c3 = c2, c4 = c3] = colors;
  return `
    linear-gradient(
      to bottom,
      ${fadeColor} 0%,
      ${fadeColor.replace(", 0)", ", 0.35)")} ${fadeStop * (20 / 45)}%,
      ${fadeColor.replace(", 0)", ", 0.507)")} ${fadeStop * (35 / 45)}%,
      var(--background) ${fadeStop}%
    ),
    linear-gradient(
      ${angle}deg,
      ${c1} 0%,
      ${c2} 15%,
      ${c3} 35%,
      ${c4} 100%
    )
  `;
}

// `backgroundAttachment: "fixed"` anchors the gradient to viewport coordinates rather
// than the element's own box, so it lines up pixel-for-pixel wherever it's rendered.
//
// `boxHeight` sizes the whole layered background to that height (pass one full viewport,
// e.g. "100dvh") with the solid --background (via `backgroundColor`) filling everything
// past it — used on the dashboard, which can scroll well past one viewport, so the color
// shouldn't stretch or repeat down the whole page. `fadeStop` is the percentage *within
// that box* where the color finishes fading — e.g. boxHeight "100dvh" + fadeStop 50 means
// the color is gone by halfway down the viewport. Omit both (the login/onboarding case,
// always exactly one viewport tall) to keep the previous behavior: the gradient's own
// natural size, tiled if needed.
//
// Theme adaptation: these styles are rendered server-side (dashboard, auth shell) where the
// active theme is unknown. `theme` decides which palette paints:
//   "adaptive" (default) — emits BOTH palettes as inline custom properties (--auth-bg-light /
//                          --auth-bg-dark) and leaves `background-image` unset. The caller
//                          MUST add the AUTH_BG_CLASS className; the matching globals.css rule
//                          (.auth-bg / .dark .auth-bg) then selects the live palette from the
//                          `.dark` class. The switch has to live in a real CSS rule on the
//                          element — a `:root { --x: var(--per-element-var) }` indirection does
//                          NOT work, because a var() inside a custom property resolves on the
//                          element where it's *declared* (:root, where the per-element vars
//                          don't exist), not where it's used.
//   "dark" / "light"     — pin one palette regardless of theme by inlining that image string
//                          directly (no class needed). The pre-auth screens (AuthShell,
//                          onboarding) are a deliberately always-dark art scene with white
//                          text + a dark scrim, so they pin "dark".
type BgTheme = "adaptive" | "dark" | "light";

// className the caller must apply alongside an `adaptive` style so globals.css can switch
// the background image per theme. No-op for pinned styles (they inline the image directly).
export const AUTH_BG_CLASS = "auth-bg";

export function authBackgroundStyle(
  preset: AuthBackgroundPreset,
  options?: { boxHeight?: string; fadeStop?: number; theme?: BgTheme },
): CSSProperties {
  const { boxHeight, fadeStop = 45, theme = "adaptive" } = options ?? {};

  const darkImage = buildImage(preset.colors, preset.angle, fadeStop, "rgba(0, 0, 0, 0)");
  const lightImage = buildImage(preset.lightColors ?? preset.colors, preset.angle, fadeStop, "rgba(255, 255, 255, 0)");

  const base: CSSProperties = {
    backgroundColor: "var(--background)",
    backgroundSize: boxHeight ? `100% ${boxHeight}` : "auto",
    backgroundPosition: "top",
    backgroundRepeat: boxHeight ? "no-repeat" : "repeat",
    backgroundAttachment: "fixed",
  };

  if (theme === "adaptive") {
    return { ...base, "--auth-bg-light": lightImage, "--auth-bg-dark": darkImage } as CSSProperties;
  }
  return { ...base, backgroundImage: theme === "dark" ? darkImage : lightImage };
}

// Used for the small preview swatches in the picker UI — no `fixed` attachment needed
// since these are little boxes, not full-page backgrounds. Same theme handling as
// authBackgroundStyle: adaptive emits both palettes (caller adds AUTH_BG_CLASS), a pin
// inlines one gradient directly.
export function authBackgroundPreviewStyle(
  preset: AuthBackgroundPreset,
  options?: { theme?: BgTheme },
): CSSProperties {
  const { theme = "adaptive" } = options ?? {};
  const darkImage = `linear-gradient(${preset.angle}deg, ${preset.colors.join(", ")})`;
  const lightImage = `linear-gradient(${preset.angle}deg, ${(preset.lightColors ?? preset.colors).join(", ")})`;

  if (theme === "adaptive") {
    return { "--auth-bg-light": lightImage, "--auth-bg-dark": darkImage } as CSSProperties;
  }
  return { backgroundImage: theme === "dark" ? darkImage : lightImage };
}
