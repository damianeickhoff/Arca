import Link from "next/link";
import { db } from "@/db";
import { savingsGoals, vermogenAccounts, goals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import {
  IconBuildingBank,
  IconDiamond,
  IconPigMoney,
  IconPlus,
  IconTag,
  IconTarget,
  IconTrendingDown,
  IconTrendingUp,
  IconWallet,
  type TablerIcon,
} from "@tabler/icons-react";
import { formatEur, formatEurWhole } from "@/lib/format";
import { getDebtSummary } from "@/lib/debt-calculations";
import { getBankBalances } from "@/lib/account-balances";
import { getNetWorthHistory } from "@/lib/net-worth-snapshots";
import { getNetWorthForecast } from "@/lib/net-worth-forecast";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink, ClearTile } from "@/components/clear/card";
import { ClearProgress } from "@/components/clear/progress";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import type { ClearTone } from "@/components/clear/tones";
import { Icon } from "@/components/icon";
import { loadDebtsData } from "@/app/debts/load-debts";
import { debtEffectivePaid, debtEffectiveTotal, debtPaidPct } from "@/app/debts/debt-shared";
import { DebtIcon } from "@/app/debts/debt-ui";
import { GoalIcon } from "@/app/goals/goal-visuals";
import { addMonths, goalColor, goalProgressPct, monthsLeft } from "@/app/goals/goal-shared";
import { AssetsList, type AssetItem } from "./assets-list";
import { NetWorthHero, type TrendPoint } from "./net-worth-trend-chart";
import { MoneyText } from "@/components/clear/money";

// ── Net worth data ─────────────────────────────────────────────────────────────

export async function getNetWorthData() {
  const [savingsGoalRows, savingsTypeGoalRows, debtSummary, accounts, bankBalances] = await Promise.all([
    db.select().from(savingsGoals).where(eq(savingsGoals.active, true)),
    db.select().from(goals).where(and(eq(goals.active, true), eq(goals.goalType, "savings"))),
    getDebtSummary(),
    // Only accounts counted in net worth — the same rule computeNetWorth() in
    // net-worth-snapshots.ts uses, so today's figure and the recorded history agree.
    db.select().from(vermogenAccounts).where(and(eq(vermogenAccounts.active, true), eq(vermogenAccounts.includeInNetWorth, true))),
    getBankBalances(),
  ]);

  // Combine the two savings-goal sources (old dedicated table + unified goals
  // table's savings type) into one list — both feed net worth the same way.
  const goalList: {
    id: number;
    name: string;
    currentAmount: number;
    targetAmount: number;
    color: string | null;
    icon: string | null;
    monthlyContribution: number | null;
  }[] = [...savingsGoalRows, ...savingsTypeGoalRows];

  // Only banks explicitly opted into net worth — matches computeNetWorth().
  const netWorthBanks = bankBalances.filter((b) => b.includeInNetWorth);

  const totalSavings = goalList.reduce((s, g) => s + g.currentAmount, 0);
  const totalAccounts = accounts.reduce((s, a) => s + a.value, 0) + netWorthBanks.reduce((s, b) => s + b.balance, 0);
  // Money owed to the user (direction 'owed') is a receivable asset, added to net worth.
  const totalAssets = totalSavings + totalAccounts + (debtSummary?.totalOwed ?? 0);
  const totalDebt = debtSummary?.totalBalance ?? 0;
  const netWorth = totalAssets - totalDebt;

  return { goals: goalList, debtSummary, totalSavings, totalAccounts, totalAssets, totalDebt, netWorth, accounts, netWorthBanks };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// The kinds of tracked account, with the glyph and pastel used when an account has no
// icon of its own. Labels live at insights.netWorth.types.<value>.
const ACCOUNT_TYPES: { value: "spaarrekening" | "beleggingen" | "betaalrekening" | "bezitting"; tone: ClearTone; Glyph: TablerIcon }[] = [
  { value: "spaarrekening", tone: "mint", Glyph: IconPigMoney },
  { value: "beleggingen", tone: "lilac", Glyph: IconTrendingUp },
  { value: "betaalrekening", tone: "sky", Glyph: IconWallet },
  { value: "bezitting", tone: "butter", Glyph: IconTag },
];

/** An asset's own icon on its pastel, or the kind's glyph when it has none. */
function AssetIcon({ icon, color, tone, Glyph, initial }: { icon: string | null; color: string | null; tone: ClearTone; Glyph?: TablerIcon; initial?: string }) {
  if (icon) return <Icon iconKey={icon} color={color} soft size="md" />;
  return (
    <IconTile tone={tone} className={cn("size-10", initial && "rounded-full")}>
      {initial ?? (Glyph && <Glyph stroke={1.9} />)}
    </IconTile>
  );
}

/** The tracked-account types with their own label (insights.netWorth.types.*). */
const KNOWN_TYPES = new Set<string>(ACCOUNT_TYPES.map((k) => k.value));

/** Today in the snapshots' own date format (net-worth-snapshots.ts todayISO). */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** The date `days` days ago, in the same format. */
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── Net worth tab ──────────────────────────────────────────────────────────────

export async function VermogenTab() {
  const [data, snapshots, debtsData, t, locale] = await Promise.all([
    getNetWorthData(),
    getNetWorthHistory(200),
    loadDebtsData(),
    getTranslations("insights.netWorth"),
    getLocale(),
  ]);
  const { goals, totalSavings, totalAssets, totalDebt, netWorth, accounts, netWorthBanks } = data;
  const today = todayISO();

  const dayMonth = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const monthYear = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  const asDate = (d: string) => new Date(`${d}T12:00:00`);

  // The recorded history (one snapshot a day), ending on today's live figure so the line
  // finishes exactly on the number above it.
  const oldest = isoDaysAgo(181);
  const history: TrendPoint[] = snapshots
    .filter((s) => s.date < today && s.date >= oldest)
    .map((s) => ({ date: s.date, netWorth: s.netWorth }));
  history.push({ date: today, netWorth });

  const forecast = await getNetWorthForecast(netWorth, today);
  const projected = forecast.at(-1) ?? null;

  const owed = debtsData.computedOwed.filter((c) => c.currentBalance > 0);
  const owe = debtsData.computed;

  // Nothing tracked at all: the page keeps its shell and asks for a first account.
  if (totalAssets === 0 && totalDebt === 0 && goals.length === 0 && owe.length === 0) {
    return <NetWorthEmpty />;
  }

  // ── What you own, as one list (concept A): every bank account, tracked account,
  //    savings goal and money owed to you, with where its figure comes from. The rows add
  //    up to exactly totalAssets (see getNetWorthData).
  const staleBefore = isoDaysAgo(60);
  const kindOf = (type: string): AssetItem["kind"] => (type === "beleggingen" ? "investments" : type === "bezitting" || !KNOWN_TYPES.has(type) ? "things" : "cash");
  const items: AssetItem[] = [
    ...netWorthBanks.map((b) => ({
      key: `bank-${b.id}`,
      icon: <AssetIcon icon={b.icon} color={b.color} tone="sky" Glyph={IconBuildingBank} />,
      name: b.displayName ?? b.accountNumber ?? t("bankAccount"),
      meta: b.accountNumber ? t("assetsList.metaBank", { suffix: b.accountNumber.slice(-4) }) : t("assetsList.metaBankNoNumber"),
      value: b.balance,
      kind: "cash" as const,
      source: "synced" as const,
    })),
    ...accounts.map((a) => {
      const kind = ACCOUNT_TYPES.find((k) => k.value === a.type) ?? { tone: "stone" as ClearTone, Glyph: IconDiamond };
      return {
        key: `account-${a.id}`,
        icon: <AssetIcon icon={a.icon} color={a.color} tone={kind.tone} Glyph={kind.Glyph} />,
        name: a.name,
        meta: a.lastUpdated
          ? t("assetsList.metaEntered", { type: KNOWN_TYPES.has(a.type) ? t(`types.${a.type}`) : t("other"), date: dayMonth.format(asDate(a.lastUpdated)) })
          : KNOWN_TYPES.has(a.type) ? t(`types.${a.type}`) : t("other"),
        value: a.value,
        kind: kindOf(a.type),
        source: "entered" as const,
        stale: !!a.lastUpdated && a.lastUpdated < staleBefore,
      };
    }),
    ...goals
      .filter((g) => g.currentAmount > 0)
      .map((g) => ({
        key: `goal-${g.id}`,
        icon: <AssetIcon icon={g.icon ?? null} color={g.color} tone="rose" Glyph={IconTarget} />,
        name: g.name,
        meta: t("assetsList.metaGoal"),
        value: g.currentAmount,
        kind: "cash" as const,
        source: "plan" as const,
        href: "/goals",
      })),
    ...owed.map((c) => ({
      key: `owed-${c.debt.id}`,
      icon: <AssetIcon icon={c.debt.icon} color={c.debt.color} tone="sky" initial={c.debt.name.trim().charAt(0).toUpperCase() || "?"} />,
      name: c.debt.name,
      meta: t("assetsList.metaOwed"),
      value: c.currentBalance,
      kind: "cash" as const,
      source: "debts" as const,
      href: "/debts",
      positive: true,
    })),
  ];

  const shareBase = totalAssets + totalDebt;
  const assetsPct = shareBase > 0 ? Math.round((totalAssets / shareBase) * 100) : 0;
  const totalMonthlySavings = goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {/* The answer: today's net worth, how it moved and the recorded history. */}
      <ClearCard hero aria-labelledby="networth-hero-title" className="gap-5 lg:col-span-2 lg:p-[26px]">
        <NetWorthHero netWorth={netWorth} history={history} today={today} />
      </ClearCard>

      {/* Assets against debts, and where the total is heading. */}
      <ClearCard aria-labelledby="networth-split-title" className="lg:col-span-2 xl:col-span-1">
        <ClearCardHeader title={<span id="networth-split-title">{t("assetsVsDebts")}</span>} />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-clear-ink-2">
              <span aria-hidden className="size-2.5 rounded-[3px] bg-clear-ink" />
              {t("assets")}
            </span>
            <Amount value={totalAssets} className="text-[26px]" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-clear-ink-2">
              <span aria-hidden className="size-2.5 rounded-[3px] bg-clear-ember" />
              {t("debts")}
            </span>
            <Amount value={totalDebt} className="text-[26px]" />
          </div>
        </div>
        {shareBase > 0 && (
          <div className="flex flex-col gap-2">
            <div role="img" aria-label={t("shareDescription", { assets: assetsPct, debts: 100 - assetsPct })} className="flex h-3.5 gap-[3px]">
              {totalAssets > 0 && <span className="rounded-full bg-clear-ink" style={{ width: `${(totalAssets / shareBase) * 100}%` }} />}
              {totalDebt > 0 && <span className="flex-1 rounded-full bg-clear-ember" />}
            </div>
            <div className="flex justify-between text-[13px] font-semibold text-clear-ink-2">
              <span>{t("assetsShare", { pct: assetsPct })}</span>
              <span>{t("debtsShare", { pct: 100 - assetsPct })}</span>
            </div>
          </div>
        )}

        {projected && (
          <ClearTile className="mt-auto flex flex-col gap-2.5 p-[18px]">
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-sm font-bold">{t("projection", { count: forecast.length })}</span>
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full",
                  projected.netWorth >= netWorth ? "bg-clear-mint text-clear-mint-ink" : "bg-clear-peach text-clear-peach-ink",
                )}
              >
                {projected.netWorth >= netWorth ? <IconTrendingUp size={16} stroke={2} /> : <IconTrendingDown size={16} stroke={2} />}
              </span>
            </div>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <Amount value={projected.netWorth} whole className="text-[30px] tracking-[-0.03em]" />
              <span className="text-base font-bold text-clear-ink-2">{t("byDate", { date: monthYear.format(asDate(projected.date)) })}</span>
            </span>
            <ProjectionLine
              start={netWorth}
              points={forecast.map((p) => p.netWorth)}
              nowLabel={t("now")}
              endLabel={monthYear.format(asDate(projected.date))}
              description={t("projectionDescription", {
                start: formatEurWhole(netWorth),
                end: formatEurWhole(projected.netWorth),
                date: monthYear.format(asDate(projected.date)),
              })}
            />
            <span className="text-[13px] leading-normal text-clear-ink-2">{t("projectionNote")}</span>
          </ClearTile>
        )}
      </ClearCard>

      <h2 className="m-0 mt-2 text-[22px] font-extrabold tracking-[-0.02em] lg:col-span-2 xl:col-span-3">{t("ownOwe")}</h2>

      {/* Assets, grouped by kind. */}
      <ClearCard aria-labelledby="networth-assets-title" className="lg:col-span-2">
        <ClearCardHeader
          as="h3"
          title={
            <span id="networth-assets-title">
              {t("assets")} <span className="font-semibold text-clear-muted">· <MoneyText>{formatEur(totalAssets)}</MoneyText></span>
            </span>
          }
          action={<ClearCardLink href="/settings?panel=accounts">{t("manage")}</ClearCardLink>}
        />
        {items.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-[15px] text-clear-ink-2">{t("noAssets")}</p>
            <Link href="/settings?panel=accounts" className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
              <IconPlus aria-hidden />
              {t("addAccount")}
            </Link>
          </div>
        ) : (
          <AssetsList items={items} total={totalAssets} />
        )}
      </ClearCard>

      {/* Debts, each with how far it is paid off. */}
      <ClearCard aria-labelledby="networth-debts-title" className="lg:col-span-2 xl:col-span-1">
        <ClearCardHeader
          as="h3"
          title={
            <span id="networth-debts-title">
              {t("debts")} <span className="font-semibold text-clear-muted">· <MoneyText>{formatEur(totalDebt)}</MoneyText></span>
            </span>
          }
          action={<ClearCardLink href="/debts">{t("openDebts")}</ClearCardLink>}
        />
        {owe.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-[15px] text-clear-ink-2">{t("noDebts")}</p>
            <Link href="/debts?add=owe" className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
              <IconPlus aria-hidden />
              {t("addDebt")}
            </Link>
          </div>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              <MoneyText>{owe.map((c) => {
                const pct = Math.round(debtPaidPct(c.debt, c.amountPaid, c.currentBalance));
                const paid = debtEffectivePaid(c.debt, c.amountPaid, c.currentBalance);
                const monthly = formatEurWhole(c.debt.minimumPayment);
                const status =
                  c.currentBalance <= 0 ? t("paidOff")
                  : c.neverPaysOff ? t("neverPaysOff")
                  : c.lastPaymentDate ? t("debtFree", { date: monthYear.format(c.lastPaymentDate) })
                  : t("noPayment");
                return (
                  <li key={c.debt.id}>
                    <Link href="/debts" className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4 text-clear-ink no-underline transition-colors hover:bg-clear-line">
                      <span className="flex items-center gap-3">
                        <DebtIcon icon={c.debt.icon} color={c.debt.color} />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-bold">{c.debt.name}</span>
                          <span className="truncate text-[13px] text-clear-muted">
                            {c.debt.interestRate ? t("debtMetaRate", { amount: monthly, rate: c.debt.interestRate }) : t("debtMeta", { amount: monthly })}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <Amount value={c.currentBalance} className="text-[17px] tracking-normal" />
                          <span className="text-xs text-clear-muted"><MoneyText>{t("leftOf", { amount: formatEurWhole(debtEffectiveTotal(c.debt)) })}</MoneyText></span>
                        </span>
                      </span>
                      <ClearProgress value={pct / 100} hatchRemainder size="md" />
                      <span className="flex flex-wrap justify-between gap-x-2 text-[13px] font-semibold text-clear-ink-2">
                        <span><MoneyText>{t.rich("paidSoFar", { pct, amount: formatEurWhole(paid), b: (ch) => <b className="text-clear-ink"><MoneyText>{ch}</MoneyText></b> })}</MoneyText></span>
                        <span>{status}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}</MoneyText>
            </ul>
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-clear-ground pt-3.5 text-sm text-clear-ink-2">
              <span>{t("minimumPayments")}</span>
              <b className="text-base tabular-nums text-clear-ink"><MoneyText>{t("perMonth", { amount: formatEurWhole(debtsData.totalMonthly) })}</MoneyText></b>
            </div>
          </>
        )}
      </ClearCard>

      {/* Savings goals, as tiles. */}
      <ClearCard aria-labelledby="networth-goals-title" className="lg:col-span-2 xl:col-span-3">
        <ClearCardHeader
          title={
            <span id="networth-goals-title">
              {t("savingsGoals")}
              {goals.length > 0 && (
                <span className="font-semibold text-clear-muted">
                  {" · "}
                  <MoneyText>{t("goalsSummary", { saved: formatEurWhole(totalSavings), monthly: formatEurWhole(totalMonthlySavings) })}</MoneyText>
                </span>
              )}
            </span>
          }
          action={<ClearCardLink href="/goals">{t("openGoals")}</ClearCardLink>}
        />
        {goals.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-[15px] text-clear-ink-2">{t("noGoals")}</p>
            <Link href="/goals?new=savings" className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
              <IconPlus aria-hidden />
              {t("addGoal")}
            </Link>
          </div>
        ) : (
          // auto-fit, not auto-fill: the tiles stretch to share the full card width.
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3 p-0">
            <MoneyText>{goals.map((g) => {
              const pct = Math.round(goalProgressPct(g));
              const left = monthsLeft(g);
              const done = g.targetAmount > 0 && g.currentAmount >= g.targetAmount;
              const monthly = g.monthlyContribution ? formatEurWhole(g.monthlyContribution) : null;
              const meta =
                done ? t("reached")
                : monthly && left != null ? t("goalMetaReady", { monthly, date: monthYear.format(addMonths(left)) })
                : monthly ? t("goalMeta", { monthly })
                : t("goalMetaNone");
              return (
                <li key={`${g.id}-${g.name}`} className="min-w-0">
                  <Link href="/goals" className="flex h-full flex-col gap-3 rounded-clear-tile bg-clear-tile p-4 text-clear-ink no-underline transition-colors hover:bg-clear-line">
                    <span className="flex items-center gap-3">
                      <GoalIcon icon={g.icon} color={g.color} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-bold">{g.name}</span>
                        <span className="truncate text-[13px] text-clear-muted">{meta}</span>
                      </span>
                      <span className="shrink-0 text-[15px] font-extrabold tabular-nums">{pct}%</span>
                    </span>
                    <ClearProgress
                      value={pct / 100}
                      className="bg-clear-card"
                      fillColor={done ? undefined : goalColor(g)}
                      fillClassName={done ? "bg-clear-positive-fill" : undefined}
                    />
                    <span className="mt-auto flex flex-wrap justify-between gap-x-2 text-[13px] text-clear-ink-2">
                      <span><MoneyText>{t.rich("goalOf", { saved: formatEurWhole(g.currentAmount), target: formatEurWhole(g.targetAmount), b: (ch) => <b className="tabular-nums text-clear-ink"><MoneyText>{ch}</MoneyText></b> })}</MoneyText></span>
                      {!done && g.targetAmount > g.currentAmount && <span><MoneyText>{t("toGo", { amount: formatEurWhole(g.targetAmount - g.currentAmount) })}</MoneyText></span>}
                    </span>
                  </Link>
                </li>
              );
            })}</MoneyText>
          </ul>
        )}
      </ClearCard>
    </div>
  );
}

/** The projected path, now → the last forecast month, as a dashed line between two dots. */
function ProjectionLine({ start, points, nowLabel, endLabel, description }: { start: number; points: number[]; nowLabel: string; endLabel: string; description: string }) {
  const all = [start, ...points];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const px = (i: number) => (i / (all.length - 1)) * 100;
  const py = (v: number) => (hi === lo ? 50 : 85 - ((v - lo) / (hi - lo)) * 70);
  const end = all.length - 1;

  return (
    <div role="img" aria-label={description} className="flex flex-col gap-1">
      <div className="relative mx-1.5 h-12">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
          <polyline
            points={all.map((v, i) => `${px(i)},${py(v)}`).join(" ")}
            fill="none"
            stroke="var(--clr-ink)"
            strokeWidth="2"
            strokeDasharray="5 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span aria-hidden className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-clear-ink" style={{ left: "0%", top: `${py(start)}%` }} />
        <span
          aria-hidden
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-clear-ink bg-clear-ember"
          style={{ left: "100%", top: `${py(all[end])}%` }}
        />
      </div>
      <div aria-hidden className="flex justify-between text-xs text-clear-muted">
        <span>{nowLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

/** Nothing tracked yet: an illustration, one sentence, the first actions and placeholders. */
async function NetWorthEmpty() {
  const t = await getTranslations("insights.netWorth.empty");
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
          <circle cx="70" cy="70" r="5" fill="var(--clr-card)" stroke="var(--clr-info-fill)" strokeWidth="2.5" />
          <circle cx="166" cy="58" r="5" fill="var(--clr-card)" stroke="var(--clr-info-fill)" strokeWidth="2.5" />
          <circle cx="204" cy="40" r="6" fill="var(--clr-ember)" />
        </svg>
        <div className="flex flex-col items-center gap-2.5">
          <h2 id="networth-empty-title" className="m-0 text-2xl font-extrabold tracking-[-0.02em]">{t("title")}</h2>
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
        <EmptyPlaceholder title={t("chart")} body={t("chartBody")} Glyph={IconTrendingUp} />
        <EmptyPlaceholder title={t("split")} body={t("splitBody")} Glyph={IconWallet} />
      </div>
    </div>
  );
}

function EmptyPlaceholder({ title, body, Glyph }: { title: string; body: string; Glyph: TablerIcon }) {
  return (
    <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-1 rounded-clear-card border-2 border-dashed border-clear-line p-6 text-center font-clear">
      <span className="inline-flex items-center gap-2 text-[15px] font-bold text-clear-ink-2">
        <Glyph size={18} stroke={1.9} aria-hidden />
        {title}
      </span>
      <span className="text-[13px] text-clear-muted">{body}</span>
    </div>
  );
}
