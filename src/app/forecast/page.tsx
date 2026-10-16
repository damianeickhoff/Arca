import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { AnchoredTip } from "@/components/anchored-tip";
import { NetWorthTrendChart } from "@/app/reports/net-worth-trend-chart";
import { loadForecast } from "./load-forecast";
import { CashFlowSection } from "./cash-flow-section";
import { PlanCard } from "./plan-card";
import { ComingUpCard } from "./coming-up-card";
import { RecurringItemsCard } from "./recurring-items-card";

export const dynamic = "force-dynamic";

/**
 * Insights · Forecast. Rendered by the Insights page (/reports?tab=prognose) with
 * `embedded`; the old standalone /forecast route forwards there, query included.
 *
 * One grid: the projected balance (two columns) beside the range in numbers and the
 * status; the month's plan (two columns) beside Coming up; then the 12-month
 * projection and the recurring items across the full width.
 */
export default async function ForecastPage({
  searchParams,
  embedded = false,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  embedded?: boolean;
}) {
  const sp = await searchParams;

  if (!embedded) {
    const params = new URLSearchParams({ tab: "prognose" });
    for (const [key, value] of Object.entries(sp)) {
      if (key === "tab" || value == null) continue;
      for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
    }
    redirect(`/reports?${params.toString()}`);
  }

  const data = await loadForecast(typeof sp.month === "string" ? sp.month : undefined);
  const t = await getTranslations("insights.forecast.projection");

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <CashFlowSection cashFlow={data.cashFlow} today={data.today} />
        <PlanCard data={data} />
        <ComingUpCard events={data.cashFlow.events} today={data.today} comingUp={data.comingUp} />
        {data.projection && (
          <ClearCard aria-labelledby="forecast-projection-title" className="gap-3 lg:col-span-2 xl:col-span-3">
            <ClearCardHeader title={<span id="forecast-projection-title">{t("title")}</span>} subtitle={t("subtitle")} />
            <NetWorthTrendChart data={data.projection.history} forecast={data.projection.forecast} />
          </ClearCard>
        )}
        <RecurringItemsCard items={data.items} month={data.month} months={data.months} allowedMonths={data.allowedMonths} />
      </div>

      <AnchoredTip id="insightsForecastRange" anchor="insightsForecastRange" active={data.cashFlow.status !== "empty"} />
      <AnchoredTip id="insightsComingUp" anchor="insightsComingUp" active={data.cashFlow.events.length > 0} />
    </>
  );
}
