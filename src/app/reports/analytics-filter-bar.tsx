"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { IconAdjustmentsHorizontal, IconBuildingBank, IconChevronDown, IconChevronRight, IconTag } from "@tabler/icons-react";
import { CategoryMultiPicker } from "@/components/category-multi-picker";
import { AccountMultiPicker } from "@/components/account-multi-picker";
import { filterPillClass } from "@/components/filter-pill";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearButton } from "@/components/clear/button";
import { IconTile } from "@/components/clear/icon-tile";
import { cn } from "@/lib/utils";
import type { Category, Bank } from "@/db/schema";

// Category + account multi-select for Insights (Overview and Trends), as pills among
// the page heading's actions — icon-only below lg, where the heading has no room for
// the labels. With `combined` (Trends) phones get one filter button instead, opening a
// sheet that leads to both pickers. The selection lives in the URL (`cat`, `acct` —
// comma-separated ids), so a refresh or a shared link keeps it and every
// server-rendered chart on the page picks it up together.
export function AnalyticsFilterBar({ categories, banks, combined = false }: { categories: Category[]; banks: Bank[]; combined?: boolean }) {
  const t = useTranslations("insights.filters");
  const router = useRouter();
  const searchParams = useSearchParams();
  const catParam = searchParams.get("cat") ?? "";
  const acctParam = searchParams.get("acct") ?? "";
  const selectedCategoryIds = catParam ? catParam.split(",").filter(Boolean) : [];
  const selectedAccounts = acctParam ? acctParam.split(",").filter(Boolean) : [];
  const [catOpen, setCatOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  // The phone filter sheet, and the picker it hands over to.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPicker, setSheetPicker] = useState<"cat" | "acct" | null>(null);

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
  const active = catCount + acctCount;

  const pill = (on: boolean) => filterPillClass(on, "shrink-0 max-lg:size-11 max-lg:justify-center max-lg:px-0");
  const label = "max-lg:sr-only";
  const chevron = "shrink-0 max-lg:hidden";

  const openPicker = (which: "cat" | "acct") => {
    setSheetOpen(false);
    setSheetPicker(which);
  };

  return (
    <div className="flex items-center gap-2.5 font-clear">
      <div className={cn("flex items-center gap-2.5", combined && "max-lg:hidden")}>
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
        {active > 0 && (
          <button
            type="button"
            onClick={() => update({ cat: [], acct: [] })}
            className="h-11 shrink-0 cursor-pointer whitespace-nowrap px-2 text-sm font-bold text-clear-ember-text hover:underline max-lg:hidden"
          >
            {t("clear")}
          </button>
        )}
      </div>

      {combined && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label={active > 0 ? t("buttonCount", { count: active }) : t("button")}
            onClick={() => setSheetOpen(true)}
            className={cn(pill(active > 0), "relative")}
          >
            <IconAdjustmentsHorizontal aria-hidden stroke={2} />
            {active > 0 && (
              <span aria-hidden className="absolute -top-0.5 -right-0.5 inline-flex size-5 items-center justify-center rounded-full bg-clear-ember text-xs font-extrabold text-clear-ember-ink">
                {active}
              </span>
            )}
          </button>
          <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
            <DialogContent
              title={t("title")}
              footer={
                active > 0 ? (
                  <ClearButton variant="secondary" className="w-full" onClick={() => { update({ cat: [], acct: [] }); setSheetOpen(false); }}>
                    {t("clear")}
                  </ClearButton>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-1 pb-2 font-clear">
                <SheetRow icon={<IconTag stroke={1.9} />} label={t("categories")} value={catCount > 0 ? t("selected", { count: catCount }) : t("all")} onClick={() => openPicker("cat")} />
                <SheetRow icon={<IconBuildingBank stroke={1.9} />} label={t("accounts")} value={acctCount > 0 ? t("selected", { count: acctCount }) : t("all")} onClick={() => openPicker("acct")} />
              </div>
            </DialogContent>
          </Dialog>
          <CategoryMultiPicker
            categories={categories}
            selected={selectedCategoryIds}
            open={sheetPicker === "cat"}
            onOpenChange={(open) => setSheetPicker(open ? "cat" : null)}
            onApply={(ids) => update({ cat: ids })}
          />
          <AccountMultiPicker
            banks={banks}
            selected={selectedAccounts}
            open={sheetPicker === "acct"}
            onOpenChange={(open) => setSheetPicker(open ? "acct" : null)}
            onApply={(ids) => update({ acct: ids })}
          />
        </div>
      )}
    </div>
  );
}

function SheetRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-clear-row px-2 text-left transition-colors hover:bg-clear-tile"
    >
      <IconTile tone="neutral">{icon}</IconTile>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold text-clear-ink">{label}</span>
        <span className="text-[13px] text-clear-muted">{value}</span>
      </span>
      <IconChevronRight size={16} stroke={2.2} aria-hidden className="shrink-0 text-clear-placeholder" />
    </button>
  );
}
