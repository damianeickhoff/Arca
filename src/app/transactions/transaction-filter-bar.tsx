"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { IconAdjustmentsHorizontal, IconCheck, IconChevronDown } from "@tabler/icons-react";
import { CategoryMultiPicker } from "@/components/category-multi-picker";
import { AccountMultiPicker } from "@/components/account-multi-picker";
import { Icon } from "@/components/icon";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { Segmented } from "@/components/clear/segmented";
import { ClearInput } from "@/components/clear/field";
import { ClearSwitch } from "@/components/clear/switch";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useActivityNavigation } from "./_activity/filter-transition";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/format";
import { transactionPeriods, matchTransactionPeriod, ALL_FROM, todayStr } from "./periods";
import type { Bank, Category } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";

type Props = {
  cats: Category[];
  banks: Bank[];
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  direction?: string;
  category?: string;
  account?: string;
  budgetType?: string;
  recurring?: boolean;
  search?: string;
  min?: string;
  max?: string;
  sort?: string;
  dir?: string;
};

/** Pushes a change to one filter while keeping every other filter in the URL. */
function useFilterPush(props: Props) {
  const { navigate } = useActivityNavigation();
  return function push(overrides: Record<string, string | undefined>) {
    const base: Record<string, string | undefined> = {
      from: props.from,
      to: props.to,
      direction: props.direction,
      category: props.category,
      account: props.account,
      budgetType: props.budgetType,
      recurring: props.recurring ? "1" : undefined,
      min: props.min,
      max: props.max,
      search: props.search,
      sort: props.sort,
      dir: props.dir,
    };
    const merged = { ...base, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    navigate(qs ? `?${qs}` : "/transactions");
  };
}

/** How many of the Filters popover's filters are on; a period other than All counts too. */
export function activeFilterCount(p: Pick<Props, "from" | "to" | "account" | "category" | "budgetType" | "recurring" | "min" | "max" | "direction">) {
  const period = p.from !== ALL_FROM || p.to !== todayStr();
  return [period, p.account, p.category, p.budgetType, p.recurring, p.min || p.max, p.direction].filter(Boolean).length;
}

/**
 * The period, first in the Filters popover: a field that opens the presets in place
 * (a floating menu would sit under the popover), and Custom… for any range — two date
 * fields, also in place (a dialog would close the popover).
 */
function PeriodField({ from, to, financialMonth, onChange }: { from: string; to: string; financialMonth: FinancialMonthConfig; onChange: (from: string, to: string) => void }) {
  const t = useTranslations("transactions");
  const locale = useLocale();
  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const periods = transactionPeriods(financialMonth);
  const matched = matchTransactionPeriod(financialMonth, from, to);
  const [custom, setCustom] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const label = matched ? t(`periods.${matched.key}`) : `${fmtDate(from)} – ${fmtDate(to)}`;
  const dateInput = "h-11 text-sm";

  return (
    <FilterGroup label={t("filters.period")}>
      <button
        type="button"
        onClick={() => setListOpen((o) => !o)}
        aria-expanded={listOpen}
        aria-label={`${t("filters.period")}: ${label}`}
        className={FIELD}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <IconChevronDown aria-hidden className={cn("size-4 shrink-0 text-clear-muted transition-transform", listOpen && "rotate-180")} stroke={2.2} />
      </button>
      {listOpen && (
        <div role="listbox" aria-label={t("filters.period")} className="flex flex-col gap-0.5 rounded-clear-row border border-clear-line p-1">
          {[...periods.map((p) => ({ key: p.key, label: t(`periods.${p.key}`), on: matched?.key === p.key, pick: () => onChange(p.from, p.to) })),
            { key: "custom", label: t("filters.custom"), on: !matched || custom, pick: () => { setCustomFrom(from); setCustomTo(to); } },
          ].map((o) => (
            <button
              key={o.key}
              type="button"
              role="option"
              aria-selected={o.on}
              onClick={() => {
                setCustom(o.key === "custom");
                setListOpen(false);
                o.pick();
              }}
              className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-clear-row px-3 py-2.5 text-left text-sm text-clear-ink transition-colors hover:bg-clear-tile", o.on && "font-bold")}
            >
              {o.label}
              {o.on && <IconCheck aria-hidden className="size-4 shrink-0" stroke={2.4} />}
            </button>
          ))}
        </div>
      )}
      {(custom || !matched) && (
        <form
          className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (customFrom && customTo) onChange(customFrom <= customTo ? customFrom : customTo, customFrom <= customTo ? customTo : customFrom);
          }}
        >
          <label className="flex min-w-0 flex-col gap-1">
            <span className="px-1 text-xs font-bold text-clear-ink-2">{t("filters.from")}</span>
            <ClearInput type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={dateInput} />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="px-1 text-xs font-bold text-clear-ink-2">{t("filters.to")}</span>
            <ClearInput type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={dateInput} />
          </label>
          <button type="submit" className={cn(clearButtonVariants({ size: "sm" }), "h-11")}>
            {t("filters.apply")}
          </button>
        </form>
      )}
    </FilterGroup>
  );
}

/**
 * Activity's Filters: one button (a labelled pill in the desktop list toolbar, a round
 * icon button in the phone header) with the number of filters on, opening every filter
 * at once — a popover on desktop, a sheet on phones. Each change applies immediately;
 * Clear all resets them, the period included (search and sort stay). Every filter lives in the
 * URL, so the server page does the filtering.
 */
export function TransactionFilters({ layout, ...props }: Props & { layout: "toolbar" | "header" }) {
  const t = useTranslations("transactions");
  const tA = useTranslations("activity");
  const push = useFilterPush(props);
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(props);

  const trigger =
    layout === "toolbar" ? (
      <button type="button" aria-haspopup="dialog" data-tip-anchor="activityFilters" className={cn(clearButtonVariants({ variant: "secondary", size: "sm" }), "h-11")}>
        <IconAdjustmentsHorizontal aria-hidden stroke={2} />
        {tA("filtersButton")}
        {count > 0 && (
          <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-clear-primary text-xs font-extrabold text-clear-primary-ink">{count}</span>
        )}
      </button>
    ) : (
      <button
        type="button"
        aria-label={count > 0 ? tA("filtersButtonCount", { count }) : tA("filtersButton")}
        className={cn(clearButtonVariants({ variant: "surface", size: "icon" }), "relative size-12 lg:hidden")}
      >
        <IconAdjustmentsHorizontal size={20} stroke={1.9} />
        {count > 0 && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 inline-flex size-5 items-center justify-center rounded-full bg-clear-primary text-[11px] font-extrabold text-clear-primary-ink ring-2 ring-clear-ground">
            {count}
          </span>
        )}
      </button>
    );

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={tA("filtersButton")}
      className="w-[400px] max-h-[min(640px,var(--available-height))]"
      trigger={trigger}
      footer={
        <button
          type="button"
          disabled={count === 0}
          onClick={() => push({ from: undefined, to: undefined, account: undefined, category: undefined, budgetType: undefined, recurring: undefined, min: undefined, max: undefined, direction: undefined })}
          className={cn(clearButtonVariants({ variant: "secondary", size: "sm" }), "w-full lg:h-10")}
        >
          {t("filters.clearAll")}
        </button>
      }
    >
      <div data-surface="card" className="flex flex-col gap-4 px-0 pb-1 lg:px-2.5 lg:pt-2.5">
        <PeriodField from={props.from} to={props.to} financialMonth={props.financialMonth} onChange={(from, to) => push({ from, to })} />
        <AccountsField banks={props.banks} value={props.account} onChange={(v) => push({ account: v })} />
        <CategoriesField cats={props.cats} value={props.category} onChange={(v) => push({ category: v })} />
        <FilterGroup label={t("filters.nature")}>
          <Segmented
            label={t("filters.nature")}
            surface="tile"
            size="sm"
            value={props.budgetType ?? "all"}
            onChange={(v) => push({ budgetType: v === "all" ? undefined : v })}
            items={[
              { value: "all", label: t("filters.all") },
              { value: "nodig", label: t("filters.needs") },
              { value: "willen", label: t("filters.wants") },
              { value: "sparen", label: t("filters.save") },
            ]}
            className="flex w-full [&>button]:flex-1 [&>button]:px-2"
          />
        </FilterGroup>
        <FilterGroup label={t("filters.operationType")}>
          <Segmented
            label={t("filters.operationType")}
            surface="tile"
            size="sm"
            value={props.direction ?? "all"}
            onChange={(v) => push({ direction: v === "all" ? undefined : v })}
            items={[
              { value: "all", label: t("filters.all") },
              { value: "income", label: t("income") },
              { value: "expense", label: t("expenses") },
            ]}
            className="flex w-full [&>button]:flex-1 [&>button]:px-2"
          />
        </FilterGroup>
        <AmountField min={props.min} max={props.max} onChange={(min, max) => push({ min, max })} />
        <label className="flex cursor-pointer items-center gap-3 rounded-clear-row bg-clear-tile px-3.5 py-3">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-bold text-clear-ink">{t("filters.recurring")}</span>
            <span className="text-xs text-clear-ink-2">{t("filters.recurringHelp")}</span>
          </span>
          <ClearSwitch checked={!!props.recurring} onCheckedChange={(on) => push({ recurring: on ? "1" : undefined })} label={t("filters.recurring")} />
        </label>
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

const FIELD = "flex h-11 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-clear-row bg-clear-tile pr-3 pl-3.5 text-left font-clear text-sm font-semibold text-clear-ink transition-colors hover:bg-clear-line";

/** "Ann, Bob +1" — the first two picked names and how many more. */
function namesSummary(names: string[]) {
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}

function CategoriesField({ cats, value, onChange }: { cats: Category[]; value?: string; onChange: (v: string | undefined) => void }) {
  const t = useTranslations("transactions");
  const [open, setOpen] = useState(false);
  const selectedIds = value ? value.split(",").filter(Boolean) : [];
  const selectedCats = selectedIds.map((id) => cats.find((c) => String(c.id) === id)).filter((c): c is Category => !!c);

  return (
    <FilterGroup label={t("filters.categories")}>
      <CategoryMultiPicker
        categories={cats}
        selected={selectedIds}
        open={open}
        onOpenChange={setOpen}
        onApply={(ids) => onChange(ids.length ? ids.join(",") : undefined)}
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
              {selectedCats.length > 0 ? namesSummary(selectedCats.map((c) => c.name)) : t("filters.allCategories")}
            </span>
            <IconChevronDown aria-hidden className="size-4 shrink-0 text-clear-muted" stroke={2.2} />
          </button>
        }
      />
    </FilterGroup>
  );
}

function AccountsField({ banks, value, onChange }: { banks: Bank[]; value?: string; onChange: (v: string | undefined) => void }) {
  const t = useTranslations("transactions");
  const [open, setOpen] = useState(false);
  const selectedIds = value ? value.split(",").filter(Boolean) : [];
  const selectedBanks = selectedIds.map((id) => banks.find((b) => b.accountNumber === id)).filter((b): b is Bank => !!b);

  return (
    <FilterGroup label={t("filters.accounts")}>
      <AccountMultiPicker
        banks={banks}
        selected={selectedIds}
        open={open}
        onOpenChange={setOpen}
        onApply={(ids) => onChange(ids.length ? ids.join(",") : undefined)}
        trigger={
          <button type="button" className={FIELD}>
            <span className={cn("min-w-0 flex-1 truncate", selectedBanks.length === 0 && "text-clear-ink-2")}>
              {selectedBanks.length > 0
                ? namesSummary(selectedBanks.map((b) => b.displayName ?? b.accountNumber ?? String(b.id)))
                : t("filters.allAccounts")}
            </span>
            <IconChevronDown aria-hidden className="size-4 shrink-0 text-clear-muted" stroke={2.2} />
          </button>
        }
      />
    </FilterGroup>
  );
}

// Amount range — sign-agnostic (it matches the size of the operation; Operation type
// decides the sign). Applies on Enter or when a field loses focus.
function AmountField({ min, max, onChange }: { min?: string; max?: string; onChange: (min: string | undefined, max: string | undefined) => void }) {
  const t = useTranslations("transactions");
  const [draftMin, setDraftMin] = useState(min ?? "");
  const [draftMax, setDraftMax] = useState(max ?? "");
  // Follow the URL when it changes elsewhere (Clear all).
  const [seen, setSeen] = useState({ min, max });
  if (seen.min !== min || seen.max !== max) {
    setSeen({ min, max });
    setDraftMin(min ?? "");
    setDraftMax(max ?? "");
  }
  const sym = currencySymbol();

  function clean(v: string) {
    const n = Number(v.replace(",", "."));
    return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? String(n) : undefined;
  }
  function apply() {
    const nextMin = clean(draftMin);
    const nextMax = clean(draftMax);
    if (nextMin !== (min || undefined) || nextMax !== (max || undefined)) onChange(nextMin, nextMax);
  }

  const input = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-3.5 focus-within:border-clear-ink">
      <span className="text-[13px] font-bold text-clear-ink-2">{label}</span>
      <span aria-hidden className="text-sm font-bold text-clear-muted">{sym}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => set(e.target.value)}
        onBlur={apply}
        placeholder={placeholder}
        className="h-11 min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums text-clear-ink outline-none placeholder:text-clear-placeholder"
      />
    </label>
  );

  return (
    <FilterGroup label={t("filters.amount")}>
      <form
        className="flex gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        {input(t("filters.min"), draftMin, setDraftMin, "0")}
        {input(t("filters.max"), draftMax, setDraftMax, "∞")}
        <button type="submit" hidden />
      </form>
    </FilterGroup>
  );
}
