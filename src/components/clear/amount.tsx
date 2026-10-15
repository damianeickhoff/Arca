import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A money figure in the Clear style: sign first ("−€46,00", "+€39,99"), heavy and
 * tabular, with the cents part at half size and muted ("€973,25" → "€973" + ",25").
 * `sign="auto"` shows only a minus; "always" also shows the plus for income.
 * `whole` rounds to whole euros, for figures in tight tiles.
 * The size comes from the caller's text-* class; the cents scale with it.
 */
export function Amount({
  value,
  sign = "auto",
  splitCents = true,
  whole = false,
  className,
  centsClassName,
}: {
  value: number;
  sign?: "auto" | "always" | "none";
  splitCents?: boolean;
  whole?: boolean;
  className?: string;
  centsClassName?: string;
}) {
  const formatted = whole ? formatEurWhole(Math.abs(value)) : formatEur(Math.abs(value));
  const prefix = sign === "none" ? "" : value < 0 ? "−" : sign === "always" && value > 0 ? "+" : "";
  const comma = formatted.lastIndexOf(",");
  const main = splitCents && comma !== -1 ? formatted.slice(0, comma) : formatted;
  const cents = splitCents && comma !== -1 ? formatted.slice(comma) : "";

  return (
    <span className={cn("clear-amount whitespace-nowrap", className)}>
      {prefix}
      {main}
      {cents && <span className={cn("text-[0.5em] opacity-60", centsClassName)}>{cents}</span>}
    </span>
  );
}
