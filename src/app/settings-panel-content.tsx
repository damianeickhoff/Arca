import { toClientUser } from "@/lib/auth";
import { Suspense } from "react";
import { db } from "@/db";
import { categories, categoryRules, banks, recurringItems, vermogenAccounts, users } from "@/db/schema";
import type { CategoryRule } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { CategoriesClient } from "@/components/settings/categories/categories-client";
import { getCategoryMonthTotals } from "@/lib/category-month-totals";
import { RecurringMenuClient } from "@/components/settings/recurring/recurring-menu-client";
import { AccountsOverviewClient } from "@/components/settings/accounts/accounts-overview-client";
import { MerchantsClient } from "@/components/settings/merchants-client";
import { DataHealthClient } from "@/components/settings/data-health-client";
import { ImportProfilesClient } from "@/components/settings/import-profiles-client";
import { findBrokenDateTransactions } from "@/lib/data-health";
import { listImportProfiles } from "@/lib/import-profiles";
import { listMerchants } from "@/lib/merchants";
import { UsersClient } from "@/components/settings/users-client";
import { listPendingInvites } from "@/lib/invites";
import { getBankBalances, getAccountBalanceHistory } from "@/lib/account-balances";
import { getFinancialMonthConfig, getOverdraftMode } from "@/lib/app-settings";
import { getPlanProgress } from "@/lib/payment-plan-progress";
import { syncRecurringLifecycle } from "@/lib/recurring-period";
import { listActivity } from "@/lib/activity-log";
import { HEAVY_PANELS, type HeavyPanelKey } from "@/components/settings/settings-sections";

// Server-rendered content for the data-heavy settings panels. Two hosts:
//   • the phone SettingsDialog (opened from the Home avatar) gets every panel at once
//     (getSettingsPanelContent) and reveals one at a time;
//   • the /settings page renders only the open panel (getSettingsPanel).
// Each panel is its own async server component wrapped in <Suspense> so its query
// streams and never blocks the host page's initial response. The panels draw their
// own header through PanelHeader (settings-panel-chrome.tsx), which adapts to the host.

function PanelSkeleton() {
  return (
    <div className="space-y-3 px-4 pt-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-clear-tile bg-clear-tile animate-pulse" />
      ))}
    </div>
  );
}

async function CategoriesPanel() {
  const [cats, rules, allBanks, { totals, budgets }] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(categoryRules),
    db.select().from(banks).orderBy(asc(banks.displayName)),
    getCategoryMonthTotals(),
  ]);
  const rulesByCat: Record<number, CategoryRule[]> = {};
  for (const rule of rules) (rulesByCat[rule.categoryId] ??= []).push(rule);

  return <CategoriesClient categories={cats} rulesByCat={rulesByCat} banks={allBanks} totals={totals} budgets={budgets} />;
}

async function RecurringPanel() {
  // Auto-disable items whose period end has passed before loading the list.
  await syncRecurringLifecycle();

  const [recurringAll, cats] = await Promise.all([
    db.select().from(recurringItems).orderBy(recurringItems.type, recurringItems.name),
    db.select().from(categories).orderBy(asc(categories.name)),
  ]);

  // The "next" date each row shows is derived client-side from the item's own
  // schedule (see RecurringMenuClient) — the bill-status due date this used to pass
  // is the occurrence within the *current* financial month, i.e. already in the past
  // for anything due earlier this month.
  const planProgress = Object.fromEntries(await getPlanProgress(recurringAll, await getFinancialMonthConfig()));
  return <RecurringMenuClient items={recurringAll} categories={cats} planProgress={planProgress} />;
}

async function AccountsPanel() {
  const [bankBalances, assets, history, overdraftMode] = await Promise.all([
    getBankBalances(),
    db
      .select()
      .from(vermogenAccounts)
      .where(eq(vermogenAccounts.active, true))
      .orderBy(asc(vermogenAccounts.type), asc(vermogenAccounts.name)),
    getAccountBalanceHistory(),
    getOverdraftMode(),
  ]);

  return <AccountsOverviewClient banks={bankBalances} assets={assets} history={history} overdraftMode={overdraftMode} />;
}

/** Merchants: each one's logo, "Recognised by" patterns and category. */
async function MerchantsPanel() {
  const [merchants, allCategories] = await Promise.all([listMerchants(), db.select().from(categories).orderBy(asc(categories.name))]);
  return <MerchantsClient initialMerchants={merchants} categories={allCategories} />;
}

async function DataHealthPanel() {
  return <DataHealthClient rows={await findBrokenDateTransactions()} changes={listActivity()} />;
}

async function ImportProfilesPanel() {
  return <ImportProfilesClient profiles={await listImportProfiles()} />;
}

async function UsersPanel({ currentUserId }: { currentUserId: number }) {
  const [allUsers, invites] = await Promise.all([db.select().from(users).orderBy(users.email), listPendingInvites()]);
  // Only profile fields reach the browser; hashes and TOTP secrets stay on the server.
  return <UsersClient users={allUsers.map(toClientUser)} invites={invites} currentUserId={currentUserId} />;
}

/** One heavy panel's server-rendered content — the /settings page renders only the
 *  open one. Users is admin-only: null for everyone else. */
export function getSettingsPanel(key: HeavyPanelKey, currentUser: { id: number; isAdmin: boolean }): React.ReactNode {
  switch (key) {
    case "accounts":
      return <Suspense key="accounts" fallback={<PanelSkeleton />}><AccountsPanel /></Suspense>;
    case "categories":
      return <Suspense key="categories" fallback={<PanelSkeleton />}><CategoriesPanel /></Suspense>;
    case "recurring":
      return <Suspense key="recurring" fallback={<PanelSkeleton />}><RecurringPanel /></Suspense>;
    case "merchants":
      return <Suspense key="merchants" fallback={<PanelSkeleton />}><MerchantsPanel /></Suspense>;
    case "dataHealth":
      return <Suspense key="dataHealth" fallback={<PanelSkeleton />}><DataHealthPanel /></Suspense>;
    case "importProfiles":
      return <Suspense key="importProfiles" fallback={<PanelSkeleton />}><ImportProfilesPanel /></Suspense>;
    case "users":
      return currentUser.isAdmin
        ? <Suspense key="users" fallback={<PanelSkeleton />}><UsersPanel currentUserId={currentUser.id} /></Suspense>
        : null;
  }
}

/** Every heavy panel, for the phone SettingsDialog (which can open any of them). Users
 *  is only fetched/embedded for admins — its row is admin-gated too, so non-admins
 *  never get the user list in props. */
export function getSettingsPanelContent(currentUser: { id: number; isAdmin: boolean }): SettingsPanelContent {
  const keys = HEAVY_PANELS.filter((key) => key !== "users" || currentUser.isAdmin);
  return Object.fromEntries(keys.map((key) => [key, getSettingsPanel(key, currentUser)]));
}

export type SettingsPanelContent = Partial<Record<HeavyPanelKey, React.ReactNode>>;
