"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEurWhole } from "@/lib/format";
import { ClearChip } from "@/components/clear/chip";
import { MoneyText } from "@/components/clear/money";

export type BudgetStrategyDraft = { nodig: number; willen: number; sparen: number };

const KINDS = ["nodig", "willen", "sparen"] as const;
type Kind = (typeof KINDS)[number];

// The same colours as the strategy card on the Budget page.
const FILL: Record<Kind, string> = { nodig: "bg-clear-primary", willen: "bg-clear-ember", sparen: "bg-clear-info" };
const RING: Record<Kind, string> = { nodig: "border-clear-primary", willen: "border-clear-ember", sparen: "border-clear-info" };

export function strategyTotal(s: BudgetStrategyDraft) {
  return s.nodig + s.willen + s.sparen;
}

/**
 * The Needs / Wants / Savings split as three sliders on a grey tile: each share with
 * what it comes to on this month's income, a check that they add up to 100% and the
 * combined bar. A slider can't take the total past 100%.
 */
export function BudgetStrategyEditor({
  value,
  onChange,
  income,
  title,
}: {
  value: BudgetStrategyDraft;
  onChange: (next: BudgetStrategyDraft) => void;
  income: number;
  /** Shown above the income line; the standalone dialog already has it as its title. */
  title?: string;
}) {
  const t = useTranslations("budget");
  const tKind = useTranslations("plan.budget.strategy");
  const id = useId();
  const total = strategyTotal(value);
  const ok = total === 100;

  function set(kind: Kind, next: number) {
    const max = 100 - (total - value[kind]);
    onChange({ ...value, [kind]: Math.max(0, Math.min(max, Math.round(next))) });
  }

  return (
    <div className="flex flex-col gap-4 rounded-clear-tile bg-clear-tile px-5 py-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          {title && <h3 className="m-0 text-base font-bold">{title}</h3>}
          <span className="text-[13px] text-clear-ink-2">
            <MoneyText>{income > 0
              ? t.rich("strategyBasedOn", { income: formatEurWhole(income), b: (c) => <b className="text-clear-ink"><MoneyText>{c}</MoneyText></b> })
              : t("strategyNoIncome")}</MoneyText>
          </span>
        </div>
        {/* The chip is the only "doesn't add up" signal, so it's announced as it changes. */}
        <span role="status" className="inline-flex shrink-0">
          {ok ? (
            <ClearChip tone="mint" icon={<IconCheck stroke={3} aria-hidden />}>
              100%
            </ClearChip>
          ) : (
            <ClearChip tone="rose" className="text-clear-negative">
              {total}%
            </ClearChip>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {KINDS.map((kind) => {
          const v = value[kind];
          const inputId = `${id}-${kind}`;
          const at = `calc(11px + (100% - 22px) * ${v / 100})`;
          return (
            <div key={kind} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 sm:grid-cols-[132px_minmax(0,1fr)_132px] sm:gap-[18px]">
              <label htmlFor={inputId} className="inline-flex min-w-0 items-center gap-2 text-[15px] font-bold">
                <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", FILL[kind])} />
                {tKind(kind)}
              </label>
              <span className="text-right whitespace-nowrap tabular-nums sm:order-last">
                <b className="text-[15px] font-extrabold">{v}%</b>
                {income > 0 && <span className="text-[13px] font-semibold text-clear-ink-2"> · <MoneyText>{formatEurWhole((income * v) / 100)}</MoneyText></span>}
              </span>
              <div className="relative col-span-2 h-2 rounded-full bg-clear-line sm:col-span-1">
                <span aria-hidden className={cn("absolute inset-y-0 left-0 rounded-full", FILL[kind])} style={{ width: at }} />
                <input
                  id={inputId}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={v}
                  onChange={(e) => set(kind, Number(e.target.value))}
                  aria-valuetext={`${v}%`}
                  className="peer absolute inset-x-0 -top-2.5 m-0 h-7 w-full cursor-pointer touch-none opacity-0"
                />
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute top-1/2 size-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-clear-card shadow-sm peer-focus-visible:ring-3 peer-focus-visible:ring-clear-ember/50",
                    RING[kind],
                  )}
                  style={{ left: at }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div aria-hidden className="flex h-2.5 gap-[3px] overflow-hidden">
        {KINDS.map((kind) => (
          <span key={kind} className={cn("rounded-full", FILL[kind])} style={{ width: `${value[kind]}%` }} />
        ))}
      </div>
    </div>
  );
}
