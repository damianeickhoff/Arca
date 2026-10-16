"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { Segmented } from "@/components/clear/segmented";
import { cn } from "@/lib/utils";

type Side = "a" | "b";

/**
 * "Change months" for the Month comparison: pick which of the two months to change
 * (the segmented pair shows both), then the month. The picks live in the URL as
 * `cmpA`/`cmpB`, merged into the existing query so the tab, period and filters stay.
 */
export function ComparisonPicker({ cmpA, cmpB, months }: { cmpA: string; cmpB: string; months: { value: string; label: string }[] }) {
  const t = useTranslations("insights.trends");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<Side>("b");
  const label = (ym: string) => months.find((m) => m.value === ym)?.label ?? ym;

  const current = side === "a" ? cmpA : cmpB;
  const other = side === "a" ? cmpB : cmpA;
  const choices = [...months].reverse();

  function pick(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(side === "a" ? "cmpA" : "cmpB", value);
    router.push(`?${params.toString()}`, { scroll: false });
    setOpen(false);
  }

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={t("changeMonths")}
      trigger={
        <button type="button" className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
          {t("changeMonths")}
          <IconChevronDown aria-hidden className="size-3.5" />
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <Segmented<Side>
          label={t("changeMonths")}
          surface="tile"
          size="sm"
          value={side}
          onChange={setSide}
          items={[
            { value: "b", label: label(cmpB) },
            { value: "a", label: label(cmpA) },
          ]}
          className="flex w-full [&>*]:min-w-0 [&>*]:flex-1 [&>*]:truncate"
        />
        <div className="flex flex-col">
          {choices.map(({ value: m, label: name }) => {
            const selected = m === current;
            return (
              <button
                key={m}
                type="button"
                disabled={m === other}
                onClick={() => pick(m)}
                aria-pressed={selected}
                className={cn(
                  "flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-clear-row px-3 text-left text-sm font-semibold transition-colors hover:bg-clear-tile disabled:cursor-default disabled:text-clear-placeholder disabled:hover:bg-transparent",
                  selected && "bg-clear-tile font-bold",
                )}
              >
                <span className="first-letter:uppercase">{name}</span>
                {selected && <IconCheck aria-hidden className="size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </ResponsivePopover>
  );
}
