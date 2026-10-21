"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconCheck } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { Segmented } from "@/components/clear/segmented";
import { cn } from "@/lib/utils";

export interface CustomMonth {
  /** Budget month key (YYYY-MM). */
  value: string;
  /** "October 2026". */
  label: string;
  /** The budget month's first and last day. */
  from: string;
  to: string;
}

// The same pill look as <Segmented>'s items, for the Custom trigger that sits in it.
const ITEM = "inline-flex h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-[18px] font-clear text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50";
const ON = "bg-clear-primary font-bold text-clear-primary-ink";
const OFF = "font-semibold text-clear-ink-2 hover:text-clear-ink";

/**
 * Trends' grain control: 3 · 6 · 12 months, plus Custom for any run of budget months.
 * All of it lives in the URL (`range`, or `from`/`to` for Custom), merged into the
 * query so the tab and the Categories / Accounts filters stay.
 */
export function TrendsPeriodControl({
  active,
  months,
  customFrom,
  customTo,
}: {
  /** "3" | "6" | "12" | "custom". */
  active: string;
  /** The budget months Custom offers, oldest first. */
  months: CustomMonth[];
  /** The custom period's first and last month, when one is picked. */
  customFrom?: string;
  customTo?: string;
}) {
  const t = useTranslations("insights.trendsTab.period");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"from" | "to">("from");
  const last = months.at(-1)?.value ?? "";
  const [pick, setPick] = useState({ from: customFrom ?? months.at(-6)?.value ?? months[0]?.value ?? "", to: customTo ?? last });

  const hrefFor = (count: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", count);
    for (const key of ["from", "to", "cmpA", "cmpB"]) params.delete(key);
    return `${pathname}?${params.toString()}`;
  };

  function apply() {
    const from = months.find((m) => m.value === pick.from);
    const to = months.find((m) => m.value === pick.to);
    if (!from || !to) return;
    const [a, b] = from.value <= to.value ? [from, to] : [to, from];
    const params = new URLSearchParams(searchParams.toString());
    params.delete("range");
    params.delete("cmpA");
    params.delete("cmpB");
    params.set("from", a.from);
    params.set("to", b.to);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    setOpen(false);
  }

  const label = (ym: string) => months.find((m) => m.value === ym)?.label ?? ym;

  return (
    <div role="group" aria-label={t("label")} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-clear-card p-[5px]">
      <Segmented
        label={t("label")}
        value={active}
        items={(["3", "6", "12"] as const).map((count) => ({ value: count, label: t("months", { count: Number(count) }), href: hrefFor(count) }))}
        className="bg-transparent p-0 [&>a]:whitespace-nowrap"
      />
      <ResponsivePopover
        open={open}
        onOpenChange={(next) => {
          if (next) {
            setPick({ from: customFrom ?? months.at(-6)?.value ?? months[0]?.value ?? "", to: customTo ?? last });
            setSide("from");
          }
          setOpen(next);
        }}
        title={t("customTitle")}
        trigger={
          <button type="button" aria-pressed={active === "custom"} className={cn(ITEM, active === "custom" ? ON : OFF)}>
            {t("custom")}
          </button>
        }
        footer={
          <ClearButton size="sm" className="w-full" onClick={apply}>
            {t("apply")}
          </ClearButton>
        }
      >
        <div className="flex flex-col gap-2">
          <Segmented<"from" | "to">
            label={t("customTitle")}
            surface="tile"
            size="sm"
            value={side}
            onChange={setSide}
            items={[
              { value: "from", label: t("from", { month: label(pick.from) }) },
              { value: "to", label: t("to", { month: label(pick.to) }) },
            ]}
            className="flex w-full [&>*]:min-w-0 [&>*]:flex-1 [&>*]:truncate"
          />
          <div className="flex flex-col">
            {[...months].reverse().map((m) => {
              const selected = pick[side] === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setPick((p) => ({ ...p, [side]: m.value }));
                    if (side === "from") setSide("to");
                  }}
                  className={cn(
                    "flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-clear-row px-3 text-left text-sm font-semibold transition-colors hover:bg-clear-tile",
                    selected && "bg-clear-tile",
                  )}
                >
                  <span className="first-letter:uppercase">{m.label}</span>
                  {selected && <IconCheck aria-hidden className="size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </ResponsivePopover>
    </div>
  );
}
