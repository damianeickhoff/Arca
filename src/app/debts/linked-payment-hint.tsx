"use client";

import { useTranslations } from "next-intl";
import { IconReload } from "@tabler/icons-react";
import { formatEur } from "@/lib/format";

/**
 * Explains where a debt's minimum monthly payment came from, shown above the payment
 * keypad in both the add page and the edit dialog.
 *
 * Two states: the payment is following the linked recurring bills (informational), or
 * the user has typed their own figure (offers a one-tap way back to the linked amount).
 * Nothing renders when no bill is linked — there is no derived amount to talk about.
 */
export function LinkedPaymentHint({
  linkedMonthly,
  billCount,
  overridden,
  onUse,
}: {
  linkedMonthly: number;
  billCount: number;
  overridden: boolean;
  onUse: () => void;
}) {
  const t = useTranslations("debts");
  if (linkedMonthly <= 0 || billCount === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[var(--dialog-content-background)] px-4 py-3 -mt-1">
      <IconReload className="size-4.5 mt-0.5 shrink-0 text-foreground/40" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground/60 leading-snug">
          {overridden
            ? t("paymentOverridden", { amount: formatEur(linkedMonthly), count: billCount })
            : t("paymentFromLinked", { amount: formatEur(linkedMonthly), count: billCount })}
        </p>
        {overridden && (
          <button
            type="button"
            onClick={onUse}
            className="mt-1.5 text-sm font-semibold text-foreground underline underline-offset-2 active:opacity-70"
          >
            {t("useLinkedAmount")}
          </button>
        )}
      </div>
    </div>
  );
}
