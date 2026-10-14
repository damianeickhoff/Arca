import { cn } from "@/lib/utils";

type Tone = "default" | "positive" | "negative" | "warning" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  default: "text-ink",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  accent: "text-mustard-strong",
};

/**
 * A small figure tile on surface-2: an uppercase DM Mono label over a bold amount.
 * Used in rows of two or three ("Allocated · Free · Per day").
 */
export function Stat({
  label,
  value,
  tone = "default",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-[14px] bg-surface-2 px-3.5 py-3", className)}>
      <span className="mono-label truncate text-[10px]">{label}</span>
      <span className={cn("amount truncate text-[17px] tabular-nums", TONE_CLASS[tone])}>{value}</span>
    </div>
  );
}
