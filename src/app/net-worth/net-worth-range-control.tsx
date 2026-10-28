"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { Segmented } from "@/components/clear/segmented";
import { NET_WORTH_RANGES, type NetWorthRange } from "@/lib/net-worth-history";
import { cn } from "@/lib/utils";

/** 1 · 3 · 6 months · 1 year for Net worth, as `?range=` links so reloads and shared links
 *  keep it. `menu` (the phone heading) shows it as one pill naming the range, opening the
 *  same choices as a list. */
export function NetWorthRangeControl({ active, menu = false }: { active: NetWorthRange; menu?: boolean }) {
  const t = useTranslations("insights.netWorthTab.range");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const hrefFor = (range: NetWorthRange) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    return `${pathname}?${params.toString()}`;
  };

  if (menu) {
    return (
      <ResponsivePopover
        open={open}
        onOpenChange={setOpen}
        title={t("label")}
        className="w-52"
        trigger={
          <button
            type="button"
            aria-label={t("change", { range: t(active) })}
            className={cn(
              "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full pr-3 pl-3.5 font-clear text-sm font-bold transition-colors",
              open ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-card text-clear-ink hover:bg-clear-tile",
            )}
          >
            {t(active)}
            <IconChevronDown aria-hidden size={16} stroke={2.2} className={cn("transition-transform", open && "rotate-180")} />
          </button>
        }
      >
        <div role="menu" aria-label={t("label")} className="flex flex-col">
          {NET_WORTH_RANGES.map((r) => (
            <Link
              key={r}
              role="menuitemradio"
              aria-checked={r === active}
              href={hrefFor(r)}
              scroll={false}
              onClick={() => setOpen(false)}
              className={cn(
                "flex h-11 w-full items-center justify-between gap-2 rounded-clear-row px-3 text-[15px] transition-colors hover:bg-clear-tile",
                r === active ? "bg-clear-tile font-extrabold" : "font-semibold",
              )}
            >
              {t(r)}
              {r === active && <IconCheck aria-hidden className="size-4 shrink-0" stroke={2.6} />}
            </Link>
          ))}
        </div>
      </ResponsivePopover>
    );
  }

  return (
    <Segmented
      label={t("label")}
      value={active}
      items={NET_WORTH_RANGES.map((r) => ({ value: r, label: t(r), href: hrefFor(r) }))}
      className="shrink-0 [&>a]:whitespace-nowrap"
    />
  );
}
