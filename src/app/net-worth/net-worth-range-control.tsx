"use client";

import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/clear/segmented";
import { NET_WORTH_RANGES, type NetWorthRange } from "@/lib/net-worth-history";

/** 1 · 3 · 6 months · 1 year for Net worth, as `?range=` links so reloads and shared links keep it. */
export function NetWorthRangeControl({ active }: { active: NetWorthRange }) {
  const t = useTranslations("insights.netWorthTab.range");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hrefFor = (range: NetWorthRange) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    return `${pathname}?${params.toString()}`;
  };
  return (
    <Segmented
      label={t("label")}
      value={active}
      items={NET_WORTH_RANGES.map((r) => ({ value: r, label: t(r), href: hrefFor(r) }))}
      className="shrink-0 [&>a]:whitespace-nowrap"
    />
  );
}
