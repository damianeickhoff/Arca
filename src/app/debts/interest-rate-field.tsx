"use client";

import { useTranslations } from "next-intl";
import { formatEur } from "@/lib/format";
import { monthlyRate, paymentCoversInterest } from "@/lib/debt-interest";

/**
 * Parse the annual-rate text field. Accepts a comma or a period as the decimal
 * separator (Dutch keyboards give a comma) and returns null for blank/zero/nonsense —
 * null being the "this debt is interest-free" value the whole payoff model keys off.
 */
export function parseRatePercent(raw: string): number | null {
  const value = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1000) / 1000;
}

/** Digits and a single decimal separator, as typed. */
export function sanitizeRate(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 3);
}

/**
 * The optional annual interest rate, plus a live read-out of what it costs this month.
 * Shared by the add page and the edit dialog so the explanation of *why* the payoff date
 * moves lives in exactly one place.
 */
export function InterestRateField({
  value,
  onChange,
  balance,
  payment,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Current outstanding balance, for the monthly-cost preview. */
  balance: number | null;
  /** The minimum monthly payment, to warn when it can't cover the interest. */
  payment: number | null;
}) {
  const t = useTranslations("debts");
  const rate = parseRatePercent(value);
  const monthly = rate != null && balance ? balance * monthlyRate(rate) : null;
  // A payment that doesn't clear the monthly interest means the debt never shrinks —
  // worth saying out loud at the moment the rate is entered, not on a page elsewhere.
  const stuck =
    rate != null && balance != null && balance > 0 && payment != null && payment > 0
      ? !paymentCoversInterest(balance, payment, monthlyRate(rate))
      : false;

  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm text-foreground/50">{t("interestHelp")}</p>
      <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-4 h-14">
        <input
          value={value}
          onChange={(e) => onChange(sanitizeRate(e.target.value))}
          inputMode="decimal"
          placeholder="0"
          data-autofocus
          data-no-keyboard-scroll
          className="flex-1 min-w-0 bg-transparent text-2xl font-medium tabular-nums text-foreground placeholder:text-foreground/30 outline-none"
        />
        <span className="text-2xl font-medium text-foreground/40 shrink-0">%</span>
      </div>
      {monthly != null && monthly > 0 && (
        <p className="text-sm text-foreground/50">
          {t("interestPerMonth", { amount: formatEur(monthly) })}
        </p>
      )}
      {stuck && <p className="text-sm text-destructive">{t("interestTooLow")}</p>}
    </div>
  );
}
