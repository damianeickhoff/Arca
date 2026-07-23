import { cookies } from "next/headers";
import { getDateRange } from "@/lib/date-range";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { TrendsTab, VermogenTab } from "./report-tabs";
import { AnalyticsTab } from "./analytics-tab";
import ForecastPage from "@/app/forecast/page";

// Server-rendered content for the reports subpage on the mobile dashboard.
// Rendered once as part of the dashboard page load and passed down into the
// client-side DashboardHeaderBar, which toggles visibility between tabs.
export async function getReportsPortalContent(params?: { cmpA?: string; cmpB?: string; cat?: string; acct?: string; month?: string }) {
  const cookieStore = await cookies();
  const financialMonth = await getFinancialMonthConfig();
  const { from, to } = getDateRange(
    { from: cookieStore.get("date_from")?.value, to: cookieStore.get("date_to")?.value },
    financialMonth,
  );
  const periodLabel = from.slice(0, 7) === to.slice(0, 7)
    ? new Date(`${from}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : `${new Date(`${from}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(`${to}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  const categoryIds = params?.cat ? params.cat.split(",").map(Number).filter((n) => !Number.isNaN(n)) : undefined;
  const accounts = params?.acct ? params.acct.split(",").filter(Boolean) : undefined;

  // Trends defaults to the current calendar year rather than Analytics' month/budget
  // default (see reports/page.tsx for the same convention) — same shared date_from/
  // date_to cookie, just a different fallback when neither has been picked yet.
  const hasStoredRange = !!cookieStore.get("date_from")?.value && !!cookieStore.get("date_to")?.value;
  const thisYear = new Date().getFullYear();
  const trendsFrom = hasStoredRange ? from : `${thisYear}-01-01`;
  const trendsTo = hasStoredRange ? to : `${thisYear}-12-31`;

  return {
    rapporten: <AnalyticsTab from={from} to={to} financialMonth={financialMonth} periodLabel={periodLabel} categoryIds={categoryIds} accounts={accounts} embedded />,
    trends: <TrendsTab from={trendsFrom} to={trendsTo} cmpA={params?.cmpA ?? ""} cmpB={params?.cmpB ?? ""} categoryIds={categoryIds} accounts={accounts} financialMonth={financialMonth} embedded />,
    vermogen: <VermogenTab />,
    // Neutralizes ForecastPage's own "-mt-14" root margin (meant for its standalone
    // route) and sticks its mobile month-picker bar at the top of this pane's own
    // scroll container (`0px`, same convention as AnalyticsFilterBar's `embedded`
    // stickyTop above) instead of the standalone page's `var(--sat)` offset.
    prognose: (
      <div className="mt-14 lg:mt-0">
        <ForecastPage searchParams={Promise.resolve({ month: params?.month })} embedded stickyTop="0px" />
      </div>
    ),
  };
}
