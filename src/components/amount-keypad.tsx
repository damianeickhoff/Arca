"use client";

import {
  IconBackspace,
  IconDivide,
  IconX as IconMultiply,
  IconMinus,
  IconPlus,
  IconCalculator,
} from "@tabler/icons-react";
import { m, AnimatePresence, LazyMotion, domMax } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { isOperator, evaluateExpression, formatAmount, pressKey } from "@/lib/amount-expression";
import { currencySymbol } from "@/lib/format";

const digitKey =
  "flex items-center justify-center rounded-2xl h-14 text-2xl font-medium text-foreground bg-foreground/5 active:bg-foreground/10 transition-colors select-none";
const opKey =
  "flex items-center justify-center rounded-2xl h-14 text-foreground/80 bg-foreground/[0.07] active:bg-foreground/15 transition-colors select-none";

// The same calculator-style amount entry used on the add-transaction page: a big animated
// running amount on top and a numeric keypad below, with an optional ÷ × − + operator
// column when the calculator is enabled. Controlled via `expr` / `onChange` (a keypad
// expression string; use evaluateExpression() to get the number).
export function AmountKeypad({
  expr,
  onChange,
  sign = "",
  positive = false,
  calcEnabled,
  onToggleCalc,
}: {
  expr: string;
  onChange: (next: string) => void;
  sign?: "" | "−" | "+";
  /** Colors the running amount green — e.g. a debt someone owes you, like income. */
  positive?: boolean;
  calcEnabled: boolean;
  onToggleCalc?: () => void;
}) {
  const hasOps = expr.split("").some(isOperator);
  const result = evaluateExpression(expr);
  const bigDisplay = hasOps ? (result === null ? "0" : formatAmount(result)) : expr || "0";
  const isZeroDisplay = bigDisplay === "0";
  const amountChars = bigDisplay.split("");
  const press = (key: string) => onChange(pressKey(expr, key));

  return (
    <div className="flex flex-col">
      {/* Running amount */}
      <div className="flex items-center justify-center py-8 min-h-24">
        <LazyMotion features={domMax}>
          <m.div layout className="flex items-baseline justify-center">
            {sign && (
              <m.span layout className={cn("text-4xl font-bold shrink-0 mr-2", positive ? "text-success/40" : "text-foreground/40")}>{sign}</m.span>
            )}
            <m.span layout className={cn("text-5xl font-bold shrink-0 mr-2", positive ? "text-success/40" : "text-foreground/40")}>{currencySymbol()}</m.span>
            <div className="relative flex items-baseline">
              <AnimatePresence mode="popLayout" initial={false}>
                {amountChars.map((ch, i) => (
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
                    className={cn(
                      "inline-block text-5xl font-bold tabular-nums",
                      positive ? "text-success" : isZeroDisplay ? "text-foreground/40" : "text-foreground",
                    )}
                  >
                    {ch}
                  </m.span>
                ))}
              </AnimatePresence>
            </div>
          </m.div>
        </LazyMotion>
      </div>
      {hasOps && <div className="text-center text-base text-foreground/40 tabular-nums -mt-3 mb-2">{expr}</div>}

      {/* Keypad */}
      <div className="flex gap-2">
        <div className="grid grid-cols-3 gap-2 flex-1">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} className={digitKey}>{d}</button>
          ))}
          <button type="button" onClick={() => press(",")} className={digitKey}>,</button>
          <button type="button" onClick={() => press("0")} className={digitKey}>0</button>
          <button type="button" onClick={() => press("back")} aria-label="Backspace" className={digitKey}>
            <IconBackspace className="size-6" />
          </button>
        </div>

        {calcEnabled && (
          <div className="grid grid-cols-1 gap-2 w-16">
            <button type="button" onClick={() => press("÷")} aria-label="Divide" className={opKey}><IconDivide className="size-6" /></button>
            <button type="button" onClick={() => press("×")} aria-label="Multiply" className={opKey}><IconMultiply className="size-6" /></button>
            <button type="button" onClick={() => press("−")} aria-label="Subtract" className={opKey}><IconMinus className="size-6" /></button>
            <button type="button" onClick={() => press("+")} aria-label="Add" className={opKey}><IconPlus className="size-6" /></button>
          </div>
        )}
      </div>

      {onToggleCalc && (
        <button
          type="button"
          onClick={onToggleCalc}
          className="mt-3 self-center inline-flex items-center gap-2 text-sm text-foreground/50 active:text-foreground/80 transition-colors"
        >
          <IconCalculator className="size-4" />
          {calcEnabled ? "Hide calculator" : "Show calculator"}
        </button>
      )}
    </div>
  );
}
