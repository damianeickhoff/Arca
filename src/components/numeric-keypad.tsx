"use client";

import {
  IconBackspace,
  IconDivide,
  IconX as IconMultiply,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";
import { m, spring } from "@/lib/motion";

const DIGIT_GRID = ["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const;

// Reusable numeric keypad grid (digits + optional ÷ × − + operator column), with a
// shared spring-press tap animation. Callers own the amount display and key styling
// (via digitClassName/opClassName) so each surface keeps its own look — this only
// consolidates the grid markup + interaction feel across Add transaction, Add budget,
// and the category detail quick-edit keypad.
export function NumericKeypad({
  onKey,
  calcEnabled,
  digitClassName,
  opClassName,
}: {
  onKey: (key: string) => void;
  calcEnabled?: boolean;
  digitClassName: string;
  opClassName?: string;
}) {
  return (
    <div className="flex gap-2">
      <div className="grid grid-cols-3 gap-2 flex-1">
        {DIGIT_GRID.map((d) => (
          <m.button key={d} type="button" whileTap={{ scale: 0.92 }} transition={spring.press} onClick={() => onKey(d)} className={digitClassName}>
            {d}
          </m.button>
        ))}
        <m.button type="button" whileTap={{ scale: 0.92 }} transition={spring.press} onClick={() => onKey(",")} className={digitClassName}>
          ,
        </m.button>
        <m.button type="button" whileTap={{ scale: 0.92 }} transition={spring.press} onClick={() => onKey("0")} className={digitClassName}>
          0
        </m.button>
        <m.button type="button" whileTap={{ scale: 0.92 }} transition={spring.press} onClick={() => onKey("back")} aria-label="Backspace" className={digitClassName}>
          <IconBackspace className="size-6" />
        </m.button>
      </div>

      {calcEnabled && opClassName && (
        <div className="grid grid-cols-1 gap-2 w-16">
          <m.button type="button" whileTap={{ scale: 0.92 }} transition={spring.press} onClick={() => onKey("÷")} aria-label="Divide" className={opClassName}>
            <IconDivide className="size-6" />
          </m.button>
          <m.button type="button" whileTap={{ scale: 0.92 }} transition={spring.press} onClick={() => onKey("×")} aria-label="Multiply" className={opClassName}>
            <IconMultiply className="size-6" />
          </m.button>
          <m.button type="button" whileTap={{ scale: 0.92 }} transition={spring.press} onClick={() => onKey("−")} aria-label="Subtract" className={opClassName}>
            <IconMinus className="size-6" />
          </m.button>
          <m.button type="button" whileTap={{ scale: 0.92 }} transition={spring.press} onClick={() => onKey("+")} aria-label="Add" className={opClassName}>
            <IconPlus className="size-6" />
          </m.button>
        </div>
      )}
    </div>
  );
}
