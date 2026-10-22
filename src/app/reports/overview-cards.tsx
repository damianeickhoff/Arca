import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  IconBulb,
  IconCalendar,
  IconCalendarStats,
  IconCoins,
  IconFileImport,
  IconPlus,
  IconShoppingBag,
  IconTarget,
} from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink, ClearTile } from "@/components/clear/card";
import { ListRow } from "@/components/clear/list-row";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { Icon } from "@/components/icon";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

// The cards of Insights · Overview (see analytics-tab.tsx for the data). Server
// components; the category breakdown and the summary are client-side
// (category-breakdown-card.tsx, summary-card.tsx).

/** Theme colours for series without a colour of their own (accounts, merchants). */
const SERIES_COLORS = [
  "var(--clr-ink)",
  "var(--clr-ember)",
  "var(--clr-info-fill)",
  "var(--clr-positive-fill)",
  "var(--clr-warning-fill)",
];

/** A change against the previous period, as a whole percentage. */
export interface Change {
  pct: number;
  up: boolean;
}

/** The change from `previous` to `current`; null when there is nothing to compare with. */
export function change(current: number, previous: number): Change | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return { pct: Math.abs(Math.round(pct)), up: pct >= 0 };
}

/* ── Key figures ──────────────────────────────────────────────────────────────── */

/**
 * One key figure: label and icon on top, the amount, and a foot line. `highlight` is
 * the one ember card of the row. Phones show a compact tile without the icon.
 */
function KpiCard({
  label,
  icon,
  iconClassName,
  value,
  foot,
  iconTile = false,
  highlight = false,
  muted = false,
}: {
  label: string;
  icon: React.ReactNode;
  /** Tints the round icon chip (e.g. mint for a positive balance). */
  iconClassName?: string;
  /** The icon is its own tile (a category icon), so it isn't put in a round chip. */
  iconTile?: boolean;
  value: React.ReactNode;
  foot?: React.ReactNode;
  highlight?: boolean;
  /** Greyed figure (nothing to show yet). */
  muted?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-[18px] p-3.5 font-clear lg:gap-3.5 lg:rounded-clear-card lg:p-[22px]",
        highlight ? "bg-clear-ember text-clear-ember-ink" : "bg-clear-card text-clear-ink",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-bold lg:text-[15px]">{label}</span>
        {iconTile ? (
          <span aria-hidden className="hidden shrink-0 lg:inline-flex">
            {icon}
          </span>
        ) : (
          <span
            aria-hidden
            className={cn(
              "hidden size-[38px] shrink-0 items-center justify-center rounded-full lg:inline-flex [&_svg]:size-[18px]",
              highlight ? "bg-white/35" : "bg-clear-tile",
              muted && "text-clear-muted",
              iconClassName,
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className={cn("min-w-0 truncate text-2xl leading-none lg:text-[40px]", muted && "text-clear-placeholder")}>{value}</div>
      {foot && <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-semibold lg:text-[13px]", !highlight && "text-clear-ink-2")}>{foot}</div>}
    </section>
  );
}

/* ── Week by week ─────────────────────────────────────────────────────────────── */

export interface FlowBucket {
  key: string;
  label: string;
  /** The dates it covers ("2 – 8 Oct"); null when the label says it all. */
  sub: string | null;
  income: number;
  spent: number;
  /** Bills still due in this stretch (from today on). */
  bills: number;
  current: boolean;
  future: boolean;
}

export type FlowGrain = "day" | "week" | "month" | "year";

export interface SafeToSpendHint {
  perDay: number;
  daysLeft: number;
  /** What is safe to spend for the rest of the budget period; negative when over. */
  amount: number;
}

/** Round chart steps: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

function axisLabel(v: number) {
  if (v === 0) return "0";
  return v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : `${Math.round(v)}`;
}

/**
 * Money in (ink) and spending (ember) per week of the period — per day, month or year
 * for shorter or longer periods — with the bills still due hatched in the weeks ahead,
 * and the budget's per-day amount underneath while the period is running.
 */
export async function FlowCard({
  buckets,
  grain,
  hint,
  className,
}: {
  buckets: FlowBucket[];
  grain: FlowGrain;
  hint: SafeToSpendHint | null;
  className?: string;
}) {
  const t = await getTranslations("insights.overview");
  const hasBills = buckets.some((b) => b.bills > 0);
  const empty = buckets.every((b) => b.income === 0 && b.spent === 0 && b.bills === 0);

  // The scale; bars and gridlines are placed in percent of the plot's height, and all
  // text is HTML at its real size, so nothing grows with the card's width.
  const steps = 4;
  const max = Math.max(1, ...buckets.flatMap((b) => [b.income, b.spent + b.bills]));
  const step = niceStep(max / steps);
  const scaleTop = step * steps;
  const pct = (v: number) => (v / scaleTop) * 100;
  // Values over the bars and the dates under the labels only where there's room.
  const showValues = buckets.length <= 6;
  const showSub = buckets.length <= 7;
  // About 150px at xl, so the row with the calendar stays low; it still grows to match.
  const plotHeight = "min-h-[120px] lg:min-h-[140px] xl:min-h-[150px]";
  // Two bars fill about 70% of a column, 4px apart.
  const bar = "min-h-[3px] w-[calc(35%-2px)] min-w-1.5";

  const description = t("flowLabel", {
    list: buckets
      .map((b) => {
        const parts = [`${t("incomeShort")} ${formatEurWhole(b.income)}`, `${t("spent")} ${formatEurWhole(b.spent)}`];
        if (b.bills > 0) parts.push(`${t("billsDue")} ${formatEurWhole(b.bills)}`);
        return `${b.label}${b.sub ? ` (${b.sub})` : ""}: ${parts.join(", ")}`;
      })
      .join("; "),
  });

  return (
    <ClearCard aria-labelledby="insights-flow-title" className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ClearCardHeader title={<span id="insights-flow-title">{t(`flow.${grain}.title`)}</span>} subtitle={t(`flow.${grain}.subtitle`)} />
        <span className="inline-flex flex-wrap gap-3.5 text-[13px] font-semibold text-clear-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-clear-ink" />
            {t("incomeShort")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-clear-ember" />
            {t("spent")}
          </span>
          {hasBills && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="clear-hatch size-2.5 rounded-[3px] ring-1 ring-inset ring-[var(--clr-hatch-stripe)]" />
              {t("billsDue")}
            </span>
          )}
        </span>
      </div>

      {empty ? (
        <p className="m-0 flex flex-1 items-center justify-center py-10 text-center text-sm text-clear-muted">{t("noActivity")}</p>
      ) : (
        // The plot grows with the card: beside a taller neighbour the bars get the room
        // instead of leaving a gap under the chart. Every column (the axis included)
        // shares one layout — a growing plot over the label lines — so they line up.
        <div role="img" aria-label={description} className="flex flex-1">
          {/* The y-axis, in the gutter left of the plot. */}
          <div aria-hidden className="flex w-10 shrink-0 flex-col pb-2">
            <div className={cn("relative mt-5 flex-1", plotHeight)}>
              {Array.from({ length: steps + 1 }, (_, i) => (
                <span
                  key={i}
                  className="money absolute right-2 -translate-y-1/2 text-xs leading-none text-clear-muted tabular-nums"
                  style={{ top: `${100 - pct(step * i)}%` }}
                >
                  {axisLabel(step * i)}
                </span>
              ))}
            </div>
            <BucketLabels label={" "} sub={showSub && buckets.some((b) => b.sub) ? " " : null} className="invisible" />
          </div>
          <div aria-hidden className="flex min-w-0 flex-1">
            <MoneyText>{buckets.map((b) => {
              const out = b.spent + b.bills;
              const both = b.income > 0 && out > 0;
              // Side by side, each value grows away from the other bar so they never overlap.
              const value = (align: "left" | "right" | "center", className: string, text: string) => (
                <span
                  className={cn(
                    "absolute bottom-full mb-1 hidden text-xs font-bold whitespace-nowrap tabular-nums lg:block",
                    align === "center" ? "left-1/2 -translate-x-1/2" : align === "right" ? "right-0" : "left-0",
                    className,
                  )}
                >
                  {text}
                </span>
              );
              return (
                <div key={b.key} className={cn("flex min-w-0 flex-1 flex-col items-center rounded-clear-tile pb-2", b.current && "bg-clear-tile")}>
                  <div className={cn("relative mt-5 w-full flex-1 border-b border-clear-line", plotHeight)}>
                    {Array.from({ length: steps }, (_, i) => (
                      <span
                        key={i}
                        className="absolute inset-x-0 border-t border-dashed border-clear-line"
                        style={{ top: `${100 - pct(step * (i + 1))}%` }}
                      />
                    ))}
                    {/* Positioned, so the bars' percentages resolve however the plot got its height. */}
                    <div className="absolute inset-0 flex items-end justify-center gap-1">
                      {b.income > 0 && (
                        <div className={cn(bar, "relative rounded-[6px] bg-clear-ink")} style={{ height: `${pct(b.income)}%` }}>
                          <MoneyText>{showValues && value(both ? "right" : "center", "text-clear-ink", formatEurWhole(b.income))}</MoneyText>
                        </div>
                      )}
                      {/* One bar for the money going out: spent, with the bills still due
                          hatched on top; a week ahead has only the hatched part. */}
                      {out > 0 && (
                        <div className={cn(bar, "relative flex flex-col")} style={{ height: `${pct(out)}%` }}>
                          {b.bills > 0 && (
                            <div
                              className={cn(
                                "clear-hatch min-h-[3px] shrink-0 ring-1 ring-inset ring-[var(--clr-hatch-stripe)]",
                                b.spent > 0 ? "rounded-t-[6px] rounded-b-[3px]" : "rounded-[6px]",
                              )}
                              style={{ height: `${(b.bills / out) * 100}%` }}
                            />
                          )}
                          {b.spent > 0 && <div className={cn("min-h-[3px] flex-1 bg-clear-ember", b.bills > 0 ? "rounded-t-[3px] rounded-b-[6px]" : "rounded-[6px]")} />}
                          {showValues && value(both ? "left" : "center", b.spent > 0 ? "text-clear-ink" : "text-clear-ember-text", formatEurWhole(out))}
                        </div>
                      )}
                    </div>
                  </div>
                  <BucketLabels label={b.label} sub={showSub ? b.sub : null} current={b.current} />
                </div>
              );
            })}</MoneyText>
          </div>
        </div>
      )}

      {hint && (
        <ClearTile className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <span className="inline-flex min-w-0 items-center gap-3 text-[15px] font-semibold">
            <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-clear-ember text-clear-ember-ink">
              <IconCalendar size={18} stroke={2} />
            </span>
            <span>
              <MoneyText>{hint.amount > 0
                ? t.rich("leftPerDay", {
                    amount: formatEurWhole(hint.perDay),
                    days: hint.daysLeft,
                    b: (chunks) => <b className="font-bold tabular-nums"><MoneyText>{chunks}</MoneyText></b>,
                  })
                : t("nothingLeft", { days: hint.daysLeft })}</MoneyText>
            </span>
          </span>
          <ClearCardLink href="/budget" className="tabular-nums">
            <MoneyText>{hint.amount >= 0 ? t("safeToSpend", { amount: formatEur(hint.amount) }) : t("overBudget", { amount: formatEur(-hint.amount) })}</MoneyText>
          </ClearCardLink>
        </ClearTile>
      )}
    </ClearCard>
  );
}

/** The label under a column, with its dates where there is room. */
function BucketLabels({ label, sub, current = false, className }: { label: string; sub: string | null; current?: boolean; className?: string }) {
  return (
    <>
      <span className={cn("mt-2 max-w-full truncate px-1 text-xs", current ? "font-bold text-clear-ink" : "text-clear-muted", className)}>{label}</span>
      {sub && <span className={cn("max-w-full truncate px-1 text-xs text-clear-muted max-sm:hidden", className)}>{sub}</span>}
    </>
  );
}

/* ── Top merchants, with spending by account ──────────────────────────────────── */

export interface MerchantRow {
  name: string;
  total: number;
  visits: number;
  icon: string | null;
  color: string | null;
}

export interface AccountRow {
  key: string;
  name: string | null;
  color: string | null;
  total: number;
}

/** Merchants every layout shows; the rest (up to MERCHANTS) only where the card spans two rows. */
export const MERCHANTS = 8;
const MERCHANTS_COMPACT = 5;
/** Accounts with a legend line of their own; the rest join "Other accounts". */
const ACCOUNT_LINES = 4;

/**
 * The biggest merchants of the period (icon, name, visits, amount) and, at the bottom
 * behind a hairline, spending split by account as a segmented bar with a legend.
 * From xl the card spans two rows beside the running total and Where it went, so it
 * lists up to eight merchants there and five elsewhere.
 */
export async function MerchantsCard({
  merchants,
  accounts,
  allHref,
  spendingTotal,
  className,
}: {
  merchants: MerchantRow[];
  accounts: AccountRow[];
  allHref: string;
  spendingTotal: number;
  className?: string;
}) {
  const t = await getTranslations("insights.overview");
  const note = (list: MerchantRow[]) => {
    const shown = list.reduce((s, m) => s + m.total, 0);
    return t("merchantsNote", { count: list.length, pct: spendingTotal > 0 ? Math.round((shown / spendingTotal) * 100) : 0 });
  };
  const compact = merchants.slice(0, MERCHANTS_COMPACT);
  const hasMore = merchants.length > compact.length;

  return (
    <ClearCard data-tip-anchor="insightsMerchants" aria-labelledby="insights-merchants-title" className={cn("gap-3.5", className)}>
      <ClearCardHeader
        title={<span id="insights-merchants-title">{t("topMerchants")}</span>}
        subtitle={
          merchants.length === 0 ? undefined : hasMore ? (
            <>
              <span className="xl:hidden">{note(compact)}</span>
              <span className="max-xl:hidden">{note(merchants)}</span>
            </>
          ) : (
            note(merchants)
          )
        }
      />
      {merchants.length === 0 ? (
        <p className="m-0 flex flex-1 items-center justify-center py-8 text-center text-sm text-clear-muted">{t("noMerchants")}</p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col p-0">
            {merchants.map((m, i) => (
              <li key={m.name} className={cn("border-b border-clear-ground last:border-b-0", i >= MERCHANTS_COMPACT && "max-xl:hidden", i === MERCHANTS_COMPACT - 1 && "max-xl:border-b-0")}>
                <ListRow
                  className="min-h-[60px] border-b-0 px-0"
                  icon={<Icon iconKey={m.icon} color={m.color ?? SERIES_COLORS[i % SERIES_COLORS.length]} initials={m.name.slice(0, 2).toUpperCase()} size="md" soft />}
                  title={<span className="font-semibold">{m.name}</span>}
                  meta={t("visits", { count: m.visits })}
                  trailing={
                    <span className="shrink-0 text-[15px] font-bold tabular-nums">
                      <MoneyText>{formatEurWhole(m.total)}</MoneyText>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
          <ClearCardLink href={allHref} className="self-start">
            {t("allMerchants")}
          </ClearCardLink>
        </>
      )}
      {accounts.length > 0 && <AccountsLegend accounts={accounts} />}
    </ClearCard>
  );
}

/** Spending by account at the foot of the merchants card: a segmented bar and a legend
 *  line per account. Whole transactions, since an account isn't split-aware. */
async function AccountsLegend({ accounts }: { accounts: AccountRow[] }) {
  const t = await getTranslations("insights.overview");
  const total = accounts.reduce((s, a) => s + a.total, 0);
  if (total <= 0) return null;
  const share = (v: number) => Math.round((v / total) * 100);
  const shown = accounts.slice(0, ACCOUNT_LINES);
  const rest = accounts.slice(ACCOUNT_LINES).reduce((s, a) => s + a.total, 0);
  const segments = [
    ...shown.map((a, i) => ({ key: a.key, name: a.name ?? t("unknownAccount"), value: a.total, color: a.color ?? SERIES_COLORS[i % SERIES_COLORS.length] })),
    ...(rest > 0 ? [{ key: "rest", name: t("otherAccounts"), value: rest, color: "var(--clr-placeholder)" }] : []),
  ];

  return (
    <div className="mt-auto flex flex-col gap-2.5 border-t border-clear-line pt-4">
      <h3 className="m-0 text-[13px] font-semibold text-clear-ink-2">{t("byAccount")}</h3>
      <div
        role="img"
        aria-label={segments.map((s) => `${s.name} ${share(s.value)}%`).join(", ")}
        className="flex h-2.5 gap-[3px] overflow-hidden rounded-full"
      >
        {segments.map((s) => (
          <span key={s.key} className="min-w-1 rounded-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
        {segments.map((s) => (
          <li key={s.key} className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
            <span className="shrink-0 font-bold tabular-nums">
              <MoneyText>{formatEurWhole(s.value)}</MoneyText>
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-clear-muted">{t("transfersLeftOut")}</p>
    </div>
  );
}

/* ── Calendar ─────────────────────────────────────────────────────────────────── */

export interface CalendarDay {
  date: string;
  day: number;
  spent: number;
  today: boolean;
  future: boolean;
}

/** Ember at increasing strength over the card colour, by spend against the daily average. */
const HEAT = [
  "var(--clr-tile)",
  "color-mix(in srgb, var(--clr-ember) 18%, var(--clr-card))",
  "color-mix(in srgb, var(--clr-ember) 36%, var(--clr-card))",
  "color-mix(in srgb, var(--clr-ember) 62%, var(--clr-card))",
  "var(--clr-ember)",
];
/** A day still to come: an empty cell with a dashed outline. */
const STILL_TO_COME = "border-[1.5px] border-dashed border-clear-line bg-clear-card";
/** Longer periods switch to a compact grid: weeks as columns, weekdays as rows. */
const FULL_CALENDAR_DAYS = 42;

function heatLevel(spent: number, average: number) {
  if (spent <= 0) return 0;
  if (average <= 0) return 4;
  if (spent < average * 0.5) return 1;
  if (spent < average) return 2;
  if (spent < average * 2) return 3;
  return 4;
}

export async function CalendarCard({
  days,
  avgPerDay,
  prevAvgPerDay,
  previousMonth,
  popularDay,
  popularDayAvg,
  className,
}: {
  days: CalendarDay[];
  avgPerDay: number;
  /** Last period's spending per day; null when it had none. */
  prevAvgPerDay: number | null;
  /** The previous period's month name, or "none" ("last period"). */
  previousMonth: string;
  popularDay: string | null;
  /** What that weekday saw spent on average. */
  popularDayAvg: number | null;
  className?: string;
}) {
  const t = await getTranslations("insights.overview");
  const locale = await getLocale();
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  // 2024-01-01 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(2024, 0, 1 + i)));
  const lead = days.length > 0 ? (new Date(`${days[0].date}T00:00:00`).getDay() + 6) % 7 : 0;
  const compact = days.length > FULL_CALENDAR_DAYS;
  const weeks = Math.ceil((lead + days.length) / 7);
  const hasFuture = days.some((d) => d.future);

  const cellTitle = (d: CalendarDay) =>
    `${dayFmt.format(new Date(`${d.date}T00:00:00`))} · ${d.future ? t("stillToCome") : formatEur(d.spent)}`;
  const cellStyle = (d: CalendarDay): React.CSSProperties | undefined => (d.future ? undefined : { background: HEAT[heatLevel(d.spent, avgPerDay)] });

  // Half the page wide beside Week by week: the heatmap, then the two compact tiles in a
  // row at the bottom, so both cards end on the same line when the row stretches them.
  return (
    <ClearCard aria-labelledby="insights-calendar-title" className={cn("gap-3.5", className)}>
      <div className="flex min-w-0 flex-col gap-3.5">
        <ClearCardHeader
          title={<span id="insights-calendar-title">{t("calendar")}</span>}
          subtitle={t("calendarHint")}
          action={
            <span aria-hidden className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-medium text-clear-muted">
              <span className="inline-flex items-center gap-1">
                {t("heatLess")}
                {HEAT.map((bg) => (
                  <span key={bg} className="size-3 rounded-[4px]" style={{ background: bg }} />
                ))}
                {t("heatMore")}
              </span>
              {hasFuture && (
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("size-3 rounded-[4px]", STILL_TO_COME)} />
                  {t("stillToCome")}
                </span>
              )}
            </span>
          }
        />
        {compact ? (
          <div
            role="img"
            aria-label={t("calendarLabel")}
            className="grid grid-flow-col grid-rows-7 gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: lead }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {days.map((d) => (
              <span
                key={d.date}
                title={cellTitle(d)}
                className={cn("aspect-square rounded-[3px]", d.future && STILL_TO_COME, d.today && "ring-2 ring-inset ring-clear-ink")}
                style={cellStyle(d)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div aria-hidden className="grid grid-cols-7 gap-[5px] text-center text-xs font-medium text-clear-muted">
              {weekdays.map((w, i) => (
                <span key={i} className="truncate">
                  {w}
                </span>
              ))}
            </div>
            <div role="img" aria-label={t("calendarLabel")} className="grid grid-cols-7 gap-[5px]">
              {Array.from({ length: lead }).map((_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {days.map((d) => {
                const level = d.future ? 0 : heatLevel(d.spent, avgPerDay);
                return (
                  <span
                    key={d.date}
                    title={cellTitle(d)}
                    className={cn(
                      // About 1.6:1 at half the page wide, never taller than 44px.
                      "flex aspect-[8/5] max-h-11 items-center justify-center rounded-[10px] text-xs font-semibold tabular-nums",
                      d.future ? cn(STILL_TO_COME, "text-clear-muted") : level === 4 ? "text-clear-ember-ink" : "text-clear-ink",
                      d.today && "font-bold ring-2 ring-inset ring-clear-ink",
                    )}
                    style={cellStyle(d)}
                  >
                    {d.day}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {/* Two compact tiles, label and value on one line; the comparison is read out to
          screen readers only, so the row stays low. */}
      <div className="mt-auto grid grid-cols-2 gap-2.5">
        <ClearTile className="flex min-w-0 items-baseline justify-between gap-2 px-3.5 py-2.5">
          <span className="truncate text-[13px] text-clear-ink-2">{t("avgExpense")}</span>
          <Amount value={avgPerDay} whole className="shrink-0 text-base font-bold! tabular-nums" />
          {prevAvgPerDay != null && (
            <span className="sr-only">
              <MoneyText>{t("calendarPrev", { amount: formatEurWhole(prevAvgPerDay), period: previousMonth })}</MoneyText>
            </span>
          )}
        </ClearTile>
        <ClearTile className="flex min-w-0 items-baseline justify-between gap-2 px-3.5 py-2.5">
          <span className="truncate text-[13px] text-clear-ink-2">{t("popularDay")}</span>
          <span className="min-w-0 truncate text-base font-bold first-letter:uppercase">{popularDay ?? "—"}</span>
          {popularDayAvg != null && (
            <span className="sr-only">
              <MoneyText>{t("popularAvg", { amount: formatEurWhole(popularDayAvg) })}</MoneyText>
            </span>
          )}
        </ClearTile>
      </div>
    </ClearCard>
  );
}

/* ── Before any transactions ──────────────────────────────────────────────────── */

/** Overview before anything is imported: the figures at zero, one card with the way in,
 *  and dashed placeholders where the category and merchant cards will appear. */
export async function EmptyOverview() {
  const t = await getTranslations("insights.overview");
  const icons = [<IconCoins key="in" />, <IconShoppingBag key="out" />, <IconTarget key="saved" />, <IconCalendarStats key="avg" />];
  const labels = [t("income"), t("expenses"), t("saved"), t("avgPerDay")];
  const notes = [t("empty.noTransactions"), t("empty.noTransactions"), t("empty.savedLater"), t("empty.avgLater")];

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <div className="grid grid-cols-2 gap-2.5 lg:col-span-2 lg:gap-5 xl:col-span-3 xl:grid-cols-4">
        {labels.map((label, i) => (
          <KpiCard
            key={label}
            label={label}
            icon={icons[i]}
            muted
            value={i < 2 ? <Amount value={0} className="tabular-nums" /> : <span className="clear-amount">—</span>}
            foot={<span className="text-clear-muted">{notes[i]}</span>}
          />
        ))}
      </div>

      <ClearCard aria-labelledby="insights-empty-title" className="items-center justify-center gap-6 px-5 py-9 text-center lg:col-span-2 lg:px-8 lg:py-12">
        <EmptyIllustration />
        <div className="flex flex-col items-center gap-2.5">
          <h2 id="insights-empty-title" className="m-0 text-[22px] font-extrabold tracking-[-0.02em] lg:text-2xl">
            {t("empty.title")}
          </h2>
          <p className="m-0 max-w-[500px] text-[15px] leading-normal text-clear-ink-2 lg:text-base">{t("empty.body")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Link href="/settings?panel=import" className={clearButtonVariants({ size: "lg" })}>
            <IconFileImport aria-hidden />
            {t("empty.import")}
          </Link>
          <Link href="/transactions/add" className={clearButtonVariants({ variant: "secondary", size: "lg" })}>
            <IconPlus aria-hidden />
            {t("empty.add")}
          </Link>
        </div>
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-clear-muted">
          <IconBulb size={18} stroke={1.9} aria-hidden className="shrink-0" />
          {t("empty.tip")}
        </span>
      </ClearCard>

      <div className="flex flex-col gap-5 lg:col-span-2 xl:col-span-1">
        <Placeholder title={t("empty.categoriesTitle")} body={t("empty.categoriesBody")}>
          <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
            <circle cx="48" cy="48" r="36" stroke="var(--clr-line)" strokeWidth="14" />
            <circle cx="48" cy="48" r="36" stroke="var(--clr-placeholder)" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="5 4" />
          </svg>
        </Placeholder>
        <Placeholder title={t("empty.merchantsTitle")} body={t("empty.merchantsBody")}>
          <svg width="200" height="64" viewBox="0 0 200 64" fill="none" aria-hidden>
            {[0, 22, 44].map((yy, i) => (
              <g key={yy}>
                <rect x="4" y={yy + 2} width="18" height="18" rx="6" stroke="var(--clr-line)" strokeWidth="2" />
                <rect x="32" y={yy + 8} width={[96, 76, 60][i]} height="6" rx="3" fill="var(--clr-line)" />
                <rect x={[160, 166, 170][i]} y={yy + 8} width={[36, 30, 26][i]} height="6" rx="3" fill="var(--clr-line)" />
              </g>
            ))}
          </svg>
        </Placeholder>
      </div>
    </div>
  );
}

function Placeholder({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-4 rounded-clear-card border-2 border-dashed border-clear-line p-6 text-center font-clear">
      {children}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[15px] font-bold text-clear-ink-2">{title}</span>
        <span className="text-[13px] text-clear-muted">{body}</span>
      </div>
    </div>
  );
}

/** Bars still to be filled in: one solid, three dashed, on a lilac disc. */
function EmptyIllustration() {
  return (
    <svg width="260" height="200" viewBox="0 0 260 200" fill="none" aria-hidden className="max-w-full">
      <circle cx="130" cy="104" r="86" fill="var(--clr-lilac)" />
      <rect x="30" y="34" width="50" height="44" rx="10" fill="var(--clr-butter)" stroke="var(--clr-ink)" strokeWidth="2.5" />
      <circle cx="44" cy="61" r="2.5" fill="var(--clr-ink)" />
      <circle cx="55" cy="61" r="2.5" fill="var(--clr-ink)" />
      <circle cx="66" cy="61" r="2.5" fill="var(--clr-line)" />
      <circle cx="44" cy="70" r="2.5" fill="var(--clr-line)" />
      <circle cx="55" cy="70" r="2.5" fill="var(--clr-line)" />
      <rect x="70" y="112" width="24" height="58" rx="6" fill="var(--clr-ember)" stroke="var(--clr-ink)" strokeWidth="2.5" />
      <rect x="104" y="92" width="24" height="78" rx="6" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2.2" strokeDasharray="5 4" />
      <rect x="138" y="104" width="24" height="66" rx="6" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2.2" strokeDasharray="5 4" />
      <rect x="172" y="78" width="24" height="92" rx="6" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2.2" strokeDasharray="5 4" />
      <circle cx="82" cy="98" r="5" fill="var(--clr-card)" stroke="var(--clr-info-fill)" strokeWidth="2.5" />
      <circle cx="184" cy="62" r="5" fill="var(--clr-card)" stroke="var(--clr-info-fill)" strokeWidth="2.5" />
      <circle cx="222" cy="44" r="6" fill="var(--clr-ember)" />
      <circle cx="228" cy="140" r="5" fill="var(--clr-mint)" stroke="var(--clr-ink)" strokeWidth="2" />
    </svg>
  );
}
