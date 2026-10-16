import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { TONE_FILL, type ClearTone } from "./tones";
import { MoneyText } from "@/components/clear/money";

/** A 28px status chip on a pastel ("Recurring", "Needs a category", "On pace"). */
export function ClearChip({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: ClearTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 font-clear text-[13px] font-extrabold [&_svg]:size-3.5 [&_svg]:shrink-0",
        TONE_FILL[tone],
        className,
      )}
    >
      {icon}
      <MoneyText>{children}</MoneyText>
    </span>
  );
}

/**
 * A change-versus-last-period chip ("↑ 3%"). `good` decides the colour, not the
 * direction: spending going down is good news, so pass good={true} with direction="down".
 */
export function DeltaChip({
  direction,
  good,
  children,
  className,
}: {
  direction: "up" | "down";
  good: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const Arrow = direction === "up" ? IconArrowUpRight : IconArrowDownRight;
  return (
    <ClearChip tone={good ? "mint" : "peach"} icon={<Arrow stroke={2.4} aria-hidden />} className={cn(!good && "text-clear-negative", className)}>
      {children}
    </ClearChip>
  );
}

/** An 8px dot plus label for row status ("Recurring", "To review", "Refund"). */
export function StatusDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-clear text-sm font-semibold">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}
