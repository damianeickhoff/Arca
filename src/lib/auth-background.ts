import type { CSSProperties } from "react";

export interface AuthBackgroundPreset {
  id: string;
  label: string;
  colors: string[];
  angle: number;
}

// A handful of curated color-fade options for the login/onboarding pages —
// no custom colors, no image upload, just pick one and go. Matches the
// dashboard wallet hero's blue (--wallet-background: rgb(3, 33, 157)) by
// keeping "midnight" as the default so the auth pages read as the same app.
export const AUTH_BACKGROUND_PRESETS: AuthBackgroundPreset[] = [
  { id: "midnight", label: "Midnight", colors: ["#0a1a5c", "#03219d", "#2563eb", "#050505"], angle: 170 },
  { id: "sunset", label: "Sunset", colors: ["#ed8139", "#d43b2f", "#691d42", "#2b1029"], angle: 170 },
  { id: "violet", label: "Violet Dusk", colors: ["#db90fd", "#6a30f4", "#23118b", "#040323"], angle: 170 },
  { id: "emerald", label: "Emerald Night", colors: ["#065f46", "#0ea5e9", "#050505"], angle: 170 },
  { id: "rose", label: "Rose Quartz", colors: ["#be185d", "#a855f7", "#1e1b4b", "#050505"], angle: 170 },
];

export const DEFAULT_AUTH_BACKGROUND_ID = AUTH_BACKGROUND_PRESETS[0].id;

export function getAuthBackgroundPreset(id: string | null | undefined): AuthBackgroundPreset {
  return AUTH_BACKGROUND_PRESETS.find((p) => p.id === id) ?? AUTH_BACKGROUND_PRESETS[0];
}

// `backgroundAttachment: "fixed"` anchors the gradient to viewport coordinates rather
// than the element's own box, so it lines up pixel-for-pixel wherever it's rendered.
//
// `boxHeight` sizes the whole layered background to that height (pass one full viewport,
// e.g. "100dvh") with solid black (via `backgroundColor`) filling everything past it —
// used on the dashboard, which can scroll well past one viewport, so the color shouldn't
// stretch or repeat down the whole page. `fadeStop` is the percentage *within that box*
// where the color finishes fading to black — e.g. boxHeight "100dvh" + fadeStop 50 means
// the color is gone by halfway down the viewport. Omit both (the login/onboarding case,
// always exactly one viewport tall) to keep the previous behavior: the gradient's own
// natural size, tiled if needed.
export function authBackgroundStyle(
  preset: AuthBackgroundPreset,
  options?: { boxHeight?: string; fadeStop?: number },
): CSSProperties {
  const [c1, c2 = c1, c3 = c2, c4 = c3] = preset.colors;
  const { boxHeight, fadeStop = 45 } = options ?? {};

  return {
    backgroundColor: "var(--background)",
    backgroundImage: `
      linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0) 0%,
        rgba(0, 0, 0, 0.35) ${fadeStop * (20 / 45)}%,
        rgba(0, 0, 0, 0.507) ${fadeStop * (35 / 45)}%,
        var(--background) ${fadeStop}%
      ),
      linear-gradient(
        ${preset.angle}deg,
        ${c1} 0%,
        ${c2} 15%,
        ${c3} 35%,
        ${c4} 100%
      )
    `,
    backgroundSize: boxHeight ? `100% ${boxHeight}` : "auto",
    backgroundPosition: "top",
    backgroundRepeat: boxHeight ? "no-repeat" : "repeat",
    backgroundAttachment: "fixed",
  };
}

// Used for the small preview swatches in the picker UI — no `fixed` attachment needed
// since these are little boxes, not full-page backgrounds.
export function authBackgroundPreviewStyle(preset: AuthBackgroundPreset): CSSProperties {
  return {
    backgroundImage: `linear-gradient(${preset.angle}deg, ${preset.colors.join(", ")})`,
  };
}
