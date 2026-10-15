"use client";

import { useTranslations } from "next-intl";
import { MonthPicker } from "@/components/month-picker";

export function ComparisonPicker({ cmpA, cmpB }: { cmpA: string; cmpB: string }) {
  const t = useTranslations("insights.trends");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <MonthPicker current={cmpA} variant="pill" paramName="cmpA" />
      <span className="text-xs text-ink-3">{t("vs")}</span>
      <MonthPicker current={cmpB} variant="pill" paramName="cmpB" />
    </div>
  );
}
