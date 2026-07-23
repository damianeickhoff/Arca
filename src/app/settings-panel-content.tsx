import { Suspense } from "react";
import { db } from "@/db";
import { categories, categoryRules, banks, recurringItems, brandIconRules, vermogenAccounts, users } from "@/db/schema";
import type { CategoryRule } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { CategoriesClient } from "@/components/settings/categories/categories-client";
import { RecurringMenuClient } from "@/components/settings/recurring/recurring-menu-client";
import { AccountsOverviewClient } from "@/components/settings/accounts/accounts-overview-client";
import { BrandIconsClient } from "@/app/settings/brand-icons-client";
import { UsersClient } from "@/components/settings/users-client";
import { getBankBalances, getAccountBalanceHistory } from "@/lib/account-balances";
import { getBillStatuses } from "@/lib/bill-status";
import { disableExpiredRecurring } from "@/lib/recurring-period";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth } from "@/lib/date-range";

// Server-rendered content for the data-heavy panels of the settings dialog (opened
// from the dashboard profile button). Rendered once as part of the dashboard page
// load and passed down into the client SettingsDialog, which reveals one panel at a
// time. Mirrors app/reports/reports-portal-content.tsx: each panel is its own async
// server component wrapped in <Suspense> so its query streams and never blocks the
// dashboard's initial response.
//
// The Accounts / Categories / Recurring panels render the redesigned clients in
// `embedded` mode (no page header — the dialog panel supplies its own back + title).

function PanelSkeleton() {
  return (
    <div className="space-y-3 px-4 pt-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-2xl bg-foreground/5 animate-pulse" />
      ))}
    </div>
  );
}

async function CategoriesPanel() {
  const [cats, rules, allBanks] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(categoryRules),
    db.select().from(banks).orderBy(asc(banks.displayName)),
  ]);
  const rulesByCat: Record<number, CategoryRule[]> = {};
  for (const rule of rules) (rulesByCat[rule.categoryId] ??= []).push(rule);

  return <CategoriesClient categories={cats} rulesByCat={rulesByCat} banks={allBanks} />;
}

async function RecurringPanel() {
  const financialMonth = await getFinancialMonthConfig();
  const month = currentFinancialMonth(financialMonth);

  // Auto-disable items whose period end has passed before loading the list.
  await disableExpiredRecurring();

  const [recurringAll, cats, statuses] = await Promise.all([
    db.select().from(recurringItems).orderBy(recurringItems.type, recurringItems.name),
    db.select().from(categories).orderBy(asc(categories.name)),
    getBillStatuses(month, financialMonth),
  ]);

  const dueDateByItemId: Record<number, string> = {};
  for (const s of statuses) if (s.dueDate) dueDateByItemId[s.item.id] = s.dueDate;

  return <RecurringMenuClient items={recurringAll} categories={cats} dueDateByItemId={dueDateByItemId} />;
}

async function AccountsPanel() {
  const [bankBalances, assets, history] = await Promise.all([
    getBankBalances(),
    db
      .select()
      .from(vermogenAccounts)
      .where(eq(vermogenAccounts.active, true))
      .orderBy(asc(vermogenAccounts.type), asc(vermogenAccounts.name)),
    getAccountBalanceHistory(),
  ]);

  return <AccountsOverviewClient banks={bankBalances} assets={assets} history={history} />;
}

async function BrandIconsPanel() {
  const brandRules = await db.select().from(brandIconRules);
  return <BrandIconsClient initialRules={brandRules} />;
}

async function UsersPanel({ currentUserId }: { currentUserId: number }) {
  const allUsers = await db.select().from(users).orderBy(users.email);
  return <UsersClient users={allUsers} currentUserId={currentUserId} />;
}

export function getSettingsPanelContent(currentUser: { id: number; isAdmin: boolean }) {
  return {
    accounts: <Suspense key="accounts" fallback={<PanelSkeleton />}><AccountsPanel /></Suspense>,
    categories: <Suspense key="categories" fallback={<PanelSkeleton />}><CategoriesPanel /></Suspense>,
    recurring: <Suspense key="recurring" fallback={<PanelSkeleton />}><RecurringPanel /></Suspense>,
    brandIcons: <Suspense key="brandIcons" fallback={<PanelSkeleton />}><BrandIconsPanel /></Suspense>,
    // Only fetched/embedded for admins — the row that opens this panel is itself
    // admin-gated in SettingsDialog, so non-admins never get the user list in props.
    ...(currentUser.isAdmin
      ? { users: <Suspense key="users" fallback={<PanelSkeleton />}><UsersPanel currentUserId={currentUser.id} /></Suspense> }
      : {}),
  };
}

export type SettingsPanelContent = ReturnType<typeof getSettingsPanelContent>;
