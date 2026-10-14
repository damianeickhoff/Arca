import {
  IconChartBar,
  IconCompass,
  IconCreditCard,
  IconHome,
  IconListDetails,
  IconTarget,
  IconWallet,
} from "@tabler/icons-react";

// The redesigned information architecture, shared by the phone tab bar and the
// desktop sidebar so both always agree on what is active:
//
//   Home      /
//   Activity  /transactions (and everything under it)
//   Plan      a hub over /budget, /debts and /goals (segmented switch on each)
//   Insights  /reports, with its Overview · Trends · Net worth · Forecast · Health tabs
//
// Labels are translation keys in the `nav` namespace.

export type NavKey = "home" | "activity" | "plan" | "insights";
export type PlanKey = "budget" | "debts" | "goals";

type IconComponent = React.ComponentType<{ size?: number; stroke?: number; className?: string }>;

export interface NavItem {
  key: NavKey;
  href: string;
  Icon: IconComponent;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", href: "/", Icon: IconHome },
  { key: "activity", href: "/transactions", Icon: IconListDetails },
  // Plan opens on Budget; the segmented switch on each Plan page moves between the three.
  { key: "plan", href: "/budget", Icon: IconCompass },
  { key: "insights", href: "/reports", Icon: IconChartBar },
];

export interface PlanItem {
  key: PlanKey;
  href: string;
  Icon: IconComponent;
}

export const PLAN_ITEMS: PlanItem[] = [
  { key: "budget", href: "/budget", Icon: IconWallet },
  { key: "debts", href: "/debts", Icon: IconCreditCard },
  { key: "goals", href: "/goals", Icon: IconTarget },
];

function under(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Which Plan page the path belongs to, or null outside the Plan hub. */
export function activePlanKey(pathname: string): PlanKey | null {
  return PLAN_ITEMS.find((p) => under(pathname, p.href))?.key ?? null;
}

/** Which top-level destination the path belongs to, or null (settings, import, …). */
export function activeNavKey(pathname: string): NavKey | null {
  if (pathname === "/") return "home";
  if (under(pathname, "/transactions")) return "activity";
  if (activePlanKey(pathname)) return "plan";
  // The standalone Trends / Net worth / Forecast routes are Insights tabs too.
  if (["/reports", "/trends", "/net-worth", "/forecast"].some((base) => under(pathname, base))) return "insights";
  return null;
}

/** Routes that render without any app chrome (auth and the offline fallback). */
export function isChromeless(pathname: string) {
  return pathname === "/login" || pathname === "/register" || pathname === "/offline";
}
