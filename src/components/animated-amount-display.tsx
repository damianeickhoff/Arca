"use client";

import { m, AnimatePresence, LazyMotion, domMax } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/format";

// The per-digit blur/slide reveal used on the add-transaction page's running amount
// (each new digit blurs in from above, a deleted one falls away blurred), extracted so
// any other amount-entry screen (budget, category quick-edit, ...) can have the same
// "alive" numeric animation instead of a plain static string.
//
// The currency symbol (and optional sign) are rendered INSIDE the same `m.div layout`
// group as the digits, not as a static sibling — that's what makes the whole row glide
// together as one unit when the digit count changes, instead of the digits reflowing
// next to a symbol that just snaps in place.
export function AnimatedAmountDisplay({
  value,
  sign,
  currency = currencySymbol(),
  className,
  prefixClassName,
}: {
  value: string;
  /** Optional leading sign (e.g. "−"/"+"), animated together with the currency symbol. */
  sign?: string;
  currency?: string;
  /** Applied to each digit. */
  className?: string;
  /** Applied to the sign/currency symbols. */
  prefixClassName?: string;
}) {
  const isZero = value === "0";
  const chars = value.split("");
  return (
    <LazyMotion features={domMax}>
      <m.div layout className="flex items-baseline justify-center">
        {sign && (
          <m.span layout className={cn("shrink-0", prefixClassName)}>
            {sign}
          </m.span>
        )}
        <m.span layout className={cn("shrink-0", prefixClassName)}>
          {currency}
        </m.span>
        <div className="relative flex items-baseline">
          <AnimatePresence mode="popLayout" initial={false}>
            {chars.map((ch, i) => (
              <m.span
                key={`${i}-${ch}`}
                layout
                initial={{ opacity: 0, y: -30, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                transition={{
                  default: { type: "spring", stiffness: 520, damping: 36, mass: 0.9 },
                  opacity: { duration: 0.16 },
                  filter: { duration: 0.22 },
                }}
                className={cn("inline-block tabular-nums", isZero && "text-foreground/40", className)}
              >
                {ch}
              </m.span>
            ))}
          </AnimatePresence>
        </div>
      </m.div>
    </LazyMotion>
  );
}
