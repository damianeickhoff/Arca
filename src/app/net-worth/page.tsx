import { db } from "@/db";
import { savingsGoals, vermogenAccounts, goals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { formatEur, formatCompactEur, pctChangeLabel } from "@/lib/format";
import { getDebtSummary } from "@/lib/debt-calculations";
import { getBankBalances } from "@/lib/account-balances";
import { getNetWorthHistory } from "@/lib/net-worth-snapshots";
import { getNetWorthForecast } from "@/lib/net-worth-forecast";
import { NetworthChart } from "./networth-chart";
import { NetWorthTrendChart } from "@/app/reports/net-worth-trend-chart";
import { ChangePill } from "@/components/change-pill";
import { StatTile, TileBadge } from "@/components/stat-tile";
import { ScrollStickyHeader } from "@/components/scroll-sticky-header";
import Link from "next/link";
import {
  IconArrowRight as ArrowRight,
  IconPigFilled as PiggyBank,
  IconTrendingUp as TrendingUp,
  IconWallet as Wallet,
  IconCashBanknoteFilled as WalletFilled,
  IconDiamondFilled as Gem,
  IconScaleFilled as Scale,
  IconPercentage as Percentage,
} from "@tabler/icons-react";

const VERMOGEN_TYPES: { value: string; label: string; color: string; icon: typeof Wallet }[] = [
  { value: "spaarrekening",  label: "Savings account",  color: "#14b8a6", icon: PiggyBank },
  { value: "beleggingen",    label: "Investments",    color: "#a855f7", icon: TrendingUp },
  { value: "betaalrekening", label: "Checking account", color: "#3b82f6", icon: Wallet },
  { value: "bezitting",      label: "Possession",      color: "#f59e0b", icon: Gem },
];

function typeColor(type: string) {
  return VERMOGEN_TYPES.find((t) => t.value === type)?.color ?? "#94a3b8";
}
function typeLabel(type: string) {
  return VERMOGEN_TYPES.find((t) => t.value === type)?.label ?? type;
}

async function getNetWorthData() {
  const [savingsGoalRows, savingsTypeGoalRows, debtSummary, accounts, bankBalances] = await Promise.all([
    db.select().from(savingsGoals).where(eq(savingsGoals.active, true)),
    db.select().from(goals).where(and(eq(goals.active, true), eq(goals.goalType, "savings"))),
    getDebtSummary(),
    db.select().from(vermogenAccounts).where(eq(vermogenAccounts.active, true)),
    getBankBalances(),
  ]);

  // Combine the two savings-goal sources (old dedicated table + unified goals
  // table's savings type) into one list — both feed net worth the same way.
  const goalList: { id: number; name: string; currentAmount: number; targetAmount: number; color: string | null; monthlyContribution: number | null }[] = [
    ...savingsGoalRows,
    ...savingsTypeGoalRows,
  ];

  // Only banks explicitly opted into net worth — matches computeNetWorth() in
  // net-worth-snapshots.ts, which this page's own totals must stay consistent with
  // (previously this page never queried banks at all, so a balance correction there
  // never moved the net-worth figure).
  const netWorthBanks = bankBalances.filter((b) => b.includeInNetWorth);

  const totalSavings = goalList.reduce((s, g) => s + g.currentAmount, 0);
  const totalAccounts = accounts.reduce((s, a) => s + a.value, 0) + netWorthBanks.reduce((s, b) => s + b.balance, 0);
  const totalAssets = totalSavings + totalAccounts;
  const totalDebt = debtSummary?.totalBalance ?? 0;
  const netWorth = totalAssets - totalDebt;

  // 12-month forward projection
  // Static accounts (spaarrekening, beleggingen, etc.) don't advance; only savings goals do.
  const now = new Date();
  const projection: { month: string; netWorth: number; savings: number; debt: number }[] = [];

  let projSavings = totalAssets;
  let projDebtBalances = (debtSummary?.debts ?? []).map((d) => ({
    id: d.debt.id,
    balance: d.currentBalance,
    payment: d.debt.minimumPayment,
  }));

  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const totalProjDebt = projDebtBalances.reduce((s, d) => s + d.balance, 0);
    projection.push({ month: ym, netWorth: projSavings - totalProjDebt, savings: projSavings, debt: totalProjDebt });

    // Advance one month: only savings goals grow; static accounts stay constant
    projSavings += goalList.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);
    projDebtBalances = projDebtBalances.map((d) => ({
      ...d,
      balance: Math.max(0, d.balance - d.payment),
    }));
  }

  return { goals: goalList, debtSummary, totalSavings, totalAccounts, totalAssets, totalDebt, netWorth, projection, accounts, netWorthBanks };
}

export default async function NetWorthPage() {
  const [{ goals, debtSummary, totalSavings, totalAccounts, totalAssets, totalDebt, netWorth, projection, accounts, netWorthBanks }, history] = await Promise.all([
    getNetWorthData(),
    getNetWorthHistory(90),
  ]);

  // Snapshot recording itself happens once/day in the root layout (see
  // maybeRecordDailyNetWorthSnapshot()) — this page only reads the history it produces.
  const hasHistory = history.length >= 2;
  const firstNetWorth = history[0]?.netWorth ?? netWorth;
  const historyChange = hasHistory ? pctChangeLabel(netWorth, firstNetWorth) : null;
  const forecast = hasHistory ? await getNetWorthForecast(netWorth, history[history.length - 1].date) : [];

  // Group vermogen accounts by type (only types that have entries)
  const groupedAccounts = VERMOGEN_TYPES.map((t) => ({
    ...t,
    items: accounts.filter((a) => a.type === t.value),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="-mt-14 lg:mt-0 min-h-screen">

      {/* Mobile top bar — matches dashboard mobile top bar */}
      <div className="lg:hidden sticky top-[var(--sat)] z-40 flex items-center justify-end px-4 pt-2 pb-3">
      </div>
      <div className="lg:hidden px-4 pb-3">
        <h1 className="text-2xl font-black tracking-tight text-foreground">Net worth</h1>
        <p className="text-sm text-muted-foreground">Bezittingen minus schulden</p>
      </div>

      {/* Desktop sticky header */}
      <ScrollStickyHeader
        className="hidden lg:block sticky top-0 z-10 px-6 md:px-8 py-4"
        scrolledClassName="bg-white/40 dark:bg-white/5 backdrop-blur-xl border-b border-white/30 dark:border-white/10"
      >
        <div className="mt-6">
          <h1 className="text-3xl font-black tracking-tight text-foreground">Net worth</h1>
          <p className="text-sm text-muted-foreground">Bezittingen minus schulden</p>
        </div>
      </ScrollStickyHeader>

      <div className="px-5 pb-5 md:px-6 md:pb-6 lg:px-8 lg:pb-8 pt-4 space-y-5">

        {/* Hero net worth card */}
        <div className="rounded-2xl p-6 relative overflow-hidden bg-gradient-to-br from-teal-500 via-emerald-600 to-cyan-700 dark:from-teal-950 dark:via-emerald-950 dark:to-cyan-950">
          <div className="absolute top-10 -right-4 rotate-12 size-32 rounded-2xl bg-white/10 dark:bg-white/5" />
          <div className="absolute top-4 -right-12 -rotate-12 size-20 rounded-2xl bg-white/10 dark:bg-white/5" />
          <div className="absolute -bottom-6 -left-6 size-32 rounded-full bg-teal-300/20 dark:bg-teal-500/10" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="size-4 text-white/70" />
              <p className="text-sm text-white/70 font-medium">Net worth</p>
            </div>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <p className="text-4xl font-black tabular-nums tracking-tight text-white">
                {formatEur(netWorth)}
              </p>
              {historyChange && <ChangePill change={historyChange} />}
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-[11px] text-white/60">Assets</p>
                <p className="text-base font-bold tabular-nums text-emerald-200">{formatEur(totalAssets)}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/60">Debts</p>
                <p className="text-base font-bold tabular-nums text-rose-200">{formatEur(totalDebt)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick-glance stat tiles — same theme-static "photo card" treatment as the
            Analytics tab's square tiles (StyleDescriptions/analytics-page-style.md §2b). */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile
            label="Total assets"
            value={formatCompactEur(totalAssets)}
            badge={<TileBadge icon={WalletFilled} color="var(--color-income)" />}
          />
          <StatTile
            label="Total debt"
            value={formatCompactEur(totalDebt)}
            badge={<TileBadge icon={Scale} color="var(--color-expense)" />}
          />
          <StatTile
            label="Debt paid off"
            value={debtSummary ? `${debtSummary.paidPct}%` : "—"}
            badge={<TileBadge icon={Percentage} color="var(--color-income)" />}
          />
          <StatTile
            label="Savings goals"
            value={formatCompactEur(totalSavings)}
            badge={<TileBadge icon={PiggyBank} color="#14b8a6" />}
          />
        </div>

        {/* History chart — actual recorded net worth over time (one snapshot/day), distinct
            from the Projection card below it which is a forward-looking model. This used to
            live only on the Reports "Rapporten" tab; it belongs on the dedicated Net worth
            page too. */}
        {hasHistory ? (
          <div className="rounded-2xl bg-card p-5">
            <h2 className="font-semibold text-sm mb-1">History</h2>
            <p className="text-xs text-muted-foreground mb-1">Last {history.length} days</p>
            <NetWorthTrendChart data={history.map((h) => ({ date: h.date, netWorth: h.netWorth }))} forecast={forecast} />
          </div>
        ) : (
          <div className="rounded-2xl bg-card p-5">
            <h2 className="font-semibold text-sm mb-1">History</h2>
            <p className="text-xs text-muted-foreground">The trend chart is being built — come back tomorrow for your first comparison.</p>
          </div>
        )}

        {/* Projection chart */}
        {projection.length > 1 && (
          <div className="rounded-2xl bg-card p-5">
            <h2 className="font-semibold text-sm mb-1">Prognose (12 maanden)</h2>
            <p className="text-xs text-muted-foreground mb-4">Gebaseerd op maandelijkse bijdragen en aflossingen</p>
            <NetworthChart data={projection} />
            <div className="flex gap-5 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-1.5 rounded-full inline-block" style={{ backgroundColor: "var(--chart-3)" }} />
                Net worth
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-1.5 rounded-full inline-block" style={{ backgroundColor: "var(--color-income)" }} />
                Savings
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-1.5 rounded-full inline-block" style={{ backgroundColor: "var(--color-expense)" }} />
                Debts
              </span>
            </div>
          </div>
        )}

        {/* Assets + Liabilities breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Assets */}
          <div className="rounded-2xl bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">Assets</h2>
              <Link href="/settings?tab=banks" className="flex items-center gap-1 font-semibold text-xs text-primary hover:opacity-75 transition-opacity">
                Beheren <ArrowRight className="size-3" />
              </Link>
            </div>

            {/* Savings goals */}
            {goals.length > 0 && (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Savings goals</p>
                {goals.map((goal) => {
                  const pct = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
                  return (
                    <div key={goal.id}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-medium truncate flex-1 mr-2">{goal.name}</span>
                        <span className="tabular-nums font-semibold shrink-0">{formatEur(goal.currentAmount)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: goal.color ?? "#6366f1" }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                        <span>{pct.toFixed(0)}% van doel</span>
                        <span>{formatEur(goal.targetAmount)}</span>
                      </div>
                    </div>
                  );
                })}
                {goals.length > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums pt-1">
                    <span>Subtotaal spaardoelen</span>
                    <span className="font-semibold" style={{ color: "var(--color-income)" }}>{formatEur(totalSavings)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Net worth accounts grouped by type */}
            {groupedAccounts.length > 0 && (
              <div className={`space-y-4 ${goals.length > 0 ? "mt-5 pt-4 border-t" : ""}`}>
                {groupedAccounts.map((group) => {
                  const GroupIcon = group.icon;
                  return (
                    <div key={group.value}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <GroupIcon className="size-3" style={{ color: group.color }} />
                        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: group.color }}>
                          {group.label}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {group.items.map((account) => (
                          <div key={account.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                              <span className="font-medium truncate">{account.name}</span>
                              {account.lastUpdated && (
                                <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
                                  {new Date(account.lastUpdated + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                </span>
                              )}
                            </div>
                            <span className="tabular-nums font-semibold shrink-0" style={{ color: group.color }}>
                              {formatEur(account.value)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums pt-0.5">
                          <span>Subtotaal</span>
                          <span className="font-semibold" style={{ color: group.color }}>
                            {formatEur(group.items.reduce((s, a) => s + a.value, 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bank accounts opted into net worth (banks.includeInNetWorth) */}
            {netWorthBanks.length > 0 && (
              <div className={`space-y-2 ${goals.length > 0 || groupedAccounts.length > 0 ? "mt-5 pt-4 border-t" : ""}`}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bank accounts</p>
                {netWorthBanks.map((bank) => (
                  <div key={bank.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate flex-1 mr-2">{bank.displayName ?? bank.accountNumber ?? `Bank ${bank.id}`}</span>
                    <span className="tabular-nums font-semibold shrink-0">{formatEur(bank.balance)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums pt-0.5">
                  <span>Subtotaal</span>
                  <span className="font-semibold">{formatEur(netWorthBanks.reduce((s, b) => s + b.balance, 0))}</span>
                </div>
              </div>
            )}

            {goals.length === 0 && groupedAccounts.length === 0 && netWorthBanks.length === 0 && (
              <p className="text-sm text-muted-foreground">No assets found.</p>
            )}

            <div className="border-t pt-3 mt-4 flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums" style={{ color: "var(--color-income)" }}>{formatEur(totalAssets)}</span>
            </div>
          </div>

          {/* Liabilities */}
          <div className="rounded-2xl bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">Debts</h2>
              <Link href="/debts" className="flex items-center gap-1 font-semibold text-xs text-primary hover:opacity-75 transition-opacity">
                Beheren <ArrowRight className="size-3" />
              </Link>
            </div>
            {debtSummary ? (
              <div className="space-y-3">
                {debtSummary.debts.map(({ debt, currentBalance, amountPaid }) => {
                  const pct = debt.startingBalance > 0 ? Math.min(100, (amountPaid / debt.startingBalance) * 100) : 100;
                  return (
                    <div key={debt.id}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-medium truncate flex-1 mr-2">{debt.name}</span>
                        <span className="tabular-nums font-semibold shrink-0" style={{ color: "var(--color-expense)" }}>{formatEur(currentBalance)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: debt.color ?? "#ef4444" }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                        <span>{pct.toFixed(0)}% afbetaald</span>
                        <span>{formatEur(debt.startingBalance)}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="border-t pt-3 mt-3 flex items-center justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums" style={{ color: "var(--color-expense)" }}>{formatEur(totalDebt)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No debts.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
