"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCurrencyEuro, IconFileUpload, IconLogout, IconPlus, IconSettings } from "@tabler/icons-react";
import { AnchoredTip } from "@/components/anchored-tip";
import { Segmented } from "@/components/clear/segmented";
import { logoutAction } from "@/app/actions/auth";
import { useNavHidden } from "@/lib/nav-visibility";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, PLAN_ITEMS, activeNavKey, activePlanKey, isChromeless, type NavItem } from "@/components/shell/nav-config";
import { SearchProvider } from "@/components/shell/search-context";

export interface ShellUser {
  name: string;
  email: string;
  avatarUrl: string | null;
}

// The Clear app shell — one responsive implementation, no separate mobile files.
//
//   Desktop (lg+): a floating white sidebar on the left — the logo, who is signed in,
//   the four destinations (Plan opens its Budget · Debts · Goals sub-menu while one of
//   them is showing, Activity carries the needs-a-category count), then Import CSV,
//   Settings, the theme and Sign out. Pages sit to its right (MainContent).
//   Phones (< lg): a floating black tab bar with the four destinations and the ember
//   add button in the middle.
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

  const chromeless = isChromeless(pathname) || searchParams.get("embed") === "1" || user == null;

  return (
    <SearchProvider enabled={!chromeless}>
      {children}
      {!chromeless && (
        <>
          <DesktopSidebar pathname={pathname} user={user!} needsReviewCount={needsReviewCount} />
          {!navHidden && <PhoneTabBar pathname={pathname} />}
          {/* The navigation changed; it announces itself once, even to someone who
              turned tips off (see IGNORES_DISABLED). */}
          <AnchoredTip id="clearNavigation" anchor="mainNav" active={!navHidden} />
        </>
      )}
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

function DesktopSidebar({ pathname, user, needsReviewCount }: { pathname: string; user: ShellUser; needsReviewCount: number }) {
  const t = useTranslations("nav");
  const active = activeNavKey(pathname);
  const activePlan = activePlanKey(pathname);
  const { mode, setMode } = useTheme();

  const row = "flex h-12 items-center gap-3 rounded-clear-row px-3.5 text-[15px] no-underline transition-colors";
  const idle = "font-semibold text-clear-ink-2 hover:bg-clear-tile hover:text-clear-ink";

  return (
    <aside className="fixed inset-y-4 left-4 z-40 hidden w-[260px] flex-col gap-6 overflow-y-auto rounded-clear-card bg-clear-card px-5 py-7 font-clear text-clear-ink lg:flex">
      <Wordmark className="px-2" />

      <Link href="/settings" className="flex flex-col items-center gap-2 rounded-clear-tile px-2 py-3 text-center text-clear-ink no-underline transition-colors hover:bg-clear-tile">
        <UserAvatar user={user} size={72} />
        <span className="flex min-w-0 max-w-full flex-col">
          <span className="truncate text-[17px] font-extrabold tracking-[-0.01em]">{user.name}</span>
          <span className="truncate text-[13px] text-clear-muted">{user.email}</span>
        </span>
      </Link>

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
              {item.key === "plan" && isActive && (
                <div className="flex flex-col gap-0.5 pb-1 pl-[46px]">
                  {PLAN_ITEMS.map((sub) => (
                    <Link
                      key={sub.key}
                      href={sub.href}
                      aria-current={sub.key === activePlan ? "page" : undefined}
                      className={cn(
                        "flex h-10 items-center rounded-clear-row px-3 text-sm no-underline transition-colors",
                        sub.key === activePlan ? "bg-clear-tile font-bold text-clear-ink" : "font-semibold text-clear-muted hover:text-clear-ink",
                      )}
                    >
                      {t(`planItems.${sub.key}`)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <span aria-hidden className="mb-3 h-px bg-clear-line" />
        <Link href="/import" className={cn(row, idle)}>
          <IconFileUpload size={20} stroke={1.9} aria-hidden />
          {t("importCsv")}
        </Link>
        <Link href="/settings" className={cn(row, pathname.startsWith("/settings") ? "bg-clear-primary font-bold text-clear-primary-ink" : idle)}>
          <IconSettings size={20} stroke={1.9} aria-hidden />
          {t("settings")}
        </Link>
        <div className="flex flex-col gap-2 px-3.5 py-2.5">
          <span className="text-[13px] font-bold text-clear-muted">{t("theme.label")}</span>
          <Segmented<ThemeMode>
            label={t("theme.label")}
            surface="tile"
            size="sm"
            value={mode}
            onChange={setMode}
            items={[
              { value: "light", label: t("theme.light") },
              { value: "system", label: t("theme.system") },
              { value: "dark", label: t("theme.dark") },
            ]}
          />
        </div>
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
      className="fixed inset-x-4 z-[60] flex h-[68px] items-center justify-between rounded-full bg-clear-primary px-2 font-clear shadow-clear-float lg:hidden"
      style={{ bottom: "calc(20px + var(--sab))" }}
    >
      <PhoneTab item={first} active={first.key === active} label={t(first.key)} />
      <PhoneTab item={second} active={second.key === active} label={t(second.key)} />
      <Link
        href="/transactions/add"
        aria-label={t("addTransaction")}
        className="inline-flex size-[54px] items-center justify-center rounded-full bg-clear-ember text-clear-ember-ink transition-transform active:scale-95"
      >
        <IconPlus size={24} stroke={2.6} />
      </Link>
      {rest.map((item) => (
        <PhoneTab key={item.key} item={item} active={item.key === active} label={t(item.key)} />
      ))}
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
        "inline-flex h-[52px] w-16 flex-col items-center justify-center gap-0.5 rounded-full text-xs transition-colors",
        active ? "bg-clear-card font-extrabold text-clear-ink" : "font-semibold text-clear-primary-ink/80",
      )}
    >
      <Icon size={20} stroke={2} />
      {label}
    </Link>
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
