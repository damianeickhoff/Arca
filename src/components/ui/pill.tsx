import { cn } from "@/lib/utils";

export type PillTone = "neutral" | "accent" | "positive" | "negative" | "warning" | "info" | "ink";

const TONE_CLASS: Record<PillTone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-mustard-soft text-mustard-strong",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  // On the mustard hero: an ink capsule with mustard text.
  ink: "bg-ink text-mustard",
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
        "inline-flex h-6 shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] text-[11px] font-bold [&_svg]:size-3 [&_svg]:shrink-0",
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
