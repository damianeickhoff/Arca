import { useTranslations } from "next-intl";
import { IconArrowDownRight as ArrowDownRight, IconArrowUpRight as ArrowUpRight } from "@tabler/icons-react";

export type Change = { label: string; up: boolean } | null;

// The period-over-period change, as used across Insights. Direction is semantic, not
// literal — callers pre-flip the sign so "up" always means "good" (spending less is
// the good direction). Mustard: positive / negative on their soft washes.
export function ChangePill({ change }: { change: Change }) {
  if (!change) return null;
  return (
    <span
      className={
        change.up
          ? "inline-flex w-fit items-center gap-0.5 rounded-full bg-positive-soft px-2 py-0.5 text-[11px] font-bold text-positive"
          : "inline-flex w-fit items-center gap-0.5 rounded-full bg-negative-soft px-2 py-0.5 text-[11px] font-bold text-negative"
      }
    >
      {change.up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {change.label}
    </span>
  );
}

// ChangePill + caption, stacked underneath an amount. Renders nothing when there's no
// previous-period data to compare against.
export function ChangeRow({ change, caption, className = "mt-1" }: { change: Change; caption?: string; className?: string }) {
  const t = useTranslations("insights");
  if (!change) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <ChangePill change={change} />
      <span className="text-[13px] text-ink-3">{caption ?? t("vsLastPeriod")}</span>
    </div>
  );
}
