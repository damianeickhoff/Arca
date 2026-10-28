"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { IconAdjustmentsHorizontal, IconChevronDown } from "@tabler/icons-react";
import { CategoryMultiPicker } from "@/components/category-multi-picker";
import { AccountMultiPicker } from "@/components/account-multi-picker";
import { Icon } from "@/components/icon";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { cn } from "@/lib/utils";
import type { Category, Bank } from "@/db/schema";

const FIELD = "flex h-11 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-clear-row bg-clear-tile pr-3 pl-3.5 text-left font-clear text-sm font-semibold text-clear-ink transition-colors hover:bg-clear-line";

/** "Groceries, Rent +1" — the first two picked names and how many more. */
function namesSummary(names: string[]) {
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}

// Insights' filters (Overview and Trends) behind one Filters button in the heading, as on
// Activity: a popover on desktop, a sheet on phones, with the period, categories and
// accounts inside, the number of category / account filters on the button and Clear
// all at the bottom (the period stays). The selection lives in the URL (`cat`, `acct` —
// comma-separated ids; the period's own params), so a refresh or a shared link keeps it
// and every server-rendered chart on the page picks it up together.
export function AnalyticsFilterBar({ categories, banks, period }: { categories: Category[]; banks: Bank[]; period: React.ReactNode }) {
  const t = useTranslations("insights.filters");
  const router = useRouter();
  const searchParams = useSearchParams();
  const catParam = searchParams.get("cat") ?? "";
  const acctParam = searchParams.get("acct") ?? "";
  const selectedCategoryIds = catParam ? catParam.split(",").filter(Boolean) : [];
  const selectedAccounts = acctParam ? acctParam.split(",").filter(Boolean) : [];
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);

  function update(values: { cat?: string[]; acct?: string[] }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, list] of Object.entries(values)) {
      if (list.length) params.set(key, list.join(","));
      else params.delete(key);
    }
    router.push(`?${params.toString()}`);
  }

  const selectedCats = selectedCategoryIds.map((id) => categories.find((c) => String(c.id) === id)).filter((c): c is Category => !!c);
  const selectedBanks = selectedAccounts.map((id) => banks.find((b) => b.accountNumber === id)).filter((b): b is Bank => !!b);
  const count = (selectedCats.length > 0 ? 1 : 0) + (selectedBanks.length > 0 ? 1 : 0);

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={t("button")}
      className="w-[400px] max-h-[min(640px,var(--available-height))]"
      trigger={
        // Labelled on desktop; a round icon button with the count as a badge on phones.
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={count > 0 ? t("buttonCount", { count }) : t("button")}
          className={cn(clearButtonVariants({ variant: "surface", size: "sm" }), "relative h-11 max-lg:size-12 max-lg:px-0 lg:h-12 lg:px-[18px] lg:text-[15px]")}
        >
          <IconAdjustmentsHorizontal aria-hidden stroke={2} className="max-lg:size-5" />
          <span className="max-lg:sr-only">{t("button")}</span>
          {count > 0 && (
            <span
              aria-hidden
              className="inline-flex size-[22px] items-center justify-center rounded-full bg-clear-primary text-xs font-extrabold text-clear-primary-ink max-lg:absolute max-lg:-top-0.5 max-lg:-right-0.5 max-lg:size-5 max-lg:ring-2 max-lg:ring-clear-ground"
            >
              {count}
            </span>
          )}
        </button>
      }
      footer={
        <button
          type="button"
          disabled={count === 0}
          onClick={() => update({ cat: [], acct: [] })}
          className={cn(clearButtonVariants({ variant: "secondary", size: "sm" }), "w-full lg:h-10")}
        >
          {t("clearAll")}
        </button>
      }
    >
      <div data-surface="card" className="flex flex-col gap-4 px-0 pb-1 font-clear lg:px-2.5 lg:pt-2.5">
        <FilterGroup label={t("period")}>{period}</FilterGroup>
        <FilterGroup label={t("categories")}>
          <CategoryMultiPicker
            categories={categories}
            selected={selectedCategoryIds}
            open={catOpen}
            onOpenChange={setCatOpen}
            onApply={(ids) => update({ cat: ids })}
            trigger={
              <button type="button" className={FIELD}>
                {selectedCats.length > 0 && (
                  <span aria-hidden className="flex shrink-0 items-center -space-x-1.5">
                    {selectedCats.slice(0, 2).map((c) => (
                      <span key={c.id} className="rounded-full ring-2 ring-clear-tile">
                        <Icon iconKey={c.icon} color={c.color} round size="xs" />
                      </span>
                    ))}
                  </span>
                )}
                <span className={cn("min-w-0 flex-1 truncate", selectedCats.length === 0 && "text-clear-ink-2")}>
                  {selectedCats.length > 0 ? namesSummary(selectedCats.map((c) => c.name)) : t("allCategories")}
                </span>
                <IconChevronDown aria-hidden className="size-4 shrink-0 text-clear-muted" stroke={2.2} />
              </button>
            }
          />
        </FilterGroup>
        <FilterGroup label={t("accounts")}>
          <AccountMultiPicker
            banks={banks}
            selected={selectedAccounts}
            open={acctOpen}
            onOpenChange={setAcctOpen}
            onApply={(ids) => update({ acct: ids })}
            trigger={
              <button type="button" className={FIELD}>
                <span className={cn("min-w-0 flex-1 truncate", selectedBanks.length === 0 && "text-clear-ink-2")}>
                  {selectedBanks.length > 0
                    ? namesSummary(selectedBanks.map((b) => b.displayName ?? b.accountNumber ?? String(b.id)))
                    : t("allAccounts")}
                </span>
                <IconChevronDown aria-hidden className="size-4 shrink-0 text-clear-muted" stroke={2.2} />
              </button>
            }
          />
        </FilterGroup>
      </div>
    </ResponsivePopover>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span aria-hidden className="px-1 text-[13px] font-bold text-clear-ink-2">{label}</span>
      {children}
    </div>
  );
}
