"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { formatEur } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import { chargeRunStarts } from "@/lib/recurring-charge-runs";
import { cn } from "@/lib/utils";
import type { TransactionDetail } from "@/app/transactions/transaction-types";
import type { TipAnchor } from "@/lib/tip-placement";
import { MoneyText, SvgMoneyText } from "@/components/clear/money";

/** A transaction linked to a recurring item: the full TransactionDetail shape (so a
 *  row can open the transaction sheet) plus the account fields the lists show. */
export type LinkedTx = TransactionDetail & {
  account: string | null;
  bankName: string | null;
};

/** The transactions linked to one recurring item, newest first; null while loading. */
export function useLinkedTransactions(itemId: number | null) {
  const [loaded, setLoaded] = useState<{ id: number; rows: LinkedTx[] } | null>(null);
  useEffect(() => {
    if (itemId == null) return;
    let cancelled = false;
    fetch(`/api/recurring/transactions?itemId=${itemId}`)
      .then((r) => r.json())
      .then((rows: LinkedTx[]) => { if (!cancelled) setLoaded({ id: itemId, rows: Array.isArray(rows) ? rows : [] }); })
      .catch(() => { if (!cancelled) setLoaded({ id: itemId, rows: [] }); });
    return () => { cancelled = true; };
  }, [itemId]);
  return loaded && loaded.id === itemId ? loaded.rows : null;
}

/** All the chart needs of a charge — linked transactions and preview matches alike. */
export type Charge = Pick<LinkedTx, "date" | "amount" | "correctedAmount">;

const chargeOf = (t: Charge) => Math.abs(t.correctedAmount ?? t.amount);

/** What an unsaved recurring item would match: its pattern (plus any extra names it goes
 *  by) and amount rule. */
export interface MatchCriteria {
  pattern: string;
  alts: string[];
  wholeWord: boolean;
  amount: number | null;
  min: number | null;
  max: number | null;
}

/** The preview's answer: how many past transactions match, and the latest charges. */
export interface MatchPreview {
  total: number;
  rows: Charge[];
}

/**
 * The past transactions `criteria` would match, from /api/recurring/preview — for the
 * editor's chart while the item is not saved yet (or its rule is being changed).
 * Debounced while typing; null while there is nothing to ask or the first answer is
 * pending. The previous answer stays up while a new one loads so the chart doesn't blink.
 */
export function useMatchPreview(criteria: MatchCriteria | null) {
  const pattern = criteria?.pattern.trim() ?? "";
  const alts = (criteria?.alts ?? []).map((a) => a.trim()).filter(Boolean);
  const query = criteria && (pattern || alts.length > 0)
    ? new URLSearchParams([
        ["pattern", pattern],
        ...alts.map((a) => ["alt", a]),
        ["wholeWord", criteria.wholeWord ? "1" : "0"],
        ...(criteria.amount != null ? [["amount", String(criteria.amount)]] : []),
        ...(criteria.min != null ? [["min", String(criteria.min)]] : []),
        ...(criteria.max != null ? [["max", String(criteria.max)]] : []),
      ]).toString()
    : null;
  const [loaded, setLoaded] = useState<{ query: string; preview: MatchPreview } | null>(null);
  useEffect(() => {
    if (query == null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/recurring/preview?${query}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: MatchPreview | null) => {
          if (!cancelled) setLoaded({ query, preview: d && Array.isArray(d.rows) ? d : { total: 0, rows: [] } });
        })
        .catch(() => { /* keep the last answer */ });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  if (query == null || !loaded) return null;
  return loaded.preview;
}

/**
 * "Last 12 charges" (Popup-Recurring): the latest charges (`txs`, newest first) as bars,
 * oldest left, with the total and average.
 *
 * - Breaks: a silence clearly longer than the rhythm (`frequency`, else the median
 *   interval; the rule is in lib/recurring-charge-runs) splits the charges into runs —
 *   a cancelled and restarted subscription. Each break is a dashed line between the two
 *   bars around it, and the bars before the latest run are dimmed.
 * - Price change: the most recent change inside the latest run (a restart at another
 *   price is not one) is called out — "went up {amount} in {month}", from → to, the bars
 *   since then in ember, the latest in ink and the new price centred above the change bar.
 * - Years: when the charges span more than one calendar year, the first bar and every bar
 *   where the year changes get a month label with the year on a second line.
 * - `income`: the payments come in (a salary), so a rise is good news — green, and
 *   worded as income instead of a price.
 */
export function RecurringCharges({
  txs,
  tipAnchor = "recurringCharges",
  income = false,
  frequency,
}: {
  txs: Charge[];
  tipAnchor?: TipAnchor;
  income?: boolean;
  /** The item's schedule (daily, weekly, four_weekly, monthly, quarterly, yearly). */
  frequency?: string;
}) {
  const t = useTranslations("recurringDetail.charges");
  const locale = useLocale();
  const charges = txs
    .filter((x) => isValidISODate(x.date))
    .slice(0, 12)
    .reverse()
    .map((x) => ({ date: x.date, value: chargeOf(x) }));
  if (charges.length < 2) return null;

  const runStarts = chargeRunStarts(charges.map((c) => c.date), frequency);
  const breaks = runStarts.slice(1);
  const runStart = runStarts[runStarts.length - 1];

  const cents = charges.map((c) => Math.round(c.value * 100));
  const latest = cents[cents.length - 1];
  // The most recent change inside the latest run: walk back while the price is the current one.
  let since = cents.length - 1;
  while (since > runStart && cents[since - 1] === latest) since--;
  const change = since > runStart ? { from: charges[since - 1].value, to: charges[since].value, date: charges[since].date, index: since } : null;

  const total = charges.reduce((s, c) => s + c.value, 0);
  const avg = total / charges.length;
  const monthly = new Set(charges.map((c) => c.date.slice(0, 7))).size === charges.length;
  const yearOf = (i: number) => charges[i].date.slice(0, 4);
  const multiYear = yearOf(0) !== yearOf(charges.length - 1);
  // The bars that carry the year under their month: the first and each new year.
  const yearAt = (i: number) => multiYear && (i === 0 || yearOf(i) !== yearOf(i - 1));
  const asDate = (d: string) => new Date(`${d}T12:00:00`);
  const format = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, opts).format(asDate(d));
  const labelOpts: Intl.DateTimeFormatOptions = monthly ? { month: "short" } : { day: "numeric", month: "short" };
  const label = (d: string) => format(d, labelOpts);
  const spokenLabel = (d: string) => format(d, multiYear ? { ...labelOpts, year: "numeric" } : labelOpts);
  const changeMonth = change
    ? format(change.date, change.date.slice(0, 4) === String(new Date().getFullYear()) ? { month: "long" } : { month: "long", year: "numeric" })
    : "";

  const w = 480;
  const base = 88;
  const top = 24;
  const labelY = 106;
  const yearY = labelY + 15;
  const height = multiYear ? 126 : 112;
  const max = Math.max(...charges.map((c) => c.value), 0.01);
  const min = Math.min(...charges.map((c) => c.value));
  // Zoom in on the range when the charges barely differ, so a price step is visible.
  const lo = min === max ? 0 : Math.max(0, min - (max - min) * 1.5);
  const slot = w / charges.length;
  const bw = Math.min(22, slot * 0.55);
  const h = (v: number) => Math.max(6, ((v - lo) / (max - lo || 1)) * (base - top));
  const up = change ? change.to > change.from : false;
  // Paying more is the warning; earning more is the good news.
  const good = up === income;
  const changedFill = good ? "var(--clr-positive-fill)" : "var(--clr-ember)";
  // Labels for every bar when they fit (monthly), else only the ends, the change, the
  // restart and the bars that carry a year.
  const showLabel = (i: number) =>
    monthly || i === 0 || i === charges.length - 1 || i === change?.index || (breaks.length > 0 && i === runStart) || yearAt(i);

  // The new price, centred over its bar but kept inside the chart at either end
  // (its width estimated from 12px bold digits).
  const priceText = change ? formatEur(change.to) : "";
  const priceHalf = (priceText.length * 7.2) / 2 + 2;
  const priceX = change ? Math.min(w - priceHalf, Math.max(priceHalf, change.index * slot + slot / 2)) : 0;

  const spoken = charges
    .map((c, i) => {
      const item = `${spokenLabel(c.date)} ${formatEur(c.value)}`;
      return breaks.includes(i) ? t("ariaRestart", { item }) : item;
    })
    .join(", ");

  return (
    <div data-tip-anchor={tipAnchor} className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile px-4 py-4 sm:px-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold">{t(income ? "incomeTitle" : "title", { count: charges.length })}</span>
        <span className="text-[13px] font-semibold text-clear-ink-2">
          <MoneyText>{t.rich("summary", {
            total: formatEur(total),
            avg: formatEur(avg),
            b: (chunks) => <b className="font-extrabold tabular-nums text-clear-ink"><MoneyText>{chunks}</MoneyText></b>,
          })}</MoneyText>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} role="img" aria-label={t(income ? "incomeAria" : "aria", { list: spoken })} className="block h-auto w-full">
        <line x1={0} y1={base} x2={w} y2={base} stroke="var(--clr-line)" />
        {breaks.map((i) => (
          <line key={`break-${i}`} x1={i * slot} y1={top - 12} x2={i * slot} y2={base} stroke="var(--clr-placeholder)" strokeWidth={1.5} strokeDasharray="4 4" />
        ))}
        {charges.map((c, i) => {
          const x = i * slot + (slot - bw) / 2;
          const hh = h(c.value);
          const isLast = i === charges.length - 1;
          const fill = isLast ? "var(--clr-ink)" : change && i >= change.index ? changedFill : "var(--clr-placeholder)";
          // Earlier runs are always dimmed; without a change every bar but the latest is.
          const dim = i < runStart || (!change && !isLast);
          const strong = isLast || i === change?.index;
          return (
            <g key={`${c.date}-${i}`}>
              <rect x={x} y={base - hh} width={bw} height={hh} rx={6} fill={fill} fillOpacity={dim ? 0.45 : 1} />
              {showLabel(i) && (
                <text
                  x={x + bw / 2}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={strong ? 700 : 400}
                  fill={strong ? "var(--clr-ink)" : "var(--clr-muted)"}
                >
                  {label(c.date)}
                </text>
              )}
              {yearAt(i) && (
                <text x={x + bw / 2} y={yearY} textAnchor="middle" fontSize={12} fill="var(--clr-muted)">
                  {yearOf(i)}
                </text>
              )}
            </g>
          );
        })}
        {change && (
          <text x={priceX} y={Math.max(14, base - h(change.to) - 8)} textAnchor="middle" fontSize={12} fontWeight={700} fill={good ? "var(--clr-positive)" : "var(--clr-ember-text)"}>
            <SvgMoneyText>{priceText}</SvgMoneyText>
          </text>
        )}
      </svg>
      {change && (
        <div className={cn("flex flex-wrap items-center gap-2.5 rounded-clear-icon px-3 py-2.5", good ? "bg-clear-mint" : "bg-clear-peach")}>
          <span aria-hidden className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-clear-card", good ? "text-clear-positive" : "text-clear-ember-text")}>
            {up ? <IconTrendingUp size={16} stroke={2.2} /> : <IconTrendingDown size={16} stroke={2.2} />}
          </span>
          <span className="text-sm font-bold">
            <MoneyText>{t(income ? (up ? "incomeUp" : "incomeDown") : up ? "priceUp" : "priceDown", { amount: formatEur(Math.abs(change.to - change.from)), month: changeMonth })}</MoneyText>
          </span>
          <span className="ml-auto text-[13px] font-semibold tabular-nums text-clear-ink-2">
            <MoneyText>{formatEur(change.from)}</MoneyText> → <MoneyText>{formatEur(change.to)}</MoneyText>
          </span>
        </div>
      )}
    </div>
  );
}
