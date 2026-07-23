import { cn } from "@/lib/utils";
import { db } from "@/db";
import { categories, categoryRules, recurringItems, savingsGoals, brandIconRules, banks } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getFinancialMonthConfig, getSidebarSubtitle, getBudgetRollover, getBudgetStrategy } from "@/lib/app-settings";
import { GeneralSettingsClient } from "./general-client";
import { BrandIconsClient, BrandIconRuleAddButton } from "./brand-icons-client";
import { LinkedBanksSection } from "./banks-client";
import { formatEur, toMonthly } from "@/lib/format";
import { MobileCategoryList } from "@/components/settings/categories/mobile-category-list";
import { getCategoryTransactionCounts } from "@/lib/category-counts";
import { RecurringClient, RecurringRestoreButton } from "@/components/settings/recurring/recurring-client";
import { MobileRecurringList } from "@/components/settings/recurring/mobile-recurring-list";
import { MobileRecurringBottomBar } from "@/components/settings/recurring/mobile-recurring-bottom-bar";
import { Icon } from "@/components/icon";
import { resolveRecurringIcon } from "@/lib/auto-brand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CategoryRule } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ProfileSettingsClient } from "./profile-client";
import { ScrollStickyHeader } from "@/components/scroll-sticky-header";

// Settings is reached via client-side sidebar drill-down (not a hard navigation), so
// Next's Router Cache would otherwise serve a stale RSC payload after a server-side
// change (e.g. editing src/config/categories.ts) until a manual page reload.
export const dynamic = "force-dynamic";

const TAB_TITLES: Record<string, string> = {
  categories:  "Categories",
  recurring:   "Recurring",
  brandicons:  "Brand icons",
  banks:       "Accounts",
  general:     "General",
  profile:     "Profile",
};

const TAB_SUBTITLES: Record<string, string> = {
  categories:  "Manage your transaction categories",
  recurring:   "Fixed income and expenses per month",
  brandicons:  "Automatic brand icons for transactions",
  banks:       "Linked accounts for CSV imports and category rules",
  general:     "General settings for your finances",
  profile:     "Your name and password",
};

type Tab = "categories" | "recurring" | "brandicons" | "banks" | "general" | "profile";

const GROUPS = ["income", "bill", "subscription", "debt"] as const;
const TYPE_LABELS: Record<string, string> = {
  income: "Income", bill: "Accounts", subscription: "Subscriptions",
  debt: "Debts",
};
const FREQ_LABELS: Record<string, string> = {
  yearly: "yr", weekly: "wk", monthly: "mo", once: "one-time",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; catSearch?: string; recSearch?: string; embed?: string }>;
}) {
  const { tab: tabParam, catSearch, recSearch, embed } = await searchParams;
  const embedded = embed === "1";
  const tab: Tab = (["categories", "recurring", "brandicons", "banks", "general", "profile"].includes(tabParam ?? "") ? tabParam : "categories") as Tab;

  const [currentUser, sidebarSubtitle, budgetStrategy] = await Promise.all([
    tab === "profile" ? getCurrentUser() : Promise.resolve(null),
    tab === "profile" ? getSidebarSubtitle() : Promise.resolve(""),
    tab === "profile" ? getBudgetStrategy() : Promise.resolve(null),
  ]);

  const [cats, rules, recurringAll, goals, financialMonth, brandRules, banksData, allBanks, txCountByCat, budgetRollover] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(categoryRules),
    db.select().from(recurringItems).orderBy(recurringItems.type, recurringItems.name),
    db.select().from(savingsGoals).orderBy(savingsGoals.name),
    getFinancialMonthConfig(),
    db.select().from(brandIconRules),
    tab === "banks"
      ? db.select().from(banks).orderBy(asc(banks.displayName), asc(banks.accountNumber))
      : Promise.resolve([]),
    tab === "categories"
      ? db.select().from(banks).orderBy(asc(banks.displayName))
      : Promise.resolve([]),
    tab === "categories" ? getCategoryTransactionCounts() : Promise.resolve({}),
    tab === "general" ? getBudgetRollover() : Promise.resolve(false),
  ]);

  const rulesByCat: Record<number, CategoryRule[]> = {};
  for (const rule of rules) {
    if (!rulesByCat[rule.categoryId]) rulesByCat[rule.categoryId] = [];
    rulesByCat[rule.categoryId].push(rule);
  }

  // Recurring items inherit their icon from an auto-detected brand or their linked category.
  const categoriesById = new Map(cats.map((c) => [c.id, { icon: c.icon, color: c.color }]));

  const recurringTotals: Record<string, number> = {};
  for (const item of recurringAll) {
    if (!item.active || item.type === "savings") continue;
    recurringTotals[item.type] = (recurringTotals[item.type] ?? 0) + toMonthly(item.amount, item.frequency);
  }
  const totalIncome = recurringTotals["income"] ?? 0;
  const totalCosts = (recurringTotals["bill"] ?? 0) + (recurringTotals["subscription"] ?? 0) + (recurringTotals["debt"] ?? 0);
  const totalMonthlySavings = goals.filter(g => g.active).reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);
  const netto = totalIncome - totalCosts - totalMonthlySavings;

  return (
    <div className={embedded ? "min-h-screen" : "-mt-14 lg:mt-0 min-h-screen"}>

      {/* Mobile top bar — matches dashboard mobile top bar */}
      {!embedded && (
        <>
          <ScrollStickyHeader
            className="lg:hidden sticky top-[var(--sat)] z-40 flex items-center gap-3 px-4 pt-2 pb-3"
            scrolledClassName="bg-background/80 backdrop-blur-md"
          >
            <div className="flex items-center gap-3 ml-auto">
              {tab === "brandicons" && <BrandIconRuleAddButton variant="icon" />}
            </div>
          </ScrollStickyHeader>
          <div className="lg:hidden px-5 pb-3 pt-3">
            <h1 className="text-2xl font-black tracking-tight text-foreground">{TAB_TITLES[tab] ?? "Settings"}</h1>
            <p className="text-sm text-foreground/60">{TAB_SUBTITLES[tab] ?? ""}</p>
          </div>
        </>
      )}

      {/* Desktop sticky header */}
      <ScrollStickyHeader
        className={cn(embedded ? "hidden" : "hidden lg:flex", "sticky top-0 z-10 px-6 md:px-8 py-4 items-end justify-between gap-4")}
        scrolledClassName="bg-white/40 dark:bg-white/5 backdrop-blur-xl border-b border-white/30 dark:border-white/10"
      >
        <div className="mt-6">
          <h1 className="text-3xl font-black tracking-tight text-foreground">{TAB_TITLES[tab] ?? "Settings"}</h1>
          <p className="text-sm text-muted-foreground">{TAB_SUBTITLES[tab] ?? ""}</p>
        </div>
        <div className="flex items-center gap-2 pb-1">
          {tab === "brandicons" && <BrandIconRuleAddButton />}
        </div>
      </ScrollStickyHeader>

      {/* scroll-mt clears the sticky mobile top bar / desktop header so content that
          gets scrolled or focused into view (e.g. after adding an item) never ends up
          hidden behind them. */}
      <div className="px-5 pb-5 md:px-6 md:pb-6 lg:px-8 lg:pb-8 pt-4 space-y-5 scroll-mt-32 lg:scroll-mt-28">

        {/* ── Categories ── */}
        {tab === "categories" && (
          <MobileCategoryList categories={cats} rulesByCat={rulesByCat} banks={allBanks} txCountByCat={txCountByCat} search={catSearch} />
        )}

        {/* ── Recurring ── */}
        {tab === "recurring" && (
          <>
            <div className="hidden lg:flex justify-end">
              <RecurringClient action="add" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-card p-4">
                <p className="text-xs text-foreground/60 mb-1">Income / mnd</p>
                <p className="text-xl font-medium tabular-nums text-foreground">{formatEur(totalIncome)}</p>
              </div>
              <div className="rounded-lg bg-card p-4">
                <p className="text-xs text-foreground/60 mb-1">Cost / mo</p>
                <p className="text-xl font-medium tabular-nums text-foreground">{formatEur(totalCosts)}</p>
              </div>
              <div className="rounded-lg bg-card p-4">
                <p className="text-xs text-foreground/60 mb-1">Savings / mo</p>
                <p className="text-xl font-medium tabular-nums text-foreground">{formatEur(totalMonthlySavings)}</p>
              </div>
              <div className={`rounded-lg bg-card p-4`}>
                <p className="text-xs text-foreground/60 mb-1">Net disposable</p>
                <p className={`text-xl font-medium tabular-nums ${netto >= 0 ? "text-green-600" : "text-red-600"}`}>{formatEur(netto)}</p>
              </div>
            </div>

            {/* Extra bottom clearance so the last cards can scroll clear of the fixed
                search+add bar above the bottom nav. */}
            <div className="lg:hidden pb-20">
              <MobileRecurringList items={recurringAll} search={recSearch} />
            </div>
            <MobileRecurringBottomBar search={recSearch} />

            <div className="hidden lg:block space-y-5">
              {GROUPS.map((group) => {
                const groupItems = recurringAll.filter((i) => i.type === group && !i.dismissed);
                if (groupItems.length === 0) return null;
                const groupTotal = recurringTotals[group] ?? 0;
                return (
                  <Card key={group}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{TYPE_LABELS[group]}</CardTitle>
                        <span className="text-sm font-semibold tabular-nums">{formatEur(groupTotal)} / mnd</span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {groupItems.map((item) => {
                          const monthly = toMonthly(item.amount, item.frequency);
                          const isNonMonthly = item.frequency !== "monthly" && item.amount;
                          const ic = resolveRecurringIcon(item, categoriesById);
                          return (
                            <div key={item.id} className={`flex items-center justify-between px-4 py-3 text-sm ${!item.active ? "opacity-50" : ""}`}>
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} size="sm" />
                                <div className="min-w-0">
                                  <span className="font-medium">{item.name}</span>
                                  {item.source === "auto" && (
                                    <Badge variant="outline" className="ml-2 text-xs border-primary/40 text-primary">Auto</Badge>
                                  )}
                                  {item.budgetType && (
                                    <Badge variant="outline" className="ml-2 text-xs">
                                      {item.budgetType === "nodig" ? "Nodig" : item.budgetType === "willen" ? "Willen" : item.budgetType === "sparen" ? "Savings" : item.budgetType}
                                    </Badge>
                                  )}
                                  {!item.active && <Badge variant="secondary" className="ml-2 text-xs">Inactive</Badge>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  {item.amount ? (
                                    <>
                                      <span className="font-semibold tabular-nums">{formatEur(monthly)}</span>
                                      <span className="text-xs text-muted-foreground ml-1">/mo</span>
                                      {isNonMonthly && (
                                        <div className="text-xs tabular-nums text-muted-foreground">
                                          {formatEur(item.amount)} /{FREQ_LABELS[item.frequency] ?? item.frequency}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </div>
                                <RecurringClient action="edit" item={item} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Dismissed auto-detected items — suppressed from detection, restorable. */}
              {(() => {
                const dismissed = recurringAll.filter((i) => i.dismissed);
                if (dismissed.length === 0) return null;
                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-muted-foreground">Dismissed ({dismissed.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {dismissed.map((item) => {
                          const ic = resolveRecurringIcon(item, categoriesById);
                          return (
                          <div key={item.id} className="flex items-center justify-between px-4 py-3 text-sm opacity-70">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Icon iconKey={ic.iconKey} color={ic.color} background={ic.background} size="sm" />
                              <div className="min-w-0">
                                <span className="font-medium">{item.name}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {item.matchPattern ? `Pattern: ${item.matchPattern}` : "Won't be auto-detected again"}
                                </span>
                              </div>
                            </div>
                            <RecurringRestoreButton item={item} />
                          </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          </>
        )}

        {/* ── Brand icons ── */}
        {tab === "brandicons" && (
          <BrandIconsClient initialRules={brandRules} panelHeader={false} />
        )}

        {/* ── Linked accounts ── */}
        {tab === "banks" && (
          <LinkedBanksSection initialBanks={banksData} />
        )}

        {/* ── Profile ── */}
        {tab === "profile" && currentUser && budgetStrategy && (
          <ProfileSettingsClient user={currentUser} sidebarSubtitle={sidebarSubtitle} budgetStrategy={budgetStrategy} />
        )}

        {/* ── General ── */}
        {tab === "general" && (
          <GeneralSettingsClient
            currentStartDay={financialMonth.defaultStartDay}
            currentWeekendRollback={financialMonth.weekendRollback ?? false}
            currentBudgetRollover={budgetRollover}
            initialOverrides={Object.entries(financialMonth.overrides ?? {})
              .map(([month, startDay]) => ({ month, startDay }))
              .sort((left, right) => right.month.localeCompare(left.month))}
          />
        )}

      </div>
    </div>
  );
}
