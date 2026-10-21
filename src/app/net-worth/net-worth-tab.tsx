import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { IconArrowDownRight, IconArrowUpRight, IconBuildingBank, IconPlus, IconTrendingUp, IconWallet, type TablerIcon } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { MoneyText } from "@/components/clear/money";
import type { ClearTone } from "@/components/clear/tones";
import { AnchoredTip } from "@/components/anchored-tip";
import { Icon } from "@/components/icon";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { formatEur, formatEurWhole, maskAccountNumber } from "@/lib/format";
import { parseNetWorthRange, type ChangeGroup } from "@/lib/net-worth-history";
import { cn } from "@/lib/utils";
import { loadManualValues, loadNetWorth, type NetWorthAccount, type NetWorthData } from "./load-net-worth";
import { NetWorthChart, type ChartBand } from "./net-worth-chart";
import { UpdateBalancesButton, UpdateBalancesCard } from "./update-balances";

type T = Awaited<ReturnType<typeof getTranslations>>;

/** The Insights heading's actions on Net worth: Manage accounts and Update balances (a dialog). */
export async function NetWorthHeadingActions() {
  const [{ today, items, lastImport }, t] = await Promise.all([loadManualValues(), getTranslations("insights.netWorthTab")]);
  return (
    <div className="flex items-center gap-2">
      <Link href="/settings?panel=accounts" className={clearButtonVariants({ variant: "surface", size: "sm" })}>
        {t("manageAccounts")}
      </Link>
      <UpdateBalancesButton items={items} today={today} lastImport={lastImport} />
    </div>
  );
}

/** Sign first with a real minus: "+€3.226", "−€864". */
function signed(v: number, plus = true) {
  const r = Math.round(v);
  return `${r < 0 ? "−" : plus && r > 0 ? "+" : ""}${formatEurWhole(Math.abs(r))}`;
}

const MANUAL_TYPES = new Set(["spaarrekening", "beleggingen", "betaalrekening", "bezitting"]);
const CARD_TYPES = new Set(["debitcard", "creditcard", "savings", "cash"]);

/** The tile tone and sparkline colour per kind of row. */
function look(a: NetWorthAccount): { tone: ClearTone; ink: string } {
  if (a.type === "debt") return { tone: "peach", ink: "var(--clr-peach-ink)" };
  if (a.type === "owed") return { tone: "stone", ink: "var(--clr-placeholder)" };
  if (a.type === "goal") return { tone: "mint", ink: "var(--clr-mint-ink)" };
  if (a.type === "bank") return { tone: "sky", ink: "var(--clr-sky-ink)" };
  return a.kind === "investments" ? { tone: "lilac", ink: "var(--clr-lilac-ink)" } : a.kind === "things" ? { tone: "butter", ink: "var(--clr-butter-ink)" } : { tone: "mint", ink: "var(--clr-mint-ink)" };
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "?";
}

/**
 * Insights › Net worth: today's figure and how it moved over the range (the hero), one
 * chart of what you own and owe, every account in one table with its source and
 * sparkline, what changed since the budget month started, and the values you keep by
 * hand with their age. The range is `?range=1m|3m|6m|1y`; its control sits in the Insights
 * tab row (<NetWorthRangeControl>) and Manage / Update balances in the heading
 * (<NetWorthHeadingActions>).
 */
export async function NetWorthTab({ range: rangeParam }: { range?: string }) {
  const range = parseNetWorthRange(rangeParam);
  const financialMonth = await getFinancialMonthConfig();
  const [data, t, locale] = await Promise.all([loadNetWorth(range, financialMonth), getTranslations("insights.netWorthTab"), getLocale()]);

  if (data.empty) return <NetWorthEmpty />;

  const dayMonth = (date: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  const monthYear = (date: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  // A budget month is named after the month it ends in.
  const monthName = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(`${data.monthTo}T12:00:00`));
  const Month = monthName.charAt(0).toLocaleUpperCase(locale) + monthName.slice(1);
  const rangeChange = data.netWorth - (data.stacked.net[0] ?? data.netWorth);
  const rangeLabel = t(`range.${range}`);

  const debtsBelow = data.accounts.filter((a) => a.side === "debt");
  const otherDebts = debtsBelow.filter((a) => a.key !== data.stacked.mainDebtKey);
  const bands: ChartBand[] = (
    [
      { key: "cash", label: t("chart.cash"), values: data.stacked.cash },
      { key: "investments", label: t("chart.investments"), values: data.stacked.investments },
      { key: "things", label: t("chart.things"), values: data.stacked.things },
      { key: "mainDebt", label: debtsBelow.find((a) => a.key === data.stacked.mainDebtKey)?.name ?? t("chart.debts"), values: data.stacked.mainDebt },
      {
        key: "otherDebts",
        label: otherDebts.length <= 2 ? new Intl.ListFormat(locale, { type: "conjunction" }).format(otherDebts.map((a) => a.name)) : t("chart.otherDebts"),
        values: data.stacked.otherDebts,
      },
    ] satisfies ChartBand[]
  ).filter((b) => b.values.some((v) => v !== 0));

  const bandOf = (kind: string): ChartBand["key"] => (kind === "investments" ? "investments" : kind === "things" ? "things" : "cash");

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <Hero data={data} t={t} Month={Month} rangeChange={rangeChange} rangeLabel={rangeLabel} dayMonth={dayMonth} monthYear={monthYear} />

      {/* One chart for the whole picture. */}
      <ClearCard aria-labelledby="networth-chart-title" className="gap-3 lg:col-span-2">
        <ClearCardHeader
          title={<span id="networth-chart-title">{t("chart.title")}</span>}
          subtitle={t("chart.subtitle")}
          action={
            <span aria-hidden className="flex max-w-[340px] flex-wrap justify-end gap-x-3 gap-y-1 pt-0.5 text-xs font-semibold text-clear-ink-2">
              {bands.map((b) => (
                <span key={b.key} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-[9px] rounded-[3px]", { cash: "bg-clear-mint", investments: "bg-clear-lilac", things: "bg-clear-butter", mainDebt: "bg-clear-peach", otherDebts: "bg-clear-rose" }[b.key])} />
                  {b.label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5"><span className="h-[2.4px] w-4 rounded-full bg-clear-ink" />{t("chart.net")}</span>
            </span>
          }
        />
        <NetWorthChart
          dates={data.dates}
          bands={bands}
          net={data.stacked.net}
          assets={data.stacked.assets}
          debts={data.stacked.debts}
          step={data.step ? { date: data.step.date, label: t("chart.byHand", { name: data.step.name }), band: bandOf(data.step.kind) } : null}
          description={t("chart.description", {
            from: signed(data.stacked.net[0] ?? 0, false),
            to: signed(data.netWorth, false),
            assets: formatEurWhole(data.assets),
            debts: formatEurWhole(data.debts),
          })}
        />
      </ClearCard>

      <AccountsCard data={data} t={t} rangeLabel={rangeLabel} dayMonth={dayMonth} monthYear={monthYear} />

      <div className="flex flex-col gap-5 self-start lg:col-span-2 lg:grid lg:grid-cols-2 xl:col-span-1 xl:flex">
        <ChangesCard data={data} t={t} Month={Month} dayMonth={dayMonth} />
        <UpdateBalancesCard items={data.manual} today={data.today} lastImport={data.lastImport} />
      </div>

      <AnchoredTip id="insightsNetWorthChanges" anchor="insightsNetWorthChanges" />
    </div>
  );
}

function Hero({
  data,
  t,
  Month,
  rangeChange,
  rangeLabel,
  dayMonth,
  monthYear,
}: {
  data: NetWorthData;
  t: T;
  Month: string;
  rangeChange: number;
  rangeLabel: string;
  dayMonth: (d: string) => string;
  monthYear: (d: string) => string;
}) {
  const month = data.changes.total;
  const payday = data.pendingIncome[0];
  const sentence =
    month < -0.5 && payday
      ? t("hero.downBeforePayday", { month: Month, amount: formatEurWhole(-month), name: payday.name, date: dayMonth(payday.dueDate) })
      : month < -0.5
        ? t("hero.down", { month: Month, amount: formatEurWhole(-month) })
        : month > 0.5
          ? t("hero.up", { month: Month, amount: formatEurWhole(month) })
          : t("hero.level", { month: Month });
  const base = data.assets + data.debts;
  const Arrow = rangeChange >= 0 ? IconArrowUpRight : IconArrowDownRight;

  return (
    <ClearCard hero aria-labelledby="networth-hero-title" className="gap-0 lg:col-span-2 xl:col-span-1">
      <span id="networth-hero-title" className="text-[13px] font-semibold text-clear-hero-ink-2">{t("hero.title")}</span>
      <Amount value={data.netWorth} whole className="mt-1.5 text-[34px] leading-[1.05] font-bold! tracking-[-0.02em]" />
      <div className="mt-2 flex">
        <ClearChip icon={<Arrow aria-hidden stroke={2.2} />} className="h-6 bg-clear-hero-ink/15 px-2.5 text-xs font-semibold text-clear-hero-ink">
          {t("hero.change", { amount: signed(rangeChange), range: rangeLabel })}
        </ClearChip>
      </div>
      <p className="m-0 mt-2 text-[13px] leading-normal text-clear-hero-ink-2"><MoneyText>{sentence}</MoneyText></p>
      {base > 0 && (
        <>
          <div role="img" aria-label={t("hero.splitDescription", { assets: formatEurWhole(data.assets), debts: formatEurWhole(data.debts) })} className="mt-3.5 flex h-2 gap-[3px]">
            {data.assets > 0 && <span className="rounded-full bg-clear-hero-ink" style={{ width: `${(data.assets / base) * 100}%` }} />}
            {data.debts > 0 && (
              <span
                className="min-w-0 flex-1 rounded-full"
                style={{ backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--clr-hero-ink) 55%, transparent) 0 3px, transparent 3px 6px)" }}
              />
            )}
          </div>
          <div className="mt-1.5 flex justify-between gap-2 text-xs text-clear-hero-ink-2">
            <span>{t("hero.assets")} <Amount value={data.assets} whole className="text-xs font-bold! text-clear-hero-ink" /></span>
            <span>{t("hero.debts")} <Amount value={data.debts} whole className="text-xs font-bold! text-clear-hero-ink" /></span>
          </div>
        </>
      )}
      {data.projection && (
        <div className="mt-auto pt-3.5">
          <div className="flex items-center justify-between gap-2.5 rounded-clear-tile bg-clear-hero-ink/10 px-3.5 py-[11px]">
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold text-clear-hero-ink-2">{t("hero.pace")}</span>
              <span className="text-xs text-clear-hero-ink-2">{t("hero.paceNote")}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <Amount value={data.projection.netWorth} whole className="text-lg font-bold!" />
              <span className="text-xs text-clear-hero-ink-2">{t("hero.by", { date: monthYear(data.projection.date) })}</span>
            </span>
          </div>
        </div>
      )}
    </ClearCard>
  );
}

const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,1fr)_100px_84px_96px] md:gap-3.5";

/** The account's own line under its name: what it is and where its value comes from. */
function metaFor(a: NetWorthAccount, t: T, dayMonth: (d: string) => string, monthYear: (d: string) => string): string {
  switch (a.type) {
    case "bank": {
      const kind = a.cardType && CARD_TYPES.has(a.cardType) ? t(`accounts.cardTypes.${a.cardType}`) : t("accounts.cardTypes.bank");
      return a.accountNumber ? t("accounts.metaBank", { kind, suffix: maskAccountNumber(a.accountNumber) }) : t("accounts.metaBankNoNumber", { kind });
    }
    case "manual": {
      const kind = a.manualType && MANUAL_TYPES.has(a.manualType) ? t(`accounts.types.${a.manualType}`) : t("accounts.types.other");
      return a.lastUpdated ? t("accounts.metaEntered", { kind, date: dayMonth(a.lastUpdated) }) : t("accounts.metaEnteredNoDate", { kind });
    }
    case "goal":
      return a.monthlyContribution ? t("accounts.metaGoalMonthly", { amount: formatEurWhole(a.monthlyContribution) }) : t("accounts.metaGoal");
    case "owed":
      return t("accounts.metaOwed");
    case "debt": {
      const parts = [t("accounts.perMonth", { amount: formatEur(a.minimumPayment ?? 0) })];
      if (a.interestRate) parts.push(t("accounts.rate", { rate: new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(a.interestRate) }));
      if (a.neverPaysOff) parts.push(t("accounts.neverPaysOff"));
      else if (a.payoffDate) parts.push(t("accounts.debtFree", { date: monthYear(a.payoffDate) }));
      return parts.join(" · ");
    }
  }
}

function Sparkline({ values, stepped, color, label }: { values: number[]; stepped: boolean; color: string; label: string }) {
  const W = 100;
  const H = 24;
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const x = (i: number) => (values.length <= 1 ? W - 2 : 2 + (i / (values.length - 1)) * (W - 4));
  const y = (v: number) => (span === 0 ? H / 2 : H - 4 - ((v - min) / span) * (H - 8));
  const d = stepped
    ? values.map((v, i) => (i === 0 ? `M${x(0)} ${y(v)}` : `H${x(i)} V${y(v)}`)).join(" ")
    : values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function AccountsCard({
  data,
  t,
  rangeLabel,
  dayMonth,
  monthYear,
}: {
  data: NetWorthData;
  t: T;
  rangeLabel: string;
  dayMonth: (d: string) => string;
  monthYear: (d: string) => string;
}) {
  const assets = data.accounts.filter((a) => a.side === "asset");
  const debts = data.accounts.filter((a) => a.side === "debt");
  const counts = {
    synced: data.accounts.filter((a) => a.source === "synced").length,
    entered: data.accounts.filter((a) => a.source === "entered").length,
    linked: data.accounts.filter((a) => a.source === "plan" || a.source === "debts").length,
  };

  const row = (a: NetWorthAccount) => {
    const { tone, ink } = look(a);
    const change = a.end - a.start;
    const good = a.side === "debt" ? change < 0 : change > 0;
    return (
      <li key={a.key}>
        <Link href={a.href} className={cn(ROW, "min-h-12 border-b border-clear-ground py-1.5 text-clear-ink no-underline transition-colors hover:bg-clear-tile")}>
          <span className="flex min-w-0 items-center gap-2.5">
            {a.icon ? (
              <Icon iconKey={a.icon} color={a.color} soft size="sm" />
            ) : (
              <IconTile tone={tone} size="sm" className={cn("text-xs font-bold", a.type === "owed" && "rounded-full")}>{initials(a.name)}</IconTile>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{a.name}</span>
              <span className="flex min-w-0 items-center gap-2 text-xs text-clear-muted">
                <span className="truncate"><MoneyText>{metaFor(a, t, dayMonth, monthYear)}</MoneyText></span>
                {a.stale && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-clear-ember-text">
                    <span aria-hidden className="size-[7px] rounded-full bg-clear-ember" />
                    {t("accounts.updateValue")}
                  </span>
                )}
              </span>
            </span>
          </span>
          <span className="hidden md:block">
            <Sparkline
              values={a.values}
              stepped={a.type === "manual"}
              color={ink}
              label={t("accounts.spark", { name: a.name, from: formatEurWhole(a.start), to: formatEurWhole(a.end) })}
            />
          </span>
          <span className={cn("hidden text-right text-[13px] font-bold tabular-nums md:block", Math.round(change) === 0 ? "text-clear-placeholder" : good ? "text-clear-positive" : "text-clear-ink-2")}>
            <MoneyText>{signed(change)}</MoneyText>
          </span>
          <Amount
            value={a.end}
            whole
            sign={a.type === "owed" ? "always" : "auto"}
            className={cn("text-right text-sm font-bold!", a.type === "owed" && "text-clear-positive")}
          />
        </Link>
      </li>
    );
  };

  const group = (label: string, total: number, rows: NetWorthAccount[]) =>
    rows.length > 0 && (
      <>
        <li className="flex items-center justify-between pt-3 pb-1 text-xs font-semibold text-clear-muted">
          <span>{label}</span>
          <Amount value={total} whole className="text-[13px] font-bold! text-clear-ink" />
        </li>
        {rows.map(row)}
      </>
    );

  return (
    <ClearCard aria-labelledby="networth-accounts-title" className="gap-3 self-start lg:col-span-2">
      <ClearCardHeader
        title={<span id="networth-accounts-title">{t("accounts.title")}</span>}
        subtitle={t("accounts.subtitle", { count: data.accounts.length, date: dayMonth(data.start) })}
        action={<ClearCardLink href="/settings?panel=accounts">{t("accounts.manage")}</ClearCardLink>}
      />
      <div className="flex flex-col">
        <div className={cn(ROW, "hidden h-[34px] rounded-clear-row bg-clear-tile px-3 text-xs font-semibold text-clear-ink-2 md:grid")}>
          <span>{t("accounts.name")}</span>
          <span>{rangeLabel}</span>
          <span className="text-right">{t("accounts.change")}</span>
          <span className="text-right">{t("accounts.value")}</span>
        </div>
        <ul className="m-0 list-none px-3 py-0 [&_a]:-mx-3 [&_a]:px-3 [&_a:hover]:rounded-clear-row">
          {group(t("accounts.assets"), data.assets, assets)}
          {group(t("accounts.debts"), data.debts, debts)}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {counts.synced > 0 && <ClearChip tone="sky" className="h-6 px-2.5 text-xs font-semibold">{t("accounts.chipSynced", { count: counts.synced })}</ClearChip>}
        {counts.entered > 0 && <ClearChip tone="stone" className="h-6 px-2.5 text-xs font-semibold">{t("accounts.chipEntered", { count: counts.entered })}</ClearChip>}
        {counts.linked > 0 && <ClearChip tone="lilac" className="h-6 px-2.5 text-xs font-semibold">{t("accounts.chipLinked", { count: counts.linked })}</ClearChip>}
        <span className="ml-auto text-xs text-clear-muted">{t("accounts.hint")}</span>
      </div>
    </ClearCard>
  );
}

const GROUP_LABEL: Record<ChangeGroup, string> = { contributions: "contributions", debts: "debts", manual: "manual", cash: "cash" };

function ChangesCard({ data, t, Month, dayMonth }: { data: NetWorthData; t: T; Month: string; dayMonth: (d: string) => string }) {
  const byKey = new Map(data.accounts.map((a) => [a.key, a]));
  const payday = data.pendingIncome[0];
  const total = data.changes.total;
  const meta = (key: string, delta: number) => {
    const a = byKey.get(key);
    if (!a) return "";
    switch (a.type) {
      case "goal":
        return a.lastContribution ? t("changes.metaGoalDate", { date: dayMonth(a.lastContribution) }) : t("changes.metaGoal");
      case "debt":
        return delta > 0 ? t("changes.metaPaidDown", { amount: formatEurWhole(delta) }) : t("changes.metaDebtUp");
      case "owed":
        return delta < 0 ? t("changes.metaPaidBack") : t("changes.metaLent");
      case "manual":
        return a.lastUpdated && a.lastUpdated >= data.monthStartDate ? t("changes.metaUpdated", { date: dayMonth(a.lastUpdated) }) : t("changes.metaChanged");
      case "bank":
        return delta < 0 ? t("changes.metaSpending") : t("changes.metaIncome");
    }
  };
  const tone = (v: number) => (v > 0.5 ? "text-clear-positive" : v < -0.5 ? "text-clear-ink-2" : "text-clear-muted");

  return (
    <ClearCard aria-labelledby="networth-changes-title" data-tip-anchor="insightsNetWorthChanges" className="gap-0">
      <ClearCardHeader
        title={<span id="networth-changes-title">{t("changes.title", { month: Month })}</span>}
        subtitle={
          payday
            ? t("changes.subtitleDue", { amount: signed(total), name: payday.name, income: formatEurWhole(payday.amount), date: dayMonth(payday.dueDate) })
            : t("changes.subtitle", { amount: signed(total) })
        }
      />
      {data.changes.groups.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-clear-muted">{t("changes.none")}</p>
      ) : (
        data.changes.groups.map((g) => (
          <section key={g.group} aria-label={t(`changes.groups.${GROUP_LABEL[g.group]}`)}>
            <h3 className="m-0 flex items-center justify-between pt-3 pb-1 text-xs font-semibold text-clear-muted">
              <span>{t(`changes.groups.${GROUP_LABEL[g.group]}`)}</span>
              <span className={cn("tabular-nums", tone(g.total))}><MoneyText>{signed(g.total)}</MoneyText></span>
            </h3>
            <ul className="m-0 list-none p-0">
              {g.rows.map((r) => (
                <li key={r.key} className="flex items-center gap-2.5 py-[5px]">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{byKey.get(r.key)?.name}</span>
                    <span className="truncate text-xs text-clear-muted"><MoneyText>{meta(r.key, r.delta)}</MoneyText></span>
                  </span>
                  <span className={cn("shrink-0 text-[13px] font-bold tabular-nums", tone(r.delta))}><MoneyText>{signed(r.delta)}</MoneyText></span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </ClearCard>
  );
}

/** Nothing tracked yet: the shell, a shape, one sentence, the first actions and placeholders. */
async function NetWorthEmpty() {
  const t = await getTranslations("insights.netWorthTab.empty");
  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <ClearCard aria-labelledby="networth-empty-title" className="items-center justify-center gap-6 px-8 py-12 text-center lg:col-span-2">
        <svg width="240" height="180" viewBox="0 0 240 180" fill="none" aria-hidden className="h-auto max-w-full">
          <circle cx="120" cy="94" r="80" fill="var(--clr-mint)" />
          <path d="M40 150h160" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="62" y="96" width="30" height="54" rx="7" fill="var(--clr-ink)" />
          <rect x="105" y="72" width="30" height="78" rx="7" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2.2" strokeDasharray="5 4" />
          <rect x="148" y="112" width="30" height="38" rx="7" fill="var(--clr-ember)" stroke="var(--clr-ink)" strokeWidth="2.5" />
          <path d="M70 70L118 48L166 58" stroke="var(--clr-info-fill)" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" />
          <circle cx="204" cy="40" r="6" fill="var(--clr-ember)" />
        </svg>
        <div className="flex flex-col items-center gap-2.5">
          <h2 id="networth-empty-title" className="m-0 text-2xl font-bold tracking-[-0.02em]">{t("title")}</h2>
          <p className="m-0 max-w-[500px] text-base leading-normal text-clear-ink-2">{t("body")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Link href="/settings?panel=accounts" className={clearButtonVariants({ size: "lg" })}>
            <IconBuildingBank aria-hidden />
            {t("addAccount")}
          </Link>
          <Link href="/debts?add=owe" className={clearButtonVariants({ variant: "secondary", size: "lg" })}>
            <IconPlus aria-hidden />
            {t("addDebt")}
          </Link>
        </div>
      </ClearCard>
      <div className="flex flex-col gap-5 lg:col-span-2 xl:col-span-1">
        <Placeholder title={t("chart")} body={t("chartBody")} Glyph={IconTrendingUp} />
        <Placeholder title={t("accounts")} body={t("accountsBody")} Glyph={IconWallet} />
      </div>
    </div>
  );
}

function Placeholder({ title, body, Glyph }: { title: string; body: string; Glyph: TablerIcon }) {
  return (
    <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-1 rounded-clear-card border-2 border-dashed border-clear-line p-6 text-center font-clear">
      <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-clear-ink-2">
        <Glyph size={18} stroke={1.9} aria-hidden />
        {title}
      </span>
      <span className="text-[13px] text-clear-muted">{body}</span>
    </div>
  );
}
