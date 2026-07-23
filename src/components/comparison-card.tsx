import type { ReactNode } from "react";
import Link from "next/link";
import {
  IconArrowUpRight as ArrowUpRight,
  IconArrowDownRight as ArrowDownRight
} from "@tabler/icons-react";
import { SplitEur } from "@/components/split-eur";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

function signedEur(amount: number) {
  return `${amount < 0 ? "-" : ""}${formatEur(amount)}`;
}

export function ComparisonCard({
  icon, iconBg, title, subtitle, value, changePct, caption, href, invert = false, compact = false, className,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  value: number;
  changePct: number | null;
  caption: ReactNode;
  href?: string;
  /** When true, a decrease is shown as "good" (green) instead of an increase — e.g. spending less is positive. */
  invert?: boolean;
  /** Tighter padding and smaller value text — for side-by-side placement in a fixed-width grid. */
  compact?: boolean;
  /** Override the default horizontal-scroll-row sizing (w-[80%] max-w-[300px] shrink-0 snap-start). */
  className?: string;
}) {
  const isUp = (changePct ?? 0) >= 0;
  const isGood = invert ? !isUp : isUp;
  return (
    <div className={cn("rounded-xl bg-card w-[80%] max-w-[300px] shrink-0 snap-start", compact ? "p-3.5" : "p-4", className)}>
      <div className={cn("flex items-center justify-between gap-2", compact ? "mb-2" : "mb-3")}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("rounded-sm flex items-center justify-center shrink-0", compact ? "size-8" : "size-10 mr-1", iconBg)}>{icon}</span>
          <div className="min-w-0">
            <p className={cn("font-bold truncate", compact ? "text-xs" : "text-sm")}>{title}</p>
            <p className="text-xs text-foreground/50 truncate">{subtitle}</p>
          </div>
        </div>
        {href && (
          <Link href={href} className="size-9 rounded-full bg-foreground/5 text-foreground flex items-center justify-center shrink-0">
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className={cn("flex items-baseline gap-2 mb-1 flex-wrap", compact && "gap-1")}>
        <p className={cn("font-medium tabular-nums leading-none", compact ? "text-2xl mt-1" : "text-4xl mt-3")}><SplitEur formatted={signedEur(value)} /></p>
        {changePct !== null && (
          <span className={`flex items-center gap-0.5 text-sm font-semibold rounded-full py-0.5 shrink-0 ${
            isGood
              ? "bg-none text-green-500 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-none text-red-500 dark:bg-red-800/30 dark:text-red-400"
          }`}>
            {isUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(changePct).toFixed(1)}%
          </span>
        )}
      </div>
      <p className={cn("text-xs text-foreground/60", compact ? "mt-2" : "mt-3")}>{caption}</p>
    </div>
  );
}
