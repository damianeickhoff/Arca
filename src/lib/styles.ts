// Shared "liquid glass" styling for the circular mobile header icon buttons
// (hamburger, chat, add, calendar, bank). The visual recipe lives in the
// `.glass-icon-btn` CSS class in globals.css (frosted blur + saturate, a luminous
// border, and a directional specular rim via ::after) — a pure-CSS approximation of
// Revolut's iOS-26 Liquid Glass that renders in WebKit (iPhone PWA). True SVG
// displacement refraction is Chromium-only, so it's intentionally omitted.
export const glassIconButton = "glass-icon-btn";
