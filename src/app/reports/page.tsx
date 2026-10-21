import { getDateRange } from "@/lib/date-range";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getBudgetOverview } from "@/lib/budget-overview";
import { getLocale, getTranslations } from "next-intl/server";
import ForecastPage from "@/app/forecast/page";
import { cookies } from "next/headers";
import { ReportsTabs } from "./reports-tabs";
import { getTrendsHeading, TrendsPeriodSlot, TrendsTab } from "@/app/trends/trends-tab";
import { NetWorthHeadingActions, NetWorthTab } from "@/app/net-worth/net-worth-tab";
import { NetWorthRangeControl } from "@/app/net-worth/net-worth-range-control";
import { parseNetWorthRange } from "@/lib/net-worth-history";
import { AnalyticsTab, InsightsFilters } from "./analytics-tab";
import { HealthTab } from "./health-tab";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string; range?: string; cmpA?: string; cmpB?: string; cat?: string; acct?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const financialMonth = await getFinancialMonthConfig();
  const activeTab = sp.tab ?? "rapporten";
  const t = await getTranslations("insights");
  const locale = await getLocale();
  const categoryIds = sp.cat ? sp.cat.split(",").map(Number).filter((n) => !Number.isNaN(n)) : undefined;
  const accounts = sp.acct ? sp.acct.split(",").filter(Boolean) : undefined;

  const enrichedSp = {
    from: sp.from ?? cookieStore.get("date_from")?.value,
    to: sp.to ?? cookieStore.get("date_to")?.value,
  };
  let { from, to } = getDateRange(enrichedSp, financialMonth);

  // With no period picked yet (fresh visit, nothing in the URL or a cookie), Overview
  // defaults to the configured budget period rather than the plain calendar month
  // getDateRange falls back to. Trends reads its own period from the URL (range, or a
  // picked from/to) and never the cookie.
  if (!enrichedSp.from && !enrichedSp.to && activeTab === "rapporten") {
    const budgetOverview = await getBudgetOverview(financialMonth).catch(() => null);
    if (budgetOverview?.budget) {
      from = budgetOverview.from;
      to = budgetOverview.to;
    }
  }
  const trendsSp = { range: sp.range, from: sp.from, to: sp.to };
  const trendsHeading = activeTab === "trends" ? await getTrendsHeading(trendsSp, financialMonth) : null;
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const overviewPeriod = (() => {
    const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
    return from.slice(0, 7) === to.slice(0, 7)
      ? new Date(`${from}T00:00:00`).toLocaleDateString(dateLocale, { month: "long", year: "numeric" })
      : `${fmt(from)} – ${fmt(to)}`;
  })();
  // The desktop subtitle names the tab and what it is built from, as in the V5 artboards.
  const subtitle =
    activeTab === "rapporten" ? t("subtitle.overview", { period: overviewPeriod })
    : trendsHeading
      ? trendsHeading.running
        ? t("subtitle.trendsRunning", { period: trendsHeading.period, ...trendsHeading.running })
        : t("subtitle.trends", { period: trendsHeading.period })
    : activeTab === "vermogen" ? t("subtitle.netWorth")
    : activeTab === "prognose" ? t("subtitle.forecast")
    : t("subtitle.health");

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] pb-[calc(6rem+var(--sab))] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      {/* Heading: title, the tab and period it shows, the period picker and search. */}
      <div className="flex flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{t("title")}</h1>
          {/* Phones keep the period line under the title on Overview and Trends; desktop names the tab. */}
          <span className="text-sm text-clear-ink-2 lg:hidden">{activeTab === "rapporten" ? overviewPeriod : trendsHeading ? trendsHeading.period : null}</span>
          <span className="hidden text-base text-clear-ink-2 lg:inline">{subtitle}</span>
        </div>
        <div className="flex items-center gap-2.5">
          {(activeTab === "rapporten" || activeTab === "trends") && (
            <InsightsFilters from={from} to={to} financialMonth={financialMonth} tab={activeTab} />
          )}
          {activeTab === "vermogen" && <NetWorthHeadingActions />}
        </div>
      </div>

      {/* Insights — the one destination for Overview · Trends · Net worth · Forecast ·
          Health. The tab row stays pinned while the page scrolls, except on Forecast,
          which pins its own month bar instead. */}
      <div className={activeTab === "prognose" ? "" : "sticky top-[var(--sat)] z-30 -mx-4 bg-clear-ground px-4 py-2 lg:-mx-8 lg:px-8"}>
        <ReportsTabs
          active={activeTab}
          aside={
            activeTab === "trends" ? <TrendsPeriodSlot sp={trendsSp} financialMonth={financialMonth} />
            : activeTab === "vermogen" ? <NetWorthRangeControl active={parseNetWorthRange(sp.range)} />
            : undefined
          }
        />
      </div>

      {activeTab === "rapporten" && <AnalyticsTab from={from} to={to} financialMonth={financialMonth} categoryIds={categoryIds} accounts={accounts} />}
      {activeTab === "trends" && (
        <TrendsTab {...trendsSp} cmpA={sp.cmpA} cmpB={sp.cmpB} categoryIds={categoryIds} accounts={accounts} financialMonth={financialMonth} />
      )}
      {activeTab === "vermogen" && <NetWorthTab range={sp.range} />}
      {activeTab === "prognose" && (
        <ForecastPage
          searchParams={Promise.resolve({ month: cookieStore.get("fc_month")?.value })}
          embedded
        />
      )}
      {activeTab === "health" && <HealthTab />}
    </div>
  );
}
