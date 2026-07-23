"use client";

// Shared sticky-header backdrop: fully transparent at rest, picks up a
// blurred/saturated background and a bottom border only once the header's
// scroll container has actually been scrolled. Pair with `useScrollElevation`
// for the `scrolled` boolean.
export function ScrollHeaderBackdrop({ scrolled }: { scrolled: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 bottom-0 z-0 transition-colors duration-300 ${
        scrolled ? "border-b border-foreground/10" : "border-b border-transparent"
      }`}
      style={{
        backdropFilter: scrolled ? "blur(24px) saturate(180%)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(24px) saturate(180%)" : "none",
        background: scrolled ? "color-mix(in srgb, #1c1c1e 70%, transparent)" : "transparent",
      }}
    />
  );
}
