"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { IconBuildingBank, IconChevronDown, IconTag } from "@tabler/icons-react";
import { CategoryMultiPicker } from "@/components/category-multi-picker";
import { AccountMultiPicker } from "@/components/account-multi-picker";
import { filterPillClass } from "@/components/filter-pill";
import type { Category, Bank } from "@/db/schema";

// Category + account multi-select for Insights (Overview and Trends), as pills among
// the page heading's actions — icon-only below lg, where the heading has no room for
// the labels. The selection lives in the URL (`cat`, `acct` — comma-separated ids), so
// a refresh or a shared link keeps it and every server-rendered chart on the page picks
// it up together.
export function AnalyticsFilterBar({ categories, banks }: { categories: Category[]; banks: Bank[] }) {
  const t = useTranslations("insights.filters");
  const router = useRouter();
  const searchParams = useSearchParams();
  const catParam = searchParams.get("cat") ?? "";
  const acctParam = searchParams.get("acct") ?? "";
  const selectedCategoryIds = catParam ? catParam.split(",").filter(Boolean) : [];
  const selectedAccounts = acctParam ? acctParam.split(",").filter(Boolean) : [];
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

  const catCount = selectedCategoryIds.filter((id) => categories.some((c) => String(c.id) === id)).length;
  const acctCount = selectedAccounts.filter((id) => banks.some((b) => b.accountNumber === id)).length;

  const pill = (active: boolean) => filterPillClass(active, "shrink-0 max-lg:size-11 max-lg:justify-center max-lg:px-0");
  const label = "max-lg:sr-only";
  const chevron = "shrink-0 max-lg:hidden";

  return (
    <div className="flex items-center gap-2.5 font-clear">
      <CategoryMultiPicker
        categories={categories}
        selected={selectedCategoryIds}
        open={catOpen}
        onOpenChange={setCatOpen}
        onApply={(ids) => update({ cat: ids })}
        trigger={
          <button type="button" className={pill(catCount > 0)}>
            <IconTag aria-hidden stroke={1.9} />
            <span className={label}>{catCount > 0 ? t("categoriesCount", { count: catCount }) : t("categories")}</span>
            <IconChevronDown aria-hidden stroke={2.2} className={chevron} />
          </button>
        }
      />
      <AccountMultiPicker
        banks={banks}
        selected={selectedAccounts}
        open={acctOpen}
        onOpenChange={setAcctOpen}
        onApply={(ids) => update({ acct: ids })}
        trigger={
          <button type="button" className={pill(acctCount > 0)}>
            <IconBuildingBank aria-hidden stroke={1.9} />
            <span className={label}>{acctCount > 0 ? t("accountsCount", { count: acctCount }) : t("accounts")}</span>
            <IconChevronDown aria-hidden stroke={2.2} className={chevron} />
          </button>
        }
      />
      {(catCount > 0 || acctCount > 0) && (
        <button
          type="button"
          onClick={() => update({ cat: [], acct: [] })}
          className="h-11 shrink-0 cursor-pointer whitespace-nowrap px-2 text-sm font-bold text-clear-ember-text hover:underline max-lg:hidden"
        >
          {t("clear")}
        </button>
      )}
    </div>
  );
}
