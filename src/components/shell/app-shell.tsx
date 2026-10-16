"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCurrencyEuro, IconDeviceDesktop, IconFileUpload, IconLogout, IconMoon, IconPlus, IconSearch, IconSettings, IconSun } from "@tabler/icons-react";
import { AnchoredTip } from "@/components/anchored-tip";
import { logoutAction } from "@/app/actions/auth";
import { useNavHidden } from "@/lib/nav-visibility";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, PLAN_ITEMS, activeNavKey, activePlanKey, isChromeless, type NavItem } from "@/components/shell/nav-config";
import { SearchProvider, useGlobalSearch } from "@/components/shell/search-context";
import { ConfirmProvider } from "@/components/clear/confirm-dialog";
import { INSIGHTS_TABS, INSIGHTS_TAB_LABEL_KEY } from "@/app/reports/reports-tabs";
import { useIsDesktop } from "@/lib/use-is-desktop";

export interface ShellUser {
  name: string;
  email: string;
  avatarUrl: string | null;
}

// The Clear app shell — one responsive implementation, no separate mobile files.
//
//   Desktop (lg+): a floating white sidebar on the left — the logo, who is signed in,
//   "Search everything" (the global search, also Ctrl/Cmd+K), the four destinations
//   (Plan opens its Budget · Debts · Goals sub-menu while one of them is showing,
//   Insights its five tabs while it is open, Activity carries the needs-a-category
//   count), then Import CSV,
//   Settings, the theme and Sign out. Pages sit to its right (MainContent).
//   Phones (< lg): a floating black tab bar with the four destinations, the ember
//   add button in the middle and, set apart at the end, the global search button.
//   Search lives in the shell rather than in page headers so it never reads as
//   "search this page".
//
// Page layout rules are in AGENTS.md ("Clear design system").
export function AppShell({
  children,
  user,
  needsReviewCount,
}: {
  children: React.ReactNode;
  user: ShellUser | null;
  needsReviewCount: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navHidden = useNavHidden();
  const isDesktop = useIsDesktop();

  const chromeless = isChromeless(pathname) || searchParams.get("embed") === "1" || user == null;

  return (
    <SearchProvider enabled={!chromeless}>
      {/* The one confirm dialog behind useConfirm() (components/clear/confirm-dialog). */}
      <ConfirmProvider>
        {children}
        {!chromeless && (
          <>
            <DesktopSidebar pathname={pathname} insightsTab={searchParams.get("tab") ?? "rapporten"} user={user!} needsReviewCount={needsReviewCount} />
            {!navHidden && <PhoneTabBar pathname={pathname} />}
            {/* The navigation changed; it announces itself once, even to someone who
                turned tips off (see IGNORES_DISABLED). */}
            <AnchoredTip id="clearNavigation" anchor="mainNav" active={!navHidden} />
            {/* Search moved out of the page headers into the shell. */}
            <AnchoredTip id="globalSearch" anchor={isDesktop ? "globalSearch" : "globalSearchPhone"} active={!navHidden} />
          </>
        )}
      </ConfirmProvider>
    </SearchProvider>
  );
}

/** The Arca logo: an ember coin with the euro sign, then the name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5 font-clear text-[19px] font-extrabold tracking-[-0.02em] text-clear-ink no-underline", className)}>
      <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-full bg-clear-ember text-clear-ember-ink">
        <IconCurrencyEuro size={22} stroke={2.4} />
      </span>
      Arca
    </Link>
  );
}

const NEXT_THEME: Record<ThemeMode, ThemeMode> = { light: "dark", dark: "system", system: "light" };

function DesktopSidebar({
  pathname,
  insightsTab,
  user,
  needsReviewCount,
}: {
  pathname: string;
  /** The open Insights tab (?tab=), for its sub-menu. */
  insightsTab: string;
  user: ShellUser;
  needsReviewCount: number;
}) {
  const t = useTranslations("nav");
  const tInsights = useTranslations("insights.tabs");
  const active = activeNavKey(pathname);
  const activePlan = activePlanKey(pathname);
  const { mode, setMode } = useTheme();

  // Rows grow with the window: 40px below 800px of height, 44px from 800px, 48px from 900px.
  const row =
    "flex h-10 items-center gap-3 rounded-clear-row px-3.5 text-[15px] no-underline transition-colors [@media(min-height:800px)]:h-11 [@media(min-height:900px)]:h-12";
  const idle = "font-semibold text-clear-ink-2 hover:bg-clear-tile hover:text-clear-ink";

  return (
    // A full-height panel flush with the window's left edge, a hairline on its right.
    // Sized by the window's height rather than its width, so it fits a 1536×864 laptop at
    // 125% (about 730px of page) as well as 1080p, 1440p and 4K: compact below 800px,
    // roomier from 800px, the full layout with the logo from 900px. Below ~650px a long
    // menu (Insights open) scrolls inside the sidebar.
    <aside className="clear-scrollbar fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col gap-3 overflow-y-auto border-r border-clear-line bg-clear-card px-4 py-4 font-clear text-clear-ink lg:flex [@media(min-height:800px)]:gap-4 [@media(min-height:800px)]:py-5 [@media(min-height:900px)]:gap-6 [@media(min-height:900px)]:px-5 [@media(min-height:900px)]:py-7">
      <Wordmark className="hidden px-2 [@media(min-height:900px)]:inline-flex" />

      <Link
        href="/settings"
        className="flex shrink-0 items-center gap-3 rounded-clear-tile px-2 py-2 text-left text-clear-ink no-underline transition-colors hover:bg-clear-tile [@media(min-height:900px)]:flex-col [@media(min-height:900px)]:gap-2 [@media(min-height:900px)]:py-3 [@media(min-height:900px)]:text-center"
      >
        <span className="contents [@media(min-height:900px)]:hidden">
          <UserAvatar user={user} size={40} />
        </span>
        <span className="hidden [@media(min-height:900px)]:contents">
          <UserAvatar user={user} size={72} />
        </span>
        <span className="flex min-w-0 max-w-full flex-1 flex-col">
          <span className="truncate text-[15px] font-extrabold tracking-[-0.01em] [@media(min-height:900px)]:text-[17px]">{user.name}</span>
          <span className="truncate text-[13px] text-clear-muted">{user.email}</span>
        </span>
      </Link>

      <SidebarSearch />

      <span aria-hidden className="h-px bg-clear-line" />

      <nav aria-label={t("main")} data-tip-anchor="mainNav" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          const { Icon } = item;
          return (
            <div key={item.key} className="flex flex-col gap-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(row, isActive ? "bg-clear-primary font-bold text-clear-primary-ink" : idle)}
              >
                <Icon size={20} stroke={1.9} aria-hidden />
                <span className="flex-1">{t(item.key)}</span>
                {item.key === "activity" && needsReviewCount > 0 && (
                  <span
                    aria-label={t("needsReviewBadge", { count: needsReviewCount })}
                    className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-clear-ember px-1.5 text-xs font-extrabold text-clear-ember-ink"
                  >
                    {needsReviewCount}
                  </span>
                )}
              </Link>
              {/* Plan shows its three pages and Insights its five tabs while open. */}
              {isActive && (item.key === "plan" || item.key === "insights") && (
                <div className="flex flex-col gap-0.5 pb-1 pl-[46px]">
                  {(item.key === "plan"
                    ? PLAN_ITEMS.map((sub) => ({ key: sub.key, href: sub.href, label: t(`planItems.${sub.key}`), current: sub.key === activePlan }))
                    : INSIGHTS_TABS.map((id) => ({
                        key: id,
                        href: `/reports?tab=${id}`,
                        label: tInsights(INSIGHTS_TAB_LABEL_KEY[id]),
                        current: pathname.startsWith("/reports") && id === insightsTab,
                      }))
                  ).map((sub) => (
                    <Link
                      key={sub.key}
                      href={sub.href}
                      aria-current={sub.current ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center rounded-clear-row px-3 text-sm no-underline transition-colors [@media(min-height:900px)]:h-10",
                        sub.current ? "bg-clear-tile font-bold text-clear-ink" : "font-semibold text-clear-muted hover:text-clear-ink",
                      )}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <span aria-hidden className="mb-1 h-px bg-clear-line [@media(min-height:900px)]:mb-3" />
        <Link href="/import" className={cn(row, idle)}>
          <IconFileUpload size={20} stroke={1.9} aria-hidden />
          {t("importCsv")}
        </Link>
        <Link href="/settings" className={cn(row, pathname.startsWith("/settings") ? "bg-clear-primary font-bold text-clear-primary-ink" : idle)}>
          <IconSettings size={20} stroke={1.9} aria-hidden />
          {t("settings")}
        </Link>
        {/* One button: each tap moves light → dark → system; the row says which is on. */}
        <button
          type="button"
          onClick={() => setMode(NEXT_THEME[mode])}
          aria-label={t("theme.cycle", { mode: t(`theme.${mode}`) })}
          className={cn(row, idle, "w-full cursor-pointer")}
        >
          {mode === "light" ? <IconSun size={20} stroke={1.9} aria-hidden /> : mode === "dark" ? <IconMoon size={20} stroke={1.9} aria-hidden /> : <IconDeviceDesktop size={20} stroke={1.9} aria-hidden />}
          <span className="flex-1 text-left">{t("theme.label")}</span>
          <span className="text-[13px] font-bold text-clear-muted">{t(`theme.${mode}`)}</span>
        </button>
        <button
          type="button"
          onClick={() => logoutAction()}
          className={cn(row, "cursor-pointer font-semibold text-clear-negative hover:bg-clear-tile")}
        >
          <IconLogout size={20} stroke={1.9} aria-hidden />
          {t("signOut")}
        </button>
      </div>
    </aside>
  );
}

function PhoneTabBar({ pathname }: { pathname: string }) {
  const t = useTranslations("nav");
  const active = activeNavKey(pathname);
  // Two destinations either side of the add button.
  const [first, second, ...rest] = NAV_ITEMS;

  return (
    <nav
      aria-label={t("main")}
      data-tip-anchor="mainNav"
      className="fixed inset-x-4 z-[60] flex h-[68px] items-center justify-between gap-0.5 rounded-full bg-clear-primary px-2 font-clear shadow-clear-float lg:hidden"
      style={{ bottom: "calc(20px + var(--sab))" }}
    >
      <PhoneTab item={first} active={first.key === active} label={t(first.key)} />
      <PhoneTab item={second} active={second.key === active} label={t(second.key)} />
      <Link
        href="/transactions/add"
        aria-label={t("addTransaction")}
        className="inline-flex size-[54px] shrink-0 items-center justify-center rounded-full bg-clear-ember text-clear-ember-ink transition-transform active:scale-95"
      >
        <IconPlus size={24} stroke={2.6} />
      </Link>
      {rest.map((item) => (
        <PhoneTab key={item.key} item={item} active={item.key === active} label={t(item.key)} />
      ))}
      <span aria-hidden className="mx-1 h-8 w-px shrink-0 bg-clear-primary-ink/15" />
      <PhoneSearch />
    </nav>
  );
}

function PhoneTab({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-xs transition-colors",
        active ? "bg-clear-card font-extrabold text-clear-ink" : "font-semibold text-clear-primary-ink/80",
      )}
    >
      <Icon size={20} stroke={2} />
      {label}
    </Link>
  );
}

// "⌘K" on Apple devices, "Ctrl K" elsewhere (and on the server, before hydration).
const subscribeNever = () => () => {};
function useShortcutLabel() {
  return useSyncExternalStore(
    subscribeNever,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

/** The sidebar's global search: looks like a field, opens the search overlay. */
function SidebarSearch() {
  const t = useTranslations("nav");
  const { openSearch } = useGlobalSearch();
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={(e) => openSearch(e.currentTarget.getBoundingClientRect())}
      data-tip-anchor="globalSearch"
      className="flex h-10 w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-full bg-clear-tile pl-4 pr-2 text-left text-sm font-semibold text-clear-muted transition-colors hover:bg-clear-line hover:text-clear-ink [@media(min-height:900px)]:h-11"
    >
      <IconSearch size={18} stroke={2} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{t("searchEverything")}</span>
      <kbd className="rounded-md bg-clear-card px-1.5 py-0.5 font-clear text-xs font-bold text-clear-muted">{shortcut}</kbd>
    </button>
  );
}

/** The phone tab bar's global search button, set apart at the end of the bar. */
function PhoneSearch() {
  const t = useTranslations("nav");
  const { openSearch } = useGlobalSearch();
  return (
    <button
      type="button"
      onClick={(e) => openSearch(e.currentTarget.getBoundingClientRect())}
      aria-label={t("searchEverything")}
      data-tip-anchor="globalSearchPhone"
      className="inline-flex size-[52px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-primary-ink/12 text-clear-primary-ink transition-transform active:scale-95"
    >
      <IconSearch size={22} stroke={2.2} />
    </button>
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
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-clear-peach font-clear font-extrabold text-clear-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(user.name)}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}
