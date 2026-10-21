"use client";

import { useLocale, useTranslations } from "next-intl";
import { IconAlertTriangle, IconCheck, IconInfoCircle } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";
import { monthlyRate, paymentCoversInterest, payoffMonths } from "@/lib/debt-interest";
import { Icon } from "@/components/icon";
import { MoneyText } from "@/components/clear/money";

// Small pieces the Debts page, its detail sheet and its form share.

/** "Feb 2033" in the user's locale. */
export function useMonthYear() {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  return (d: Date) => fmt.format(d);
}

/** The first of the month `n` months from now. */
export function monthsFromNow(n: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** A colour's pastel: its own colour at 16% on the card, as on Home and Budget. */
export function pastel(color: string | null | undefined) {
  return color ? `color-mix(in srgb, ${color} 16%, transparent)` : "var(--clr-tile)";
}

/**
 * A debt's icon on its pastel tile. Debts without an icon of their own borrow their
 * linked bill's, and fall back to a card (I owe) or cash (I am owed) glyph.
 */
export function DebtIcon({
  icon,
  color,
  owed = false,
  size = "md",
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  owed?: boolean;
  size?: "sm" | "md" | "xl" | "xxl";
}) {
  return (
    <span aria-hidden className="inline-flex shrink-0 text-clear-ink-2">
      <Icon
        iconKey={icon ?? (owed ? "IconCash" : "IconCreditCard")}
        color={color ?? "var(--clr-ink-2)"}
        background={pastel(color)}
        size={size}
      />
    </span>
  );
}

type Tone = "mint" | "rose" | "butter";

const NOTICE_FILL: Record<Tone, string> = {
  mint: "bg-clear-mint",
  rose: "bg-clear-rose",
  butter: "bg-clear-butter",
};
const NOTICE_ICON: Record<Tone, string> = {
  mint: "text-clear-mint-ink",
  rose: "text-clear-rose-ink",
  butter: "text-clear-butter-ink",
};

/** What a notice says: the tone of its tile and the sentence, figures in bold. */
export type PaymentNoticeValue = { tone: Tone; text: React.ReactNode };

const bold = (chunks: React.ReactNode) => <b className="font-extrabold">{chunks}</b>;

/**
 * What one month's payment does to the balance: how much of it is interest and how much
 * comes off — or that it never clears the interest, or that no payment is set. Shared by
 * the debt tiles, the detail sheet and the live preview in the form. With `payoffFrom`
 * (the date the balance was true, "YYYY-MM-DD") it also says when this payment clears
 * it: "Debt-free in 18 months (Apr 2027)."
 */
export function usePaymentNotice() {
  const t = useTranslations("plan.debts.notice");
  const monthYear = useMonthYear();
  return ({
    balance,
    payment,
    rate: annualRate,
    owed,
    payoffFrom,
  }: {
    balance: number;
    payment: number;
    rate: number | null | undefined;
    owed: boolean;
    payoffFrom?: string;
  }): PaymentNoticeValue | null => {
    if (balance <= 0) return null;
    const dir = owed ? "owed" : "owe";
    const rate = monthlyRate(annualRate);
    const interest = Math.round(balance * rate * 100) / 100;
    if (payment <= 0) return { tone: "butter", text: t.rich("noPayment", { dir, b: bold }) };
    if (!paymentCoversInterest(balance, payment, rate)) {
      return { tone: "rose", text: t.rich("neverCovers", { dir, payment: formatEur(payment), interest: formatEur(interest), b: bold }) };
    }
    const sentence =
      rate > 0
        ? t.rich("covers", {
            dir,
            payment: formatEur(payment),
            interest: formatEur(interest),
            principal: formatEur(Math.max(0, Math.round((payment - interest) * 100) / 100)),
            b: bold,
          })
        : t.rich("noInterest", { dir, payment: formatEur(payment), b: bold });
    const months = payoffFrom ? payoffMonths(balance, payment, rate) : null;
    if (!payoffFrom || months == null) return { tone: "mint", text: sentence };
    // The payments start from the balance date; count the months still ahead of today.
    const from = new Date(`${payoffFrom.slice(0, 7)}-01T12:00:00`);
    const end = new Date(from.getFullYear(), from.getMonth() + months, 1, 12);
    const now = new Date();
    const ahead = (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth();
    const payoff =
      ahead > 0
        ? t.rich("payoff", { dir, count: ahead, date: monthYear(end), b: bold })
        : t.rich("payoffPast", { dir, date: monthYear(end), b: bold });
    return {
      tone: "mint",
      text: (
        <>
          <MoneyText>{sentence}</MoneyText> {payoff}
        </>
      ),
    };
  };
}

/**
 * The notice as a pastel tile (detail sheet, form) or as a quiet line with an info icon
 * (debt tiles on the page, where the tile itself is already grey).
 */
export function PaymentNotice({
  notice,
  variant = "tile",
  className,
}: {
  notice: PaymentNoticeValue | null;
  variant?: "tile" | "line";
  className?: string;
}) {
  if (!notice) return null;
  if (variant === "line") {
    return (
      <p className={cn("m-0 flex gap-2 text-[13px] leading-[1.45]", notice.tone === "mint" ? "text-clear-ink-2" : NOTICE_ICON[notice.tone], className)}>
        {notice.tone === "mint" ? (
          <IconInfoCircle aria-hidden size={16} stroke={2} className="mt-px shrink-0" />
        ) : (
          <IconAlertTriangle aria-hidden size={16} stroke={2} className="mt-px shrink-0" />
        )}
        <span><MoneyText>{notice.text}</MoneyText></span>
      </p>
    );
  }
  return (
    <div className={cn("flex items-start gap-3 rounded-clear-tile px-4 py-3", NOTICE_FILL[notice.tone], className)}>
      <span aria-hidden className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-card", NOTICE_ICON[notice.tone])}>
        {notice.tone === "mint" ? <IconCheck size={16} stroke={2.6} /> : <IconAlertTriangle size={16} stroke={2.2} />}
      </span>
      <span className="self-center text-sm leading-[1.5] font-semibold text-clear-ink"><MoneyText>{notice.text}</MoneyText></span>
    </div>
  );
}

/**
 * The "extra each month" range input: hatched track, ember fill up to the value and a
 * round black thumb. The Debts page's simulator and the payoff timeline popup both draw
 * it on the same state, so moving one moves the other. Label it with a <label htmlFor>.
 */
export function ExtraSlider({
  id,
  value,
  max,
  onChange,
  valueText,
}: {
  id: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
  /** Already translated, e.g. "€200 a month". */
  valueText: string;
}) {
  const at = `calc(13px + (100% - 26px) * ${Math.min(1, value / max)})`;
  return (
    <div className="relative flex h-7 items-center">
      <span aria-hidden className="clear-hatch absolute inset-x-0 h-2.5 rounded-full" />
      <span aria-hidden className="absolute left-0 h-2.5 rounded-full bg-clear-ember" style={{ width: at }} />
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={valueText}
        className="peer absolute inset-0 m-0 h-7 w-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute size-[26px] -translate-x-1/2 rounded-full border-4 border-clear-card bg-clear-primary shadow-clear-float peer-focus-visible:ring-3 peer-focus-visible:ring-clear-ember/50"
        style={{ left: at }}
      />
    </div>
  );
}

/** Line colours for the debts in a chart: the Clear pastels' inks, one per debt. */
const LINE_TONES = ["peach", "sky", "lilac", "mint", "butter", "rose", "stone"] as const;

/**
 * Each debt's chart colour, by id, so a debt keeps its colour whatever the list's sort:
 * the debts in id order take peach, sky, lilac … in turn.
 */
export function debtLineColours(ids: readonly number[]): Map<number, string> {
  return new Map([...ids].sort((a, z) => a - z).map((id, i) => [id, `var(--clr-${LINE_TONES[i % LINE_TONES.length]}-ink)`]));
}
