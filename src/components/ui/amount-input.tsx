"use client";

import { Input } from "@/components/ui/input";
import type { ComponentProps } from "react";

// Keeps only digits and a single decimal separator (comma normalized to period,
// since Dutch users commonly type a comma) — everything else, including a second
// separator, is stripped as typed.
function sanitizeAmount(raw: string): string {
  let value = raw.replace(",", ".").replace(/[^0-9.]/g, "");
  const dot = value.indexOf(".");
  if (dot !== -1) {
    value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  }
  return value;
}

// A money-amount input. `type="number"` alone doesn't reliably give a clean
// numeric keyboard on mobile — iOS Safari shows its full "Numbers and
// Punctuation" keyboard for it unless `inputMode` is also set, and even then the
// exact key set (extra +/-, "e" for exponents) is up to the OS/keyboard app, not
// the page. Using `type="text"` + `inputMode="decimal"` instead gives full
// control over what's accepted: only digits, "." and ",".
export function AmountInput({ onChange, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      onChange={(e) => {
        e.target.value = sanitizeAmount(e.target.value);
        onChange?.(e);
      }}
      {...props}
    />
  );
}
