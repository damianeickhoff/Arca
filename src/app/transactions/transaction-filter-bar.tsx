"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  IconX,
  IconChevronDown,
  IconCalendarFilled,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DatePicker } from "@/components/date-picker";
import { CategoryMultiPicker } from "@/components/category-multi-picker";
import { AccountMultiPicker } from "@/components/account-multi-picker";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/format";
import { filterPillClass } from "@/components/filter-pill";
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
  /** "scroll" (default): one sideways-scrolling row on phones, wrapping from lg.
   *  "wrap": always wrapped — the phone Filters sheet shows every chip at once. */
  layout?: "scroll" | "wrap";
  /** Leave the period chip out from lg up, where TransactionPeriodCard shows it instead. */
  periodCardOnDesktop?: boolean;
};

/** Pushes a change to one filter while keeping every other filter in the URL. */
function useFilterPush(props: Props) {
  const router = useRouter();
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
    router.push(qs ? `?${qs}` : "/transactions");
  };
}

/** The period filter as Activity's desktop card: a caption and the period as a pill. */
export function TransactionPeriodCard(props: Props) {
  const push = useFilterPush(props);
  return (
    <PeriodPill
      variant="card"
      from={props.from}
      to={props.to}
      financialMonth={props.financialMonth}
      onChange={(from, to) => push({ from, to })}
      onReset={() => push({ from: ALL_FROM, to: todayStr() })}
    />
  );
}

// Activity's filter chips. Each chip applies its change immediately (no batch "Apply"
// step) and grows a trailing x once active, resetting just that filter back to its
// default. Every filter lives in the URL, so the server page does the filtering.
export function TransactionFilterBar(props: Props) {
  const { cats, banks, financialMonth } = props;
  const t = useTranslations("transactions");
  const push = useFilterPush(props);

  return (
    // On a phone the pills stay a single swipeable row. On desktop there's no touch
    // scrolling and scrollbars are hidden app-wide (globals.css), so an overflowing
    // row would strand the last filters with no way to reach them — wrap instead, so
    // every filter is visible.
    <div
      data-tip-anchor="activityFilters"
      data-surface={props.layout === "wrap" ? "card" : undefined}
      className={cn(
        "flex items-center gap-2",
        props.layout === "wrap"
          ? "flex-wrap gap-y-2"
          : "overflow-x-auto scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-x-visible lg:gap-y-2",
      )}
    >
      <PeriodPill
        hideOnDesktop={props.periodCardOnDesktop}
        from={props.from}
        to={props.to}
        financialMonth={financialMonth}
        onChange={(from, to) => push({ from, to })}
        onReset={() => push({ from: ALL_FROM, to: todayStr() })}
      />
      <AccountsPill banks={banks} value={props.account} onChange={(v) => push({ account: v })} />
      <CategoriesPill cats={cats} value={props.category} onChange={(v) => push({ category: v })} />
      <ChoicePill
        label={t("filters.nature")}
        value={props.budgetType}
        options={[
          { value: "nodig", label: t("filters.needs") },
          { value: "willen", label: t("filters.wants") },
          { value: "sparen", label: t("filters.save") },
        ]}
        onChange={(v) => push({ budgetType: v })}
      />
      <RecurringPill active={!!props.recurring} onToggle={() => push({ recurring: props.recurring ? undefined : "1" })} />
      <AmountPill min={props.min} max={props.max} onChange={(min, max) => push({ min, max })} />
      <ChoicePill
        label={t("filters.operationType")}
        value={props.direction}
        options={[
          { value: "income", label: t("income") },
          { value: "expense", label: t("expenses") },
        ]}
        onChange={(v) => push({ direction: v })}
      />
    </div>
  );
}

function PeriodPill({
  variant = "pill",
  hideOnDesktop = false,
  from,
  to,
  financialMonth,
  onChange,
  onReset,
}: {
  variant?: "pill" | "card";
  hideOnDesktop?: boolean;
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  onChange: (from: string, to: string) => void;
  onReset: () => void;
}) {
  const t = useTranslations("transactions");
  const locale = useLocale();
  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short" });
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const periods = transactionPeriods(financialMonth);
  const matched = matchTransactionPeriod(financialMonth, from, to);
  const isAll = matched ? matched.key === "all" : false;
  const label = matched ? t(`periods.${matched.key}`) : `${fmtDate(from)} – ${fmtDate(to)}`;

  function openCustom() {
    setCustomFrom(from);
    setCustomTo(to);
    setCustomOpen(true);
  }

  function applyCustom() {
    onChange(customFrom, customTo);
    setCustomOpen(false);
  }

  return (
    <>
      <DropdownMenu modal={false}>
        {variant === "card" ? (
          <DropdownMenuTrigger className="flex h-full w-full cursor-pointer flex-col justify-center gap-2 rounded-clear-card bg-clear-card px-5 py-[18px] text-left font-clear text-clear-ink transition-shadow hover:ring-2 hover:ring-clear-ink/10">
            <span className="inline-flex items-center gap-2 text-[13px] font-bold text-clear-ink-2">
              <IconCalendarFilled className="size-4 shrink-0" />
              {t("filters.period")}
            </span>
            <span className="inline-flex h-10 items-center justify-between gap-2 rounded-full bg-clear-ground pl-3.5 pr-2.5 text-[15px] font-extrabold">
              <span className="truncate">{label}</span>
              <IconChevronDown className="size-[18px] shrink-0" stroke={2} />
            </span>
          </DropdownMenuTrigger>
        ) : (
        <DropdownMenuTrigger className={cn(filterPillClass(!isAll, "shrink-0"), hideOnDesktop && "lg:hidden")}>
          <span>{label}</span>
          {isAll && <IconChevronDown aria-hidden className="size-4 shrink-0" stroke={2.2} />}
          {!isAll && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("filters.reset", { name: t("filters.period") })}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              className="shrink-0"
            >
              <IconX className="size-[18px] rounded-full bg-clear-ground/20 p-[3px] text-clear-primary-ink" />
            </span>
          )}
        </DropdownMenuTrigger>
        )}
        <DropdownMenuContent align="start" sideOffset={8} className="min-w-48 w-auto p-1.5">
          {periods.map((p) => (
            <DropdownMenuItem key={p.key} onClick={() => onChange(p.from, p.to)}>
              {t(`periods.${p.key}`)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={openCustom}>{t("filters.custom")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent title={t("filters.customPeriod")}>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs text-clear-ink/60 px-1">{t("filters.from")}</label>
              <DatePicker value={customFrom} onChange={setCustomFrom} triggerClassName="h-10 text-xs mt-0 mb-0" />
            </div>
            <div>
              <label className="text-xs text-clear-ink/60 px-1">{t("filters.to")}</label>
              <DatePicker value={customTo} onChange={setCustomTo} triggerClassName="h-10 text-xs mt-0 mb-0" />
            </div>
          </div>
          <button
            type="button"
            onClick={applyCustom}
            className="mt-4 w-full h-11 rounded-full bg-clear-primary text-clear-primary-ink text-sm font-bold"
          >
            {t("filters.apply")}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoriesPill({
  cats,
  value,
  onChange,
}: {
  cats: Category[];
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const t = useTranslations("transactions");
  const [open, setOpen] = useState(false);
  const selectedIds = value ? value.split(",").filter(Boolean) : [];
  const selectedCats = selectedIds
    .map((id) => cats.find((c) => String(c.id) === id))
    .filter((c): c is Category => !!c);
  const active = selectedCats.length > 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={filterPillClass(active, "shrink-0")}>
        {active ? (
          <span className="flex items-center -space-x-1.5 shrink-0">
            {selectedCats.slice(0, 2).map((c) => (
              <span key={c.id} className="rounded-full ring-2 ring-clear-card">
                <Icon iconKey={c.icon} color={c.color} round size="xs" />
              </span>
            ))}
            {selectedCats.length > 2 && (
              <span className="size-6 rounded-full bg-clear-primary/20 text-xs font-bold flex items-center justify-center ring-2 ring-clear-card">
                +{selectedCats.length - 2}
              </span>
            )}
          </span>
        ) : null}
        <span>{t("filters.categories")}</span>
        {!active && <IconChevronDown aria-hidden className="size-4 shrink-0" stroke={2.2} />}
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label={t("filters.reset", { name: t("filters.categories") })}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
            className="shrink-0"
          >
            <IconX className="size-[18px] rounded-full bg-clear-ground/20 p-[3px] text-clear-primary-ink" />
          </span>
        )}
      </button>
      <CategoryMultiPicker
        categories={cats}
        selected={selectedIds}
        open={open}
        onOpenChange={setOpen}
        onApply={(ids) => onChange(ids.length ? ids.join(",") : undefined)}
      />
    </>
  );
}

// Deterministic avatar tint from the account number, matching the add-transaction
// account picker's letter avatars — accounts have no icon of their own.
const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
function avatarColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function AccountsPill({
  banks,
  value,
  onChange,
}: {
  banks: Bank[];
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const t = useTranslations("transactions");
  const [open, setOpen] = useState(false);
  const selectedIds = value ? value.split(",").filter(Boolean) : [];
  const selectedBanks = selectedIds
    .map((id) => banks.find((b) => b.accountNumber === id))
    .filter((b): b is Bank => !!b);
  const active = selectedBanks.length > 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={filterPillClass(active, "shrink-0")}>
        {active ? (
          <span className="flex items-center -space-x-1.5 shrink-0">
            {selectedBanks.slice(0, 2).map((b) => (
              <span
                key={b.id}
                className={cn(
                  "size-6 rounded-full ring-2 ring-clear-card text-white text-xs font-semibold flex items-center justify-center",
                  avatarColor(b.accountNumber ?? String(b.id)),
                )}
              >
                {(b.displayName ?? b.accountNumber ?? "?").charAt(0).toUpperCase()}
              </span>
            ))}
            {selectedBanks.length > 2 && (
              <span className="size-6 rounded-full bg-clear-primary/20 text-xs font-bold flex items-center justify-center ring-2 ring-clear-card">
                +{selectedBanks.length - 2}
              </span>
            )}
          </span>
        ) : null}
        <span>{t("filters.accounts")}</span>
        {!active && <IconChevronDown aria-hidden className="size-4 shrink-0" stroke={2.2} />}
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label={t("filters.reset", { name: t("filters.accounts") })}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
            className="shrink-0"
          >
            <IconX className="size-[18px] rounded-full bg-clear-ground/20 p-[3px] text-clear-primary-ink" />
          </span>
        )}
      </button>
      <AccountMultiPicker
        banks={banks}
        selected={selectedIds}
        open={open}
        onOpenChange={setOpen}
        onApply={(ids) => onChange(ids.length ? ids.join(",") : undefined)}
      />
    </>
  );
}

// Shared "pick one of a few options" pill — used for Operation type and Nature.
function ChoicePill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange: (v: string | undefined) => void;
}) {
  const t = useTranslations("transactions");
  const [open, setOpen] = useState(false);
  const active = !!value;
  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={filterPillClass(active, "shrink-0")}>
        <span>{selectedLabel ?? label}</span>
        {!active && <IconChevronDown aria-hidden className="size-4 shrink-0" stroke={2.2} />}
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label={t("filters.reset", { name: label })}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
            className="shrink-0"
          >
            <IconX className="size-[18px] rounded-full bg-clear-ground/20 p-[3px] text-clear-primary-ink" />
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={label}>
          <div className="flex flex-col gap-1 -mx-1">
            {options.map((o) => {
              const isActive = value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={cn(
                    "flex items-center rounded-clear-row px-4 py-3.5 text-sm text-left transition-colors",
                    isActive ? "bg-clear-primary text-clear-primary-ink font-semibold" : "hover:bg-clear-tile text-clear-ink",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Amount range — sign-agnostic (it matches the size of the operation; the operation
// type chip decides the sign), the same min/max params the page already understood.
function AmountPill({
  min,
  max,
  onChange,
}: {
  min?: string;
  max?: string;
  onChange: (min: string | undefined, max: string | undefined) => void;
}) {
  const t = useTranslations("transactions");
  const [open, setOpen] = useState(false);
  const [draftMin, setDraftMin] = useState(min ?? "");
  const [draftMax, setDraftMax] = useState(max ?? "");
  const active = !!min || !!max;
  const sym = currencySymbol();
  const label = active
    ? min && max
      ? `${sym}${min}–${sym}${max}`
      : min
        ? `≥ ${sym}${min}`
        : `≤ ${sym}${max}`
    : t("filters.amount");

  function clean(v: string) {
    const n = Number(v.replace(",", "."));
    return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? String(n) : undefined;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setDraftMin(min ?? ""); setDraftMax(max ?? ""); setOpen(true); }}
        className={filterPillClass(active, "shrink-0")}
      >
        <span>{label}</span>
        {!active && <IconChevronDown aria-hidden className="size-4 shrink-0" stroke={2.2} />}
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label={t("filters.reset", { name: t("filters.amount") })}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onChange(undefined, undefined); }}
            className="shrink-0"
          >
            <IconX className="size-[18px] rounded-full bg-clear-ground/20 p-[3px] text-clear-primary-ink" />
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("filters.amount")}>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-bold text-clear-muted px-1">{t("filters.min")}</span>
              <input
                inputMode="decimal"
                value={draftMin}
                onChange={(e) => setDraftMin(e.target.value)}
                placeholder="0"
                className="h-11 rounded-[14px] bg-clear-tile px-4 text-sm font-semibold tabular-nums text-clear-ink outline-none focus:ring-3 focus:ring-clear-ember/25"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-bold text-clear-muted px-1">{t("filters.max")}</span>
              <input
                inputMode="decimal"
                value={draftMax}
                onChange={(e) => setDraftMax(e.target.value)}
                placeholder="∞"
                className="h-11 rounded-[14px] bg-clear-tile px-4 text-sm font-semibold tabular-nums text-clear-ink outline-none focus:ring-3 focus:ring-clear-ember/25"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => { onChange(clean(draftMin), clean(draftMax)); setOpen(false); }}
            className="mt-4 w-full h-11 rounded-full bg-clear-primary text-clear-primary-ink text-sm font-bold"
          >
            {t("filters.apply")}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RecurringPill({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const t = useTranslations("transactions");
  return (
    <button type="button" onClick={onToggle} className={filterPillClass(active, "shrink-0")}>
      <span>{t("filters.recurring")}</span>
      {active && (
        <span
          role="button"
          tabIndex={0}
          aria-label={t("filters.reset", { name: t("filters.recurring") })}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="shrink-0"
        >
          <IconX className="size-[18px] rounded-full bg-clear-ground/20 p-[3px] text-clear-primary-ink" />
        </span>
      )}
    </button>
  );
}
