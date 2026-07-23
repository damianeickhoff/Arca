"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import {
  IconLayoutDashboardFilled,
  IconPresentationFilled,
  IconReportMoneyFilled,
  IconReceiptFilled,
  IconCreditCardFilled,
  IconScaleFilled,
  IconChartAreaLineFilled,
  IconFileUploadFilled,
  IconSettingsFilled,
  IconCaretLeftFilled,
  IconCaretLeftRightFilled,
  IconUserFilled,
  IconTransitionRightFilled,
  IconTagFilled,
  IconExchangeFilled,
  IconStarFilled,
  IconCashBanknoteFilled,
  IconAdjustmentsHorizontalFilled,
  IconDotsFilled,
  IconTargetArrow,
  IconPigFilled,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { logoutAction } from "@/app/actions/auth";
import type { User } from "@/db/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const MAIN_NAV: NavItem[] = [
  { href: "/",             label: "Dashboard",    icon: IconLayoutDashboardFilled },
  { href: "/forecast",     label: "Prognose",     icon: IconPresentationFilled },
  { href: "/transactions", label: "Transactions", icon: IconReceiptFilled },
  { href: "/goals",        label: "Goals",        icon: IconTargetArrow },
  { href: "/debts",        label: "Debts",        icon: IconCreditCardFilled },
  { href: "/net-worth",    label: "Net worth",    icon: IconScaleFilled },
  { href: "/trends",       label: "Trends",       icon: IconChartAreaLineFilled },
];

// Savings and Budget are still parked in the Settings menu — shown as a separate
// section there, only visible once you've drilled into Settings.
const SETTINGS_EXTRA_NAV: NavItem[] = [
  { href: "/savings", label: "Savings", icon: IconPigFilled },
  { href: "/budget",  label: "Budget",  icon: IconReportMoneyFilled },
];

const SETTINGS_NAV_BASE: NavItem[] = [
  { href: "/",                        label: "Back",    icon: ChevronLeft },
  { href: "/settings?tab=categories", label: "Categories",  icon: IconTagFilled },
  { href: "/settings?tab=recurring",  label: "Recurring",  icon: IconExchangeFilled },
  { href: "/settings?tab=brandicons", label: "Brand icons",    icon: IconStarFilled },
  { href: "/settings?tab=banks",      label: "Accounts", icon: IconCashBanknoteFilled },
  { href: "/settings?tab=general",    label: "General",       icon: IconAdjustmentsHorizontalFilled },
];

function Logo({ collapsed, subtitle }: { collapsed?: boolean; subtitle: string }) {
  return <BrandMark collapsed={collapsed} subtitle={subtitle} />;
}

export function Nav({ user, subtitle }: { user: User | null; subtitle: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSettings = pathname.startsWith("/settings");
  const activeTab = searchParams.get("tab") ?? "categories";

  // Desktop sidebar collapse state, persisted across visits.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // One-time sync from localStorage; unknowable during SSR, so this can't be
    // computed during render without a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);
  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
  }

  // Decorative background blob only shows on the main dashboard
  useEffect(() => {
    document.documentElement.classList.toggle("show-blob", pathname === "/");
  }, [pathname]);

  if (pathname === "/login" || pathname === "/register" || pathname === "/offline") return null;

  function isActive(item: NavItem): boolean {
    if (isSettings) {
      if (item.href === "/") return false;
      return item.href === `/settings?tab=${activeTab}`;
    }
    return pathname === item.href;
  }

  const navItems = isSettings ? SETTINGS_NAV_BASE : MAIN_NAV;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col bg-sidebar backdrop-blur-3xl backdrop-saturate-150 ring-1 ring-black/[0.06] dark:ring-white/[0.10] shadow-xl shadow-black/5 rounded-3xl h-[calc(100vh-1.5rem)] sticky top-3 m-3 overflow-y-auto overflow-x-visible transition-[width] duration-150",
        collapsed ? "w-17" : "w-72"
      )}>
        <div className={cn("px-4 py-5 flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
          <Logo collapsed={collapsed} subtitle={subtitle} />
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-2 rounded-md text-foreground opacity-70 hover:opacity-100 transition-opacity shrink-0 hover:text-foreground cursor-pointer"
          >
            {collapsed ? <IconCaretLeftRightFilled className="size-5" /> : <IconCaretLeftFilled className="size-5" />}
          </button>
        </div>

        <nav className="flex flex-col px-3 py-3 flex-1">
          {!collapsed && (
            <p className="px-3 py-2 text-xs font-semibold text-foreground uppercase tracking-[0.1em]">
              {isSettings ? "Settings" : "Overview"}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                active={isActive(item)}
                collapsed={collapsed}
              />
            ))}
          </div>
        </nav>

        {isSettings && (
          <div className="px-3 py-3 flex flex-col gap-0.5">
            {!collapsed && (
              <p className="px-3 pt-2 pb-2 text-xs font-semibold text-foreground uppercase tracking-[0.1em]">
                Finance
              </p>
            )}
            {SETTINGS_EXTRA_NAV.map((item) => (
              <NavLink key={item.href} {...item} active={pathname === item.href} collapsed={collapsed} />
            ))}
          </div>
        )}

        {!isSettings && (
          <div className="px-3 py-3 flex flex-col gap-0.5">
            {!collapsed && (
              <p className="px-3 pt-2 pb-2 text-xs font-semibold text-foreground uppercase tracking-[0.1em]">
                Meer
              </p>
            )}
            <NavLink href="/import" label="Import CSV" icon={IconFileUploadFilled} active={pathname === "/import"} collapsed={collapsed} />
            <NavLink href="/settings" label="Settings" icon={IconSettingsFilled} active={false} collapsed={collapsed} />
          </div>
        )}

        {user && (
          <div className="-mt-2 px-3 pb-5 flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <PrivacyToggle variant={collapsed ? "icon" : "row"} />
              <ThemeToggle variant={collapsed ? "icon" : "row"} />
            </div>
            <div className={collapsed ? undefined : "mx-1.5"}>
              <UserCard user={user} collapsed={collapsed} />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

// ── UserCard ─────────────────────────────────────────────────────────────────

function UserCard({ user, collapsed, compact, onNavigate }: { user: User; collapsed: boolean; compact?: boolean; onNavigate?: () => void }) {
  const initial = user.name.charAt(0).toUpperCase();

  const avatar = user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatarUrl} alt={user.name} className={cn("max-w-none rounded-full object-cover shrink-0", compact ? "size-10" : "size-12")} />
  ) : (
    <div className={cn("rounded-full bg-foreground/10 text-foreground flex items-center justify-center text-sm font-semibold shrink-0", compact ? "size-10" : "size-12")}>
      {initial}
    </div>
  );

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-center w-full rounded-md p-1 bg-destructive/20 transition-colors" title={user.name}>
          {avatar}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="min-w-48 ring-0 border-none">
          <DropdownMenuLinkItem render={<Link href="/settings?tab=profile" onClick={onNavigate} />} className="flex items-center gap-2">
            <IconUserFilled className="size-4" />
            Profile
          </DropdownMenuLinkItem>
          <DropdownMenuItem variant="destructive" className="bg-destructive/10 dark:bg-destructive/15" onClick={() => { onNavigate?.(); logoutAction(); }}>
            <IconTransitionRightFilled className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-2.5 border border-border rounded-full",
      compact ? "px-2 py-2" : "px-3 py-3"
    )}>
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
        <p className="text-xs text-foreground truncate">{user.email}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(
          "rounded-xl hover:bg-foreground/5 text-foreground hover:text-foreground bg-transparent transition-colors shrink-0",
          compact ? "p-2" : "p-2.5"
        )} title="Menu">
          <IconDotsFilled className={compact ? "size-5" : "size-6"} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48 ring-0 border-none">
          <DropdownMenuLinkItem render={<Link href="/settings?tab=profile" onClick={onNavigate} />} className="flex items-center gap-2">
            <IconUserFilled className="size-4" />
            Profile
          </DropdownMenuLinkItem>
          <DropdownMenuItem variant="destructive" className="bg-destructive/10 dark:bg-destructive/15" onClick={() => { onNavigate?.(); logoutAction(); }}>
            <IconTransitionRightFilled className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  className,
  collapsed,
  compact,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  collapsed?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center rounded-xl font-medium transition-all duration-150",
        compact ? "gap-2.5 px-3 py-2 text-sm" : "gap-3 px-3 py-2.5 text-base",
        collapsed && "justify-center px-2.5",
        active
          ? "text-foreground font-semibold dark:bg-white/10"
          : "text-foreground/40 hover:text-foreground",
        className
      )}
    >
      {active && (
        <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-3.5 w-2.5 rounded-r-full bg-foreground dark:bg-white" />
      )}
      <span className={cn(
        "flex items-center justify-center rounded-lg shrink-0",
        compact ? "size-7" : "size-8",
        active ? "text-foreground" : "text-foreground/40 group-hover:text-foreground"
      )}>
        <Icon className={compact ? "size-4" : "size-4.5"} />
      </span>
      {!collapsed && label}
    </Link>
  );
}


