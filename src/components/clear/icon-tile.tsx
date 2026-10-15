import { cn } from "@/lib/utils";
import { TONE_FILL, type ClearTone } from "./tones";

const SIZE = {
  sm: "size-9 rounded-clear-icon [&_svg]:size-[18px]",
  md: "size-11 rounded-clear-icon [&_svg]:size-5",
  lg: "size-14 rounded-clear-tile [&_svg]:size-6",
} as const;

/**
 * A rounded square holding an icon (or a 1–2 letter monogram) on a pastel — category,
 * merchant and account icons. Decorative: the row next to it carries the name.
 */
export function IconTile({
  tone = "neutral",
  size = "md",
  children,
  className,
}: {
  tone?: ClearTone;
  size?: keyof typeof SIZE;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center font-clear text-sm font-extrabold", SIZE[size], TONE_FILL[tone], className)}
    >
      {children}
    </span>
  );
}
