"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCurrencyEuro, IconFileUpload, IconPlus, IconSettings } from "@tabler/icons-react";
import { AnchoredTip } from "@/components/anchored-tip";
import { useNavHidden } from "@/lib/nav-visibility";
import { formatEurSignFirst } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  NAV_ITEMS,
  PLAN_ITEMS,
  activeNavKey,
  activePlanKey,
  isChromeless,
  type NavItem,
} from "@/components/shell/nav-config";
import { SearchProvider } from "@/components/shell/search-context";

export interface ShellAccount {
  key: string;
  name: string;
  balance: number;
}

export interface ShellUser {
  name: string;
  email: string;
  avatarUrl: string | null;
}

// The redesigned app shell — one responsive implementation, no separate mobile files.
//
//   Phones (< lg): a floating tab bar at the bottom-left holding Home · Activity · Plan
//   · Insights (only the active tab shows its label, in a mustard capsule) and a
//   separate round ink "add" button at the bottom-right.
//   Desktop (lg+): a 240px sidebar with the wordmark, the same four destinations, the
//   Plan sub-menu while a Plan page is open, the accounts with their balances, and
//   Import CSV / Settings / the user at the bottom.
//
// Page content keeps clear of both via MainContent (sidebar offset) and the
// --nav-clearance bottom padding (tab bar), see globals.css.
//
// LAYOUT RULE: pages never set their own max width or centre themselves — they fill
// everything right of the sidebar (no cap, at every width). Use
// <PageShell> and the column constants in components/page-container.tsx; see AGENTS.md.
export function AppShell({
  children,
  accounts,
  user,
  subtitle,
}: {
  children: React.ReactNode;
  accounts: ShellAccount[];
  user: ShellUser | null;
  subtitle?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navHidden = useNavHidden();

  const chromeless = isChromeless(pathname) || searchParams.get("embed") === "1" || user == null;

  return (
    <SearchProvider enabled={!chromeless}>
      {children}
      {!chromeless && (
        <>
          <DesktopSidebar pathname={pathname} accounts={accounts} user={user!} subtitle={subtitle} />
          {!navHidden && <PhoneTabBar pathname={pathname} />}
          {/* The new navigation announces itself once, even to someone who turned tips
              off before it existed (see IGNORES_DISABLED in lib/tips.ts). */}
          <AnchoredTip id="newNavigation" anchor="mainNav" active={!navHidden} />
        </>
      )}
    </SearchProvider>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="heading inline-flex items-center gap-2 text-2xl font-extrabold tracking-[-0.03em] text-ink">
      <span className="inline-flex size-[25px] items-center justify-center rounded-full bg-mustard text-mustard-ink">
        <IconCurrencyEuro size={15} stroke={2} />
      </span>
      Arca
    </Link>
  );
}

function PhoneTabBar({ pathname }: { pathname: string }) {
  const t = useTranslations("nav");
  const active = activeNavKey(pathname);

  return (
    <>
      <nav
        aria-label={t("main")}
        data-tip-anchor="mainNav"
        className="fixed left-4 right-[84px] z-[60] flex h-[60px] items-center justify-between rounded-[30px] border border-line bg-surface p-2 shadow-float lg:hidden"
        style={{ bottom: "calc(20px + var(--sab))" }}
      >
        {NAV_ITEMS.map((item) => (
          <PhoneTab key={item.key} item={item} active={item.key === active} label={t(item.key)} />
        ))}
      </nav>
      <Link
        href="/transactions/add"
        aria-label={t("addTransaction")}
        className="fixed right-4 z-[60] inline-flex size-[60px] items-center justify-center rounded-full bg-ink text-bg shadow-float transition-transform active:scale-95 lg:hidden"
        style={{ bottom: "calc(20px + var(--sab))" }}
      >
        <IconPlus size={26} stroke={1.8} />
      </Link>
    </>
  );
}

function PhoneTab({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
  const { Icon } = item;
  if (active) {
    return (
      <Link
        href={item.href}
        aria-current="page"
        className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-mustard pl-3 pr-3.5 text-[13px] font-bold text-mustard-ink"
      >
        <Icon size={20} stroke={1.8} />
        {label}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      aria-label={label}
      className="inline-flex size-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
    >
      <Icon size={22} stroke={1.8} />
    </Link>
  );
}

function DesktopSidebar({
  pathname,
  accounts,
  user,
  subtitle,
}: {
  pathname: string;
  accounts: ShellAccount[];
  user: ShellUser;
  subtitle?: string;
}) {
  const t = useTranslations("nav");
  const active = activeNavKey(pathname);
  const activePlan = activePlanKey(pathname);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-4 py-6 lg:flex">
      <div className="flex flex-col gap-1 px-2">
        <Wordmark />
        {subtitle && <span className="pl-[33px] text-xs text-ink-3">{subtitle}</span>}
      </div>

      <nav aria-label={t("main")} data-tip-anchor="mainNav" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          const { Icon } = item;
          return (
            <div key={item.key} className="flex flex-col">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-[42px] items-center gap-3 rounded-full px-3 text-sm font-semibold transition-colors",
                  isActive ? "bg-mustard-soft text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                <Icon size={19} stroke={1.8} />
                {t(item.key)}
                {isActive && <span aria-hidden className="ml-auto size-2 rounded-full bg-mustard" />}
              </Link>
              {item.key === "plan" && isActive && (
                <div className="flex flex-col gap-0.5 pb-1.5 pl-5 pt-0.5">
                  {PLAN_ITEMS.map((sub) => {
                    const subActive = sub.key === activePlan;
                    const SubIcon = sub.Icon;
                    return (
                      <Link
                        key={sub.key}
                        href={sub.href}
                        aria-current={subActive ? "page" : undefined}
                        className={cn(
                          "flex h-9 items-center gap-2.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                          subActive ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
                        )}
                      >
                        <SubIcon size={16} stroke={1.8} />
                        {t(`planItems.${sub.key}`)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {accounts.length > 0 && (
        <div className="flex flex-col gap-2 px-1">
          <span className="mono-label px-2">{t("accounts")}</span>
          <div className="flex flex-col">
            {accounts.map((a) => (
              <Link
                key={a.key}
                href="/settings?tab=banks"
                className="flex h-7 items-center justify-between gap-2 rounded-full px-2 hover:bg-surface-2"
              >
                <span className="truncate text-[13px] text-ink-2">{a.name}</span>
                <span className="shrink-0 text-xs font-medium tabular-nums text-ink-2">{formatEurSignFirst(a.balance)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-0.5">
        <Link
          href="/import"
          className="flex h-10 items-center gap-3 rounded-full px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <IconFileUpload size={18} stroke={1.8} />
          {t("importCsv")}
        </Link>
        <Link
          href="/settings"
          className="flex h-10 items-center gap-3 rounded-full px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <IconSettings size={18} stroke={1.8} />
          {t("settings")}
        </Link>
        <div className="flex items-center gap-2.5 px-3 pt-2.5">
          <UserAvatar user={user} size={32} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-ink">{user.name}</span>
            <span className="truncate text-[11px] text-ink-3">{user.email}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

export function UserAvatar({ user, size = 36 }: { user: Pick<ShellUser, "name" | "avatarUrl">; size?: number }) {
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar served from /uploads
      <img
        src={user.avatarUrl}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="heading inline-flex shrink-0 items-center justify-center rounded-full bg-mustard text-mustard-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {user.name.trim().charAt(0).toUpperCase() || "A"}
    </span>
  );
}
