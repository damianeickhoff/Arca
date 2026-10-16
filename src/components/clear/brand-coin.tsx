import { IconCurrencyEuro } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

const SIZE = {
  md: { box: "size-10", icon: 22 },
  lg: { box: "size-11", icon: 24 },
  xl: { box: "size-[72px]", icon: 38 },
} as const;

/**
 * The Arca logo coin: an ember circle with the euro sign in ink. Decorative — the
 * name next to it (or the page heading) carries the meaning.
 */
export function BrandCoin({ size = "md", className }: { size?: keyof typeof SIZE; className?: string }) {
  const s = SIZE[size];
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-clear-ember text-clear-ember-ink", s.box, className)}>
      <IconCurrencyEuro size={s.icon} stroke={2.4} />
    </span>
  );
}
