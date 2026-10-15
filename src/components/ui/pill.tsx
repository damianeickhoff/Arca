import { cn } from "@/lib/utils";

export type PillTone = "neutral" | "accent" | "positive" | "negative" | "warning" | "info" | "ink";

const TONE_CLASS: Record<PillTone, string> = {
  neutral: "bg-clear-tile text-clear-ink-2",
  accent: "bg-clear-peach text-clear-ember-text",
  positive: "bg-clear-mint text-clear-positive",
  negative: "bg-clear-peach text-clear-negative",
  warning: "bg-clear-butter text-clear-warning",
  info: "bg-clear-sky text-clear-info",
  // On the mustard hero: an ink capsule with mustard text.
  ink: "bg-clear-primary text-clear-ember",
};

/**
 * A 24px status pill — "Recurring", "Want", "On pace". The radius is always half the
 * height, like every chip and button in the redesign.
 */
export function Pill({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: React.ReactNode;
  tone?: PillTone;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] text-xs font-bold [&_svg]:size-3 [&_svg]:shrink-0",
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
