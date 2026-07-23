"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconChartBar as ChartBar,
  IconWallet as Wallet,
  IconExchange as Exchange,
  IconX,
} from "@tabler/icons-react";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { CurrencyConverterDialog } from "@/components/currency-converter-dialog";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { BudgetHeaderActionsProvider, BudgetHeaderActionsSlot } from "@/lib/budget-header-actions";
import { useBudgetPortal } from "@/lib/budget-portal-state";
import { cn } from "@/lib/utils";
import type { User } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { BudgetRecurringMode } from "@/lib/app-settings";
import type { SettingsPanelContent } from "@/app/settings-panel-content";

const REPORT_TABS = [
  { id: "rapporten", label: "Analytics" },
  { id: "trends",    label: "Trends" },
  { id: "vermogen",  label: "Net worth" },
  { id: "prognose",  label: "Forecast" },
] as const;

type ReportTab = typeof REPORT_TABS[number]["id"];

interface ReportsContent {
  rapporten: React.ReactNode;
  trends: React.ReactNode;
  vermogen: React.ReactNode;
  prognose: React.ReactNode;
}

export function DashboardHeaderBar({
  reportsContent,
  budgetContent,
  user,
  settingsPanels,
  financialMonth,
  budgetRecurringMode,
}: {
  reportsContent: ReportsContent;
  budgetContent: React.ReactNode;
  user: User;
  settingsPanels: SettingsPanelContent;
  financialMonth: FinancialMonthConfig;
  budgetRecurringMode: BudgetRecurringMode;
}) {
  // Scroll-aware dim/glassy state
  const [glassy, setGlassy] = useState(false);
  useEffect(() => {
    const anchor = document.getElementById("dash-scroll-anchor");
    if (!anchor) return;
    function check() { setGlassy(anchor!.getBoundingClientRect().top <= 130); }
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  // Reports portal state
  const [reportsOpen, setReportsOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>("rapporten");
  // Once true, tab content is mounted permanently (avoid remounting on re-open)
  const [reportsEverOpened, setReportsEverOpened] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Budget portal state — shared with the dashboard's "left in budget" alert card
  // via BudgetPortalProvider (wraps the whole page), so either can open the same portal.
  const { open: budgetOpen, everOpened: budgetEverOpened, openBudget, closeBudget } = useBudgetPortal();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal must not render until after mount, to avoid SSR/hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = reportsOpen || budgetOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [reportsOpen, budgetOpen]);

  // Hide the mobile bottom nav (and, via the fade below, the header row) while
  // either full-screen portal is open — otherwise both float above the portal's
  // own z-38 content since the nav sits at z-[60] and the header row at z-40.
  useEffect(() => {
    if (!reportsOpen && !budgetOpen) return;
    return acquireNavHidden();
  }, [reportsOpen, budgetOpen]);

  function openReports() {
    setReportsEverOpened(true);
    setReportsOpen(true);
  }
  function closeReports() { setReportsOpen(false); }

  // Single close handler for the morphing back button — routes to whichever
  // portal is actually open.
  function closeActivePortal() {
    if (reportsOpen) closeReports();
    else if (budgetOpen) closeBudget();
    else if (currencyOpen) setCurrencyOpen(false);
  }

  const dimClass = glassy ? "" : "glass-icon-dim";
  // Any full-screen portal open — the header row (profile + icon buttons) fades
  // out, and the profile button morphs into each portal's own back button.
  const anyPortalOpen = reportsOpen || budgetOpen || currencyOpen;

  const springOut = "cubic-bezier(0.32, 0.72, 0, 1)";
  const springIn  = "cubic-bezier(0.16, 1, 0.3, 1)";

  return (
    <BudgetHeaderActionsProvider>
      {/* ── Header row — fades out as a portal opens, instead of an instant
          visibility cut, so the icon buttons don't vanish before the portal's
          own backdrop/content has faded in over them (matching how the
          Upcoming/Needs-review portals — which don't touch this row at all —
          leave the header visible until it's actually covered). Pointer-events
          are dropped immediately since the portal's own full-screen overlay
          already captures all taps as soon as it opens, well before its
          opacity transition finishes. */}
      <div
        className="flex items-center justify-between gap-3 w-full"
        style={{
          opacity: anyPortalOpen ? 0 : 1,
          transition: anyPortalOpen ? "opacity 200ms ease" : "opacity 200ms ease 160ms",
          pointerEvents: anyPortalOpen ? "none" : "auto",
        }}
      >

        <div className="shrink-0">
          <SettingsDialog
            user={user}
            panels={settingsPanels}
            financialMonth={financialMonth}
            budgetRecurringMode={budgetRecurringMode}
            triggerClassName={dimClass}
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={openBudget}
            className={cn("glass-icon-btn size-11", dimClass)}
            aria-label="Budget"
          >
            <Wallet className="size-6 text-foreground dark:text-gray-300 transition-colors duration-200"/>
          </button>
          <button
            onClick={openReports}
            className={cn("glass-icon-btn size-11", dimClass)}
            aria-label="Analytics"
          >
            <ChartBar className="size-6 text-foreground dark:text-gray-300 transition-colors duration-200"/>
          </button>
          <button
            onClick={() => setCurrencyOpen(true)}
            className={cn("glass-icon-btn size-11", dimClass)}
            aria-label="Currency converter"
          >
            <Exchange className="size-6 text-foreground dark:text-gray-300 transition-colors duration-200"/>
          </button>
        </div>
      </div>

      <CurrencyConverterDialog open={currencyOpen} onOpenChange={setCurrencyOpen} />

      {/* ── Reports portal — always mounted once so opacity transitions work ──
          z-45: above the dashboard's own sticky header row (page.tsx, z-40) — that
          wrapper is transparent while a portal is open but still captures clicks over
          its own bounding box, which otherwise swallows taps on this portal's back
          button since both sit in roughly the same top strip of the screen. */}
      {mounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-x-0 bottom-0 bg-background"
            style={{
              top: 0,
              zIndex: 45,
              opacity: reportsOpen ? 1 : 0,
              pointerEvents: "none",
              transition: reportsOpen
                ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)"
                : "opacity 320ms ease",
            }}
          />

          {/* Header + tab bar + iframe container */}
          <div
            className="fixed inset-x-0 bottom-0 flex flex-col"
            style={{
              top: 0,
              zIndex: 45,
              opacity: reportsOpen ? 1 : 0,
              transform: reportsOpen ? "translateY(0)" : "translateY(24px)",
              transition: reportsOpen
                ? `opacity 400ms ease 180ms, transform 500ms ${springIn} 160ms`
                : `opacity 220ms ease, transform 260ms ${springOut}`,
              pointerEvents: reportsOpen ? "auto" : "none",
            }}
          >
            {/* Header — back button (returns to dashboard) + centered title */}
            <div className="shrink-0 grid grid-cols-[auto_1fr_auto] items-center px-4 pb-3" style={{ paddingTop: "calc(0.75rem + var(--sat))" }}>
              <button
                type="button"
                onClick={closeActivePortal}
                aria-label="Close"
                className="size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-xs flex items-center justify-center active:scale-[0.97] transition-transform"
              >
                <IconX className="size-5" />
              </button>
              <h1 className="text-lg text-foreground text-center truncate">Analytics</h1>
              <div className="size-11" />
            </div>

            {/* Tab bar */}
            <div className="px-4 pt-1 pb-2 bg-background shrink-0">
              <div className="flex gap-1 p-1 rounded-xl bg-foreground/[0.05]">
                {REPORT_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveReportTab(tab.id)}
                    className={cn(
                      "flex-1 text-sm font-medium py-1.5 rounded-lg transition-all",
                      activeReportTab === tab.id
                        ? "bg-background text-foreground"
                        : "text-foreground/50 hover:text-foreground/70",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content — all preloaded once portal first opens; only active tab visible.
                Each pane is its own scroll container, so AnalyticsFilterBar (rendered inside
                AnalyticsTab/TrendsTab themselves, passed `embedded`) sticks at `top: 0`
                within it — no page-header height to clear here, unlike the standalone
                /reports page. */}
            <div className="flex-1 relative">
              {reportsEverOpened && REPORT_TABS.map((tab) => (
                <div
                  key={tab.id}
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    WebkitOverflowScrolling: "touch",
                    display: activeReportTab === tab.id ? "block" : "none",
                  }}
                >
                  {reportsContent[tab.id]}
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}

      {/* ── Budget portal — overall budget + per-category budgets ── */}
      {mounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-x-0 bottom-0 bg-background"
            style={{
              top: 0,
              zIndex: 45,
              opacity: budgetOpen ? 1 : 0,
              pointerEvents: "none",
              transition: budgetOpen
                ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)"
                : "opacity 320ms ease",
            }}
          />

          {/* Content */}
          <div
            className="fixed inset-x-0 bottom-0 flex flex-col"
            style={{
              top: 0,
              zIndex: 45,
              opacity: budgetOpen ? 1 : 0,
              transform: budgetOpen ? "translateY(0)" : "translateY(24px)",
              transition: budgetOpen
                ? `opacity 400ms ease 180ms, transform 500ms ${springIn} 160ms`
                : `opacity 220ms ease, transform 260ms ${springOut}`,
              pointerEvents: budgetOpen ? "auto" : "none",
            }}
          >
            {/* Header — back button (returns to dashboard) + centered title. The
                title is centered on the whole row via absolute positioning, not
                by balancing the left/right column widths — the right side's
                edit/delete buttons only appear once a budget exists, so a
                width-balanced grid centers the title only when empty and drifts
                off-center as soon as those buttons render. */}
            <div className="relative shrink-0 flex items-center justify-between px-4 pb-3" style={{ paddingTop: "calc(0.75rem + var(--sat))" }}>
              <button
                type="button"
                onClick={closeActivePortal}
                aria-label="Close"
                className="size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-xs flex items-center justify-center active:scale-[0.97] transition-transform"
              >
                <IconX className="size-5" />
              </button>
              <h1 className="absolute inset-x-14 text-lg text-foreground text-center truncate pointer-events-none">Budget</h1>
              <div className="flex items-center gap-2 min-h-11">
                <BudgetHeaderActionsSlot />
              </div>
            </div>
            <div
              className="flex-1 relative overflow-y-auto overflow-x-hidden"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {budgetEverOpened && budgetContent}
            </div>
          </div>
        </>,
        document.body,
      )}
    </BudgetHeaderActionsProvider>
  );
}
