import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { IconCalendar, IconCoins, IconInbox, IconShoppingBag, IconTarget } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink, ClearTile } from "@/components/clear/card";
import { ListRow } from "@/components/clear/list-row";
import { StatTile } from "@/components/clear/stat-tile";
import { Icon } from "@/components/icon";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";
import type { OverdraftMode } from "@/lib/app-settings";

/* ── Needs a category ─────────────────────────────────────────────────────────── */

/** The "N need a category · Review" pill: in the heading row on desktop, a strip on phones. */
export async function ReviewLink({ count }: { count: number }) {
  if (count === 0) return null;
  const t = await getTranslations("home");
  return (
    <Link
      href="/transactions/needs-review"
      className="flex h-14 w-full items-center gap-3 rounded-clear-tile bg-clear-peach pl-4 pr-2 font-clear text-sm font-bold text-clear-ink no-underline lg:h-11 lg:w-auto lg:rounded-full"
    >
      <IconInbox size={20} stroke={2} className="text-clear-ember-text lg:hidden" aria-hidden />
      <span className="flex-1">{t("needsReview", { count })}</span>
      <span className="inline-flex h-10 items-center rounded-full bg-clear-primary px-4 text-[13px] text-clear-primary-ink lg:h-[30px] lg:px-3">
        {t("review")}
      </span>
    </Link>
  );
}

/* ── This month ───────────────────────────────────────────────────────────────── */

export interface MonthFigures {
  income: number;
  /** Income change against the previous financial month, as a fraction; null without history. */
  incomeChange: number | null;
  spent: number;
  /** The part of `spent` that went to recurring bills. */
  fixed: number;
  saved: number;
  billsDue: number;
  billsDueCount: number;
  /** When the bills still due are paid by, formatted ("24 Oct"). */
  billsBy: string;
}

export async function ThisMonthCard({ figures }: { figures: MonthFigures }) {
  const t = await getTranslations("home.month");
  const { income, incomeChange, spent, fixed, saved, billsDue, billsDueCount, billsBy } = figures;
  // Saved is net: a month that took more out of savings than it put in says so instead.
  const tookFromSavings = saved < 0;
  const savedShare = income > 0 && !tookFromSavings ? Math.round((saved / income) * 100) : null;

  return (
    <section aria-label={t("title")} data-tip-anchor="homeThisMonth" className="grid grid-cols-2 gap-2.5 rounded-clear-card bg-clear-card p-3.5 font-clear text-clear-ink">
      <StatTile
        highlight
        label={t("income")}
        icon={<IconCoins aria-hidden />}
        value={<Amount value={income} whole className="text-[26px] lg:text-[30px]" />}
        foot={
          incomeChange != null && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-white/45 px-2 font-extrabold">
                {incomeChange >= 0 ? "↑" : "↓"} {Math.abs(Math.round(incomeChange * 100))}%
              </span>
              {t("vsLastMonth")}
            </span>
          )
        }
      />
      <StatTile
        label={t("spent")}
        icon={<IconShoppingBag aria-hidden />}
        value={<Amount value={spent} whole className="text-[26px] lg:text-[30px]" />}
        foot={fixed > 0 ? <MoneyText>{t("fixed", { amount: formatEurWhole(fixed) })}</MoneyText> : null}
      />
      <StatTile
        label={tookFromSavings ? t("takenFromSavings") : t("saved")}
        icon={<IconTarget aria-hidden />}
        value={<Amount value={Math.abs(saved)} whole className="text-[26px] lg:text-[30px]" />}
        foot={
          savedShare != null && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-clear-mint px-2 font-extrabold text-clear-mint-ink">{savedShare}%</span>
              {t("ofIncome")}
            </span>
          )
        }
      />
      <StatTile
        label={t("billsDue")}
        icon={<IconCalendar aria-hidden />}
        value={<Amount value={billsDue} whole className="text-[26px] lg:text-[30px]" />}
        foot={billsDueCount > 0 ? t("billsBefore", { count: billsDueCount, date: billsBy }) : t("noBills")}
      />
    </section>
  );
}

/* ── Income vs spending ───────────────────────────────────────────────────────── */

export interface MonthBar {
  /** YYYY-MM of the financial month (the month it starts in). */
  month: string;
  /** The month's last day; months are named after the month they end in, like the budget. */
  endsOn: string;
  income: number;
  expense: number;
}

/** Six budget months of money in (ink bars) against money out (hatched ember; the month in progress solid). */
export async function IncomeSpendingCard({ months }: { months: MonthBar[] }) {
  const t = await getTranslations("home.chart");
  const locale = await getLocale();
  const monthLabel = (m: MonthBar) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${m.endsOn}T12:00:00`));

  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  // Round the scale up to a whole thousand so the gridlines land on round numbers.
  const top = Math.ceil(max / 1000) * 1000;
  const H = 125;
  const base = 145;
  const y = (v: number) => base - (v / top) * H;
  const groupW = 360 / Math.max(1, months.length);
  const barW = Math.min(20, groupW / 2 - 6);
  const current = months.length - 1;
  const description = t("description", {
    months: months.map((m) => `${monthLabel(m)}: ${formatEurWhole(m.income)} / ${formatEurWhole(m.expense)}`).join("; "),
  });

  return (
    <ClearCard aria-labelledby="home-chart-title">
      <ClearCardHeader title={<span id="home-chart-title">{t("title")}</span>} subtitle={t("subtitle")} />
      <ClearTile className="flex items-center justify-between gap-3 px-3.5 py-3">
        <span className="text-sm font-bold">{t("legendTitle")}</span>
        <span className="flex gap-3.5 text-[13px] font-semibold text-clear-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-clear-ink" />
            {t("in")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="clear-hatch size-2.5 rounded-[3px]" />
            {t("out")}
          </span>
        </span>
      </ClearTile>
      {months.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <svg viewBox="0 0 400 170" className="block h-auto w-full" role="img" aria-label={description}>
          <defs>
            <pattern id="home-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--clr-hatch-stripe)" />
              <rect width="3" height="6" fill="var(--clr-ember)" />
            </pattern>
          </defs>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1="36" x2="396" y1={y(top * f)} y2={y(top * f)} stroke="var(--clr-line)" strokeDasharray={f === 0 ? undefined : "3 4"} />
              <text x="28" y={y(top * f) + 4} textAnchor="end" fontSize="11" fill="var(--clr-muted)" className="money">
                {f === 0 ? "0" : `${Math.round((top * f) / 1000)}k`}
              </text>
            </g>
          ))}
          {months.map((m, i) => {
            const x = 36 + i * groupW + groupW / 2;
            return (
              <g key={m.month}>
                <rect x={x - barW - 2} y={y(m.income)} width={barW} height={base - y(m.income)} rx="6" fill="var(--clr-ink)" />
                <rect
                  x={x + 2}
                  y={y(m.expense)}
                  width={barW}
                  height={base - y(m.expense)}
                  rx="6"
                  fill={i === current ? "var(--clr-ember)" : "url(#home-hatch)"}
                />
                <text
                  x={x}
                  y="164"
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight={i === current ? 700 : 400}
                  fill={i === current ? "var(--clr-ink)" : "var(--clr-muted)"}
                >
                  {monthLabel(m)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </ClearCard>
  );
}

/** In a two-column tile grid, the last tile of an odd count spans the full row, so
 *  the grid is always filled (Accounts). */
function spansRow(index: number, count: number) {
  return count % 2 === 1 && index === count - 1;
}

/* ── Coming up ────────────────────────────────────────────────────────────────── */

export interface ComingUpBill {
  id: number;
  name: string;
  amount: number;
  dueDate: string;
  overdue: boolean;
  isIncome: boolean;
  /** The bill's brand or category icon, as lib/bill-status.ts resolves it. */
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
}

/** The next bills still to pay (and income still to come) as a list, soonest first. */
export async function ComingUpCard({ bills, totalDue, today }: { bills: ComingUpBill[]; totalDue: number; today: string }) {
  const t = await getTranslations("home.comingUp");
  const locale = await getLocale();

  function when(b: ComingUpBill) {
    if (b.overdue) return t("overdue");
    const days = Math.round((new Date(`${b.dueDate}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
    const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${b.dueDate}T12:00:00`));
    return t("inDays", { count: days, date });
  }

  return (
    <ClearCard aria-labelledby="home-coming-up-title">
      <ClearCardHeader
        title={<span id="home-coming-up-title">{t("title")}</span>}
        action={<ClearCardLink href="/transactions/upcoming"><MoneyText>{totalDue > 0 ? t("due", { amount: formatEur(totalDue) }) : t("all")}</MoneyText></ClearCardLink>}
      />
      {bills.length === 0 ? (
        <p className="m-0 text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {bills.map((b, i) => (
            <li key={`${b.id}-${b.dueDate}`} className="border-b border-clear-ground last:border-b-0">
              <ListRow
                className="min-h-14 border-b-0 px-0"
                icon={<Icon iconKey={b.icon} color={b.iconColor} background={b.iconBackground} size="md" soft />}
                title={b.name}
                meta={<span className={cn("font-bold", b.overdue || i === 0 ? "text-clear-ember-text" : "text-clear-ink-2")}>{when(b)}</span>}
                trailing={
                  <Amount
                    value={b.amount}
                    sign={b.isIncome ? "always" : "none"}
                    className={cn("text-[15px]", b.isIncome && "text-clear-positive")}
                    splitCents={false}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
    </ClearCard>
  );
}

/* ── Accounts ─────────────────────────────────────────────────────────────────── */

export interface AccountTile {
  key: string;
  name: string;
  /** The last digits of the account number, when known. */
  suffix: string | null;
  balance: number;
  /** How far below zero the account may go, as a positive amount; 0 = no overdraft. */
  overdraftLimit: number;
}


/** The bank accounts as small tiles, under Coming up. */
export async function AccountsCard({ accounts, total, overdraftMode }: { accounts: AccountTile[]; total: number; overdraftMode: OverdraftMode }) {
  const t = await getTranslations("home.accounts");
  if (accounts.length === 0) return null;

  // With an overdraft: what's available including it when it counts as spendable, else
  // how much of it is in use once the account is below zero.
  const overdraftLine = (a: AccountTile) => {
    if (a.overdraftLimit <= 0) return null;
    if (overdraftMode === "spendable") return t("available", { amount: formatEur(Math.max(0, a.balance + a.overdraftLimit)) });
    if (a.balance < 0) return t("overdraftUsed", { used: formatEur(-a.balance), limit: formatEur(a.overdraftLimit) });
    return null;
  };

  return (
    <ClearCard aria-labelledby="home-accounts-title">
      <ClearCardHeader
        title={<span id="home-accounts-title">{t("title")}</span>}
        action={<ClearCardLink href="/reports?tab=vermogen"><MoneyText>{t("total", { amount: formatEur(total) })}</MoneyText></ClearCardLink>}
      />
      <ul className="m-0 grid flex-1 list-none auto-rows-fr grid-cols-2 gap-2.5 p-0">
        {accounts.map((a, i) => (
          <li key={a.key} className={cn("min-w-0", spansRow(i, accounts.length) && "col-span-2")}>
            <Link
              href="/settings?panel=accounts"
              className="flex h-full min-w-0 flex-col justify-center gap-1 rounded-clear-tile bg-clear-tile p-3.5 text-clear-ink no-underline transition-colors hover:bg-clear-line"
            >
              <span className="truncate text-[13px] text-clear-ink-2">{a.name}</span>
              <Amount value={a.balance} splitCents={false} className={cn("text-[17px]", a.balance < -a.overdraftLimit && "text-clear-negative")} />
              {overdraftLine(a) && <span className="truncate text-xs font-bold text-clear-ink-2"><MoneyText>{overdraftLine(a)}</MoneyText></span>}
              {a.suffix && <span className="text-xs font-bold text-clear-ink-2">••{a.suffix}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </ClearCard>
  );
}

/* ── Money flow ───────────────────────────────────────────────────────────────── */

/** A Money flow tile's figure: whole euros at 17px on phones, with cents from lg. */
function FlowTileAmount({ value, sign, className }: { value: number; sign?: "always"; className?: string }) {
  return (
    <>
      <Amount value={value} sign={sign} whole className={cn("text-[17px] lg:hidden", className)} />
      <Amount value={value} sign={sign} splitCents={false} className={cn("hidden text-xl lg:inline", className)} />
    </>
  );
}

export interface FlowDay {
  /** YYYY-MM-DD */
  date: string;
  in: number;
  out: number;
}

/**
 * Money in against money out through the current period, each added up day by day:
 * the ink line is money in, the dashed ember line money out. The gap between them at
 * today is this period's net, called out on the chart. After today both lines go on
 * as lighter dotted lines to the period's end, stepping up on each day `expected`
 * (the scheduled, unpaid recurring items) has money coming in or going out; with
 * nothing scheduled after today nothing more is drawn.
 */
export async function MoneyFlowCard({ days, expected, today }: { days: FlowDay[]; expected: FlowDay[]; today: string }) {
  const t = await getTranslations("home.flow");
  const locale = await getLocale();
  const label = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`));

  const shown = days.filter((d) => d.date <= today);
  const cumulative: FlowDay[] = [];
  for (const d of shown) {
    const prev = cumulative.at(-1);
    cumulative.push({ date: d.date, in: (prev?.in ?? 0) + d.in, out: (prev?.out ?? 0) + d.out });
  }
  const cin = cumulative.at(-1)?.in ?? 0;
  const cout = cumulative.at(-1)?.out ?? 0;
  const net = cin - cout;

  const dayIndex = new Map(days.map((d, i) => [d.date, i]));
  const future = cumulative.length === 0 ? [] : expected.filter((e) => e.date > today && dayIndex.has(e.date)).sort((a, z) => a.date.localeCompare(z.date));
  const expectedIn = cin + future.reduce((s, e) => s + e.in, 0);
  const expectedOut = cout + future.reduce((s, e) => s + e.out, 0);

  const max = Math.max(1, cin, cout, expectedIn, expectedOut);
  const ceiling = Math.ceil(max / 1000) * 1000 || 1000;
  // Positions in percent of the plot, so the chart stretches to whatever height the
  // card gets (it shares a row with the budget card). Lines keep their stroke width
  // through vector-effect; labels and the today dots are plain HTML on top.
  const px = (i: number) => (days.length <= 1 ? 0 : (i / (days.length - 1)) * 100);
  const py = (v: number) => 100 - (v / ceiling) * 100;
  const line = (key: "in" | "out") => cumulative.map((p, i) => `${px(i)},${py(p[key])}`).join(" ");
  const todayIndex = cumulative.length - 1;
  // From today's point: flat to each scheduled day, then a step up by what it brings.
  const expectedLine = (key: "in" | "out", from: number) => {
    let v = from;
    const points = [`${px(todayIndex)},${py(v)}`];
    for (const e of future) {
      if (e[key] === 0) continue;
      const x = px(dayIndex.get(e.date)!);
      points.push(`${x},${py(v)}`);
      v += e[key];
      points.push(`${x},${py(v)}`);
    }
    points.push(`${px(days.length - 1)},${py(v)}`);
    return points.join(" ");
  };
  const periodEnd = label(days.at(-1)?.date ?? today);
  // A handful of date labels: the first day, every week, and the last day — skipping a
  // weekly label that would sit within four days of the last one and collide with it.
  const lastIndex = days.length - 1;
  const ticks = days
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i === 0 || i === lastIndex || (i % 7 === 0 && lastIndex - i >= 4));
  const description = [
    t("description", { in: formatEurWhole(cin), out: formatEurWhole(cout), net: formatEurWhole(net) }),
    future.length > 0 && t("expectedDescription", { date: periodEnd, in: formatEurWhole(expectedIn), out: formatEurWhole(expectedOut) }),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ClearCard aria-labelledby="home-flow-title" data-tip-anchor="homeMoneyFlow">
      <ClearCardHeader
        title={<span id="home-flow-title">{t("title")}</span>}
        subtitle={t("subtitle", { from: label(days[0]?.date ?? today), to: label(days.at(-1)?.date ?? today) })}
        action={
          <span className="flex flex-wrap gap-3.5 text-[13px] font-semibold text-clear-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-[3px] w-4 rounded-full bg-clear-ink" />
              {t("in")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="w-4 border-t-2 border-dashed border-clear-ember" />
              {t("out")}
            </span>
            {future.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="w-4 border-t-[3px] border-dotted border-clear-placeholder" />
                {t("expected")}
              </span>
            )}
          </span>
        }
      />
      <div className="grid grid-cols-3 gap-2.5">
        {/* Smaller amounts and padding on phones, in whole euros, so three amounts fit side by side. */}
        <ClearTile className="flex min-w-0 flex-col gap-1 px-3 py-3 lg:px-3.5">
          <span className="text-[13px] text-clear-ink-2">{t("in")}</span>
          <FlowTileAmount value={cin} />
        </ClearTile>
        <ClearTile className="flex min-w-0 flex-col gap-1 px-3 py-3 lg:px-3.5">
          <span className="text-[13px] text-clear-ink-2">{t("out")}</span>
          <FlowTileAmount value={cout} />
        </ClearTile>
        <ClearTile className={cn("flex min-w-0 flex-col gap-1 px-3 py-3 lg:px-3.5", net >= 0 ? "bg-clear-mint" : "bg-clear-peach")}>
          <span className="text-[13px] text-clear-ink-2">{t("net")}</span>
          <FlowTileAmount value={net} sign="always" className={net >= 0 ? "text-clear-mint-ink" : "text-clear-negative"} />
        </ClearTile>
      </div>
      {cumulative.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <div role="img" aria-label={description} className="flex min-h-[160px] flex-1 flex-col gap-2">
          <div className="relative min-h-0 flex-1">
            {[0, 0.5, 1].map((f) => (
              <span
                key={f}
                aria-hidden
                className="absolute left-0 w-8 -translate-y-1/2 text-right text-[11px] text-clear-muted"
                style={{ top: `${py(ceiling * f)}%` }}
              >
                {f === 0 ? "0" : `${Math.round((ceiling * f) / 100) / 10}k`}
              </span>
            ))}
            <div className="absolute inset-y-0 left-10 right-1">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
                {[0, 0.5, 1].map((f) => (
                  <line
                    key={f}
                    x1="0"
                    x2="100"
                    y1={py(ceiling * f)}
                    y2={py(ceiling * f)}
                    stroke="var(--clr-line)"
                    strokeDasharray={f === 0 ? undefined : "3 4"}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <polygon points={`0,100 ${line("in")} ${px(todayIndex)},100`} fill="var(--clr-ink)" fillOpacity="0.05" />
                <polyline points={line("in")} fill="none" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <polyline points={line("out")} fill="none" stroke="var(--clr-ember)" strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {future.length > 0 && (
                  <>
                    <polyline points={expectedLine("in", cin)} fill="none" stroke="var(--clr-ink)" strokeOpacity="0.4" strokeWidth="2.5" strokeDasharray="0.1 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    <polyline points={expectedLine("out", cout)} fill="none" stroke="var(--clr-ember)" strokeOpacity="0.6" strokeWidth="2.5" strokeDasharray="0.1 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </>
                )}
                <line x1={px(todayIndex)} x2={px(todayIndex)} y1="0" y2="100" stroke="var(--clr-ink)" strokeOpacity="0.15" vectorEffect="non-scaling-stroke" />
              </svg>
              <span
                aria-hidden
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-clear-ink bg-clear-card"
                style={{ left: `${px(todayIndex)}%`, top: `${py(cumulative[todayIndex].in)}%` }}
              />
              <span
                aria-hidden
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-clear-ember bg-clear-card"
                style={{ left: `${px(todayIndex)}%`, top: `${py(cumulative[todayIndex].out)}%` }}
              />
              {/* Where money out is expected to end: the amount, and on wider screens the day.
                  Above the line, or under it when the In line ends just above. */}
              {expectedOut > cout && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-0 whitespace-nowrap text-xs font-bold text-clear-ember-text",
                    expectedIn > expectedOut && py(expectedOut) - py(expectedIn) < 20 ? "translate-y-[30%]" : "-translate-y-[130%]",
                  )}
                  style={{ top: `${py(expectedOut)}%` }}
                >
                  <MoneyText>
                    <span className="lg:hidden">{formatEurWhole(expectedOut)}</span>
                    <span className="hidden lg:inline">{t("expectedBy", { amount: formatEurWhole(expectedOut), date: periodEnd })}</span>
                  </MoneyText>
                </span>
              )}
            </div>
          </div>
          <div aria-hidden className="relative ml-10 mr-1 h-4 text-xs text-clear-muted">
            {ticks.map(({ d, i }) => (
              <span
                key={d.date}
                className={cn(
                  "absolute top-0 whitespace-nowrap",
                  i === 0 ? "" : i === days.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                )}
                style={{ left: `${px(i)}%` }}
              >
                {label(d.date)}
              </span>
            ))}
          </div>
        </div>
      )}
    </ClearCard>
  );
}
