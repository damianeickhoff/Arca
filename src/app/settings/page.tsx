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
import { syncRecurringLifecycle } from "@/lib/recurring-period";
import { MobileRecurringList } from "@/components/settings/recurring/mobile-recurring-list";
import { MobileRecurringBottomBar } from "@/components/settings/recurring/mobile-recurring-bottom-bar";
import type { CategoryRule } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ProfileSettingsClient } from "./profile-client";
import { ScrollStickyHeader } from "@/components/scroll-sticky-header";
import { PageContainer } from "@/components/page-container";

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

  // Keep active/inactive + auto-delete in step with each item's start/end dates first.
  await syncRecurringLifecycle();

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
    <PageContainer className="px-0 min-h-screen">

      {/* Suppressed in `embedded` mode, where the host renders its own chrome. */}
      {!embedded && (
        <>
          <ScrollStickyHeader
            className="sticky top-[var(--sat)] z-40 flex items-center gap-3 px-4 pt-2 pb-3"
            scrolledClassName="bg-background/80 backdrop-blur-md"
          >
            <div className="flex items-center gap-3 ml-auto">
              {tab === "brandicons" && <BrandIconRuleAddButton variant="icon" />}
            </div>
          </ScrollStickyHeader>
          <div className="px-5 pb-3 pt-3">
            <h1 className="text-2xl font-black tracking-tight text-foreground">{TAB_TITLES[tab] ?? "Settings"}</h1>
            <p className="text-sm text-foreground/60">{TAB_SUBTITLES[tab] ?? ""}</p>
          </div>
        </>
      )}

      {/* scroll-mt clears the sticky top bar so content that gets scrolled or focused
          into view (e.g. after adding an item) never ends up hidden behind it. */}
      <div className="px-5 pb-5 pt-4 space-y-5 scroll-mt-32">

        {/* ── Categories ── */}
        {tab === "categories" && (
          <MobileCategoryList categories={cats} rulesByCat={rulesByCat} banks={allBanks} txCountByCat={txCountByCat} search={catSearch} />
        )}

        {/* ── Recurring ── */}
        {tab === "recurring" && (
          <>

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
                search+add bar (MobileRecurringBottomBar, ~3.5rem tall) that floats
                above the bottom nav — --nav-clearance alone only clears the nav. */}
            <div className="pb-[calc(var(--nav-clearance)+4.5rem)]">
              <MobileRecurringList items={recurringAll} categories={cats} search={recSearch} />
            </div>
            <MobileRecurringBottomBar search={recSearch} />

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
    </PageContainer>
  );
}
