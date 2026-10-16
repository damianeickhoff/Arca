import { cn } from "@/lib/utils";

const SIZE = {
  md: "size-9",
  lg: "size-10",
  xl: "size-16",
} as const;

/**
 * The Arca logo: a lowercase "a" whose bowl is an ember coin going into the slot of its
 * stem. The stem takes the surrounding text colour, so it is ink on light surfaces and
 * light on the hero and in dark mode. Decorative — the name next to it (or the page
 * heading) carries the meaning. src/app/icon.tsx and apple-icon.tsx draw the same shapes.
 */
export function BrandMark({ size = "md", className }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    <svg viewBox="8 8 48 48" aria-hidden className={cn("shrink-0", SIZE[size], className)}>
      <circle cx="30" cy="32" r="19" className="fill-clear-ember" />
      <rect x="41" y="13" width="12" height="38" rx="6" fill="currentColor" />
    </svg>
  );
}
