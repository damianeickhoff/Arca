import { getDateRange } from "@/lib/date-range";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getBudgetOverview } from "@/lib/budget-overview";
import { DateRangePicker } from "@/components/date-range-picker";
import { SearchButton } from "@/components/shell/search-context";
import { PageHeading } from "@/components/ui/page-heading";
import { getTranslations } from "next-intl/server";
import ForecastPage from "@/app/forecast/page";
import { PageContainer } from "@/components/page-container";
import { cookies } from "next/headers";
import { ReportsTabs } from "./reports-tabs";
import { TrendsTab, VermogenTab } from "./report-tabs";
import { AnalyticsTab } from "./analytics-tab";
import { HealthTab } from "./health-tab";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string; cmpA?: string; cmpB?: string; cat?: string; acct?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const financialMonth = await getFinancialMonthConfig();
  const activeTab = sp.tab ?? "rapporten";
  const t = await getTranslations("insights");
  const categoryIds = sp.cat ? sp.cat.split(",").map(Number).filter((n) => !Number.isNaN(n)) : undefined;
  const accounts = sp.acct ? sp.acct.split(",").filter(Boolean) : undefined;

  const enrichedSp = {
    from: sp.from ?? cookieStore.get("date_from")?.value,
    to: sp.to ?? cookieStore.get("date_to")?.value,
  };
  let { from, to } = getDateRange(enrichedSp, financialMonth);

  // With no period picked yet (fresh visit, nothing in the URL or a cookie), the
  // Analytics tab defaults to the configured budget period, while Trends defaults
  // to the current calendar year — both rather than the plain calendar month
  // getDateRange falls back to.
  if (!enrichedSp.from && !enrichedSp.to) {
    if (activeTab === "rapporten") {
      const budgetOverview = await getBudgetOverview(financialMonth).catch(() => null);
      if (budgetOverview?.budget) {
        from = budgetOverview.from;
        to = budgetOverview.to;
      }
    } else if (activeTab === "trends") {
      const thisYear = new Date().getFullYear();
      from = `${thisYear}-01-01`;
      to = `${thisYear}-12-31`;
    }
  }
  const periodLabel = (() => {
    const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return from.slice(0, 7) === to.slice(0, 7)
      ? new Date(`${from}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : `${fmt(from)} – ${fmt(to)}`;
  })();

  return (
    <PageContainer className="px-0 min-h-screen">

      {/* Insights — the one destination for Overview · Trends · Net worth · Forecast ·
          Health. Not sticky on Forecast, which pins its own month bar instead. */}
      <div
        className={activeTab === "prognose" ? "bg-background px-4 pt-[calc(var(--sat)+18px)] pb-3 space-y-3" : "sticky top-0 z-40 bg-background px-4 pt-[calc(var(--sat)+18px)] pb-3 space-y-3"}
      >
        <PageHeading
          title={t("title")}
          subtitle={activeTab === "prognose" || activeTab === "health" || activeTab === "vermogen" ? undefined : periodLabel}
          actions={
            <>
              {activeTab === "rapporten" && (
                <DateRangePicker from={from} to={to} financialMonth={financialMonth} iconOnly />
              )}
              <SearchButton />
            </>
          }
        />
        <ReportsTabs active={activeTab} />
      </div>

      {activeTab === "rapporten" && <AnalyticsTab from={from} to={to} financialMonth={financialMonth} periodLabel={periodLabel} categoryIds={categoryIds} accounts={accounts} />}
      {activeTab === "trends" && <TrendsTab from={from} to={to} cmpA={sp.cmpA ?? ""} cmpB={sp.cmpB ?? ""} categoryIds={categoryIds} accounts={accounts} financialMonth={financialMonth} />}
      {activeTab === "vermogen" && <VermogenTab />}
      {activeTab === "prognose" && (
        <ForecastPage
          searchParams={Promise.resolve({ month: cookieStore.get("fc_month")?.value })}
          embedded
          dockAboveNav
          stickyTop="var(--sat)"
        />
      )}
      {activeTab === "health" && <HealthTab />}
    </PageContainer>
  );
}
