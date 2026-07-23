"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconX,
  IconCalendar,
  IconCategory,
  IconWallet,
  IconArrowsUpDown,
  IconSparkles,
  IconRepeat,
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
import { BUDGET_TYPE_LABELS } from "@/lib/format";
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
};

// Scrollable row of filter pills — the transactions subpage's replacement for the old
// single filter-icon-button + full sheet. Each pill applies its change immediately
// (no batch "Apply" step) and grows a trailing x once active, resetting just that
// filter back to its default.
export function TransactionFilterBar(props: Props) {
  const { cats, banks, financialMonth, search } = props;
  const router = useRouter();

  function push(overrides: Record<string, string | undefined>) {
    const base: Record<string, string | undefined> = {
      from: props.from,
      to: props.to,
      direction: props.direction,
      category: props.category,
      account: props.account,
      budgetType: props.budgetType,
      recurring: props.recurring ? "1" : undefined,
      search,
    };
    const merged = { ...base, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "/transactions");
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
      <PeriodPill
        from={props.from}
        to={props.to}
        financialMonth={financialMonth}
        onChange={(from, to) => push({ from, to })}
        onReset={() => push({ from: ALL_FROM, to: todayStr() })}
      />
      <CategoriesPill cats={cats} value={props.category} onChange={(v) => push({ category: v })} />
      <AccountsPill banks={banks} value={props.account} onChange={(v) => push({ account: v })} />
      <ChoicePill
        icon={<IconArrowsUpDown className="size-4 shrink-0" />}
        label="Operation type"
        value={props.direction}
        options={[
          { value: "income", label: "Income" },
          { value: "expense", label: "Expenses" },
        ]}
        onChange={(v) => push({ direction: v })}
      />
      <ChoicePill
        icon={<IconSparkles className="size-4 shrink-0" />}
        label="Nature"
        value={props.budgetType}
        options={[
          { value: "nodig", label: BUDGET_TYPE_LABELS.nodig },
          { value: "willen", label: BUDGET_TYPE_LABELS.willen },
        ]}
        onChange={(v) => push({ budgetType: v })}
      />
      <RecurringPill active={!!props.recurring} onToggle={() => push({ recurring: props.recurring ? undefined : "1" })} />
    </div>
  );
}

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function PeriodPill({
  from,
  to,
  financialMonth,
  onChange,
  onReset,
}: {
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  onChange: (from: string, to: string) => void;
  onReset: () => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const periods = transactionPeriods(financialMonth);
  const matched = matchTransactionPeriod(financialMonth, from, to);
  const isAll = matched ? matched.key === "all" : false;
  const label = matched ? matched.label : `${fmtDate(from)} – ${fmtDate(to)}`;

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
        <DropdownMenuTrigger className={cn(filterPillClass(!isAll, "shrink-0"))}>
          <IconCalendar className="size-4 shrink-0" />
          <span>{label}</span>
          {!isAll && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Reset period"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              className="shrink-0"
            >
              <IconX className="size-5 bg-white/40 rounded-full text-background p-1" />
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="min-w-48 w-auto p-1.5">
          {periods.map((p) => (
            <DropdownMenuItem key={p.key} onClick={() => onChange(p.from, p.to)}>
              {p.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={openCustom}>Custom…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent title="Custom period">
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs text-foreground/60 px-1">From</label>
              <DatePicker value={customFrom} onChange={setCustomFrom} triggerClassName="h-10 text-xs mt-0 mb-0" />
            </div>
            <div>
              <label className="text-xs text-foreground/60 px-1">To</label>
              <DatePicker value={customTo} onChange={setCustomTo} triggerClassName="h-10 text-xs mt-0 mb-0" />
            </div>
          </div>
          <button
            type="button"
            onClick={applyCustom}
            className="mt-4 w-full h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
          >
            Apply
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
              <span key={c.id} className="rounded-full ring-2 ring-background">
                <Icon iconKey={c.icon} color={c.color} round size="xs" />
              </span>
            ))}
            {selectedCats.length > 2 && (
              <span className="size-6 rounded-full bg-foreground/20 text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
                +{selectedCats.length - 2}
              </span>
            )}
          </span>
        ) : (
          <IconCategory className="size-4 shrink-0" />
        )}
        <span>Categories</span>
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Reset categories"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
            className="shrink-0"
          >
            <IconX className="size-5 bg-white/40 rounded-full text-background p-1" />
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
                  "size-6 rounded-full ring-2 ring-background text-white text-[10px] font-semibold flex items-center justify-center",
                  avatarColor(b.accountNumber ?? String(b.id)),
                )}
              >
                {(b.displayName ?? b.accountNumber ?? "?").charAt(0).toUpperCase()}
              </span>
            ))}
            {selectedBanks.length > 2 && (
              <span className="size-6 rounded-full bg-foreground/20 text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
                +{selectedBanks.length - 2}
              </span>
            )}
          </span>
        ) : (
          <IconWallet className="size-4 shrink-0" />
        )}
        <span>Accounts</span>
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Reset accounts"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
            className="shrink-0"
          >
            <IconX className="size-5 bg-white/40 rounded-full text-background p-1" />
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
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange: (v: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!value;
  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={filterPillClass(active, "shrink-0")}>
        {icon}
        <span>{selectedLabel ?? label}</span>
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Reset ${label}`}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
            className="shrink-0"
          >
            <IconX className="size-5 bg-white/40 rounded-full text-background p-1" />
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
                    "flex items-center rounded-xl px-4 py-3.5 text-sm text-left transition-colors",
                    isActive ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
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

function RecurringPill({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className={filterPillClass(active, "shrink-0")}>
      <IconRepeat className="size-4 shrink-0" />
      <span>Recurring</span>
      {active && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Reset recurring"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="shrink-0"
        >
          <IconX className="size-5 bg-white/40 rounded-full text-background p-1" />
        </span>
      )}
    </button>
  );
}
