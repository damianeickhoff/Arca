"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEurWhole } from "@/lib/format";
import type { PayoffPlanRow, PayoffSimulation } from "@/lib/debt-simulate";
import { Amount } from "@/components/clear/amount";
import { ClearCard } from "@/components/clear/card";
import { ClearProgress } from "@/components/clear/progress";
import { MoneyText } from "@/components/clear/money";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { DEBT_SORTS, debtPaidPct, type ComputedDebt, type DebtSort } from "./debt-shared";
import { DebtIcon, monthsFromNow, useMonthYear } from "./debt-ui";

// Plan · Debts on phones (below lg): the parts that are laid out differently from the
// desktop grid, so nothing squeezes into 2- and 3-up tiles or a wide table. Desktop
// renders its own versions in debts-view.tsx; these are hidden from lg.

type Sim = PayoffSimulation;

/** One full-width "You owe" hero: the total, the count and minimums, then debt-free and the first payoff. */
export function PhoneHero({
  active,
  totalDebt,
  totalMonthly,
  debtFree,
  className,
}: {
  active: ComputedDebt[];
  totalDebt: number;
  totalMonthly: number;
  /** What the Debt-free tile says: the month (or "Now", "—"). */
  debtFree: string;
  className?: string;
}) {
  const t = useTranslations("plan.debts");
  const monthYear = useMonthYear();
  const first = active
    .filter((c) => !c.neverPaysOff && c.lastPaymentDate)
    .sort((a, z) => a.lastPaymentDate!.getTime() - z.lastPaymentDate!.getTime())[0];
  const row = "flex min-h-12 items-center justify-between gap-3";

  return (
    <ClearCard hero data-tip-anchor="debtsOwe" aria-labelledby="debts-phone-owe-title" className={cn("gap-3.5 p-5", className)}>
      <h2 id="debts-phone-owe-title" className="m-0 text-[17px] font-bold">{t("tiles.owe")}</h2>
      <Amount value={totalDebt} whole splitCents={false} sign="none" className="text-[44px] leading-none tracking-[-0.035em]" />
      <span className="text-[15px] text-clear-hero-ink-2">
        <MoneyText>{active.length > 0 ? t("phone.heroLine", { count: active.length, amount: formatEurWhole(totalMonthly) }) : t("tiles.oweNone")}</MoneyText>
      </span>
      {active.length > 0 && (
        <div className="flex flex-col rounded-clear-tile bg-clear-hero-ink/8 px-3.5 py-1">
          <div className={row}>
            <span className="text-sm text-clear-hero-ink-2">{t("tiles.free.title")}</span>
            <span className="text-base font-extrabold">{debtFree}</span>
          </div>
          {first && (
            <div className={cn(row, "border-t border-clear-hero-ink/12")}>
              <span className="text-sm text-clear-hero-ink-2">{t("phone.firstPaidOff")}</span>
              <span className="min-w-0 truncate text-base font-extrabold">{t("phone.firstValue", { name: first.debt.name, date: monthYear(first.lastPaymentDate!) })}</span>
            </div>
          )}
        </div>
      )}
    </ClearCard>
  );
}

/** Your debts as a short list: icon, name and what is left, a thin bar, "Free in …", a chevron. */
export function PhoneDebtList({
  computed,
  payoffMonths,
  onOpen,
  className,
}: {
  computed: ComputedDebt[];
  /** Each debt's payoff month with the simulator's extra; null never, missing when paid off. */
  payoffMonths: ReadonlyMap<number, number | null>;
  onOpen: (id: number) => void;
  className?: string;
}) {
  const t = useTranslations("plan.debts.tile");
  const monthYear = useMonthYear();
  return (
    <ul className={cn("m-0 flex list-none flex-col p-0", className)}>
      {computed.map((c, i) => {
        const done = c.currentBalance === 0;
        const months = payoffMonths.get(c.debt.id);
        const pct = debtPaidPct(c.debt, c.amountPaid, c.currentBalance);
        const status = done
          ? t("done")
          : months === null || (months === undefined && c.neverPaysOff)
            ? t("never")
            : months !== undefined
              ? t("payoffIn", { date: monthYear(monthsFromNow(months)) })
              : t("noDate");
        return (
          <li key={c.debt.id} className={cn(i > 0 && "border-t border-clear-ground")}>
            <button
              type="button"
              onClick={() => onOpen(c.debt.id)}
              className="flex min-h-[68px] w-full cursor-pointer items-center gap-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50"
            >
              <DebtIcon icon={c.debt.icon ?? c.linkedBills[0]?.icon} color={c.debt.color} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-bold">{c.debt.name}</span>
                  <Amount value={c.currentBalance} whole splitCents={false} sign="none" className="shrink-0 text-[15px]" />
                </span>
                <ClearProgress value={pct / 100} size="sm" fillClassName={done ? "bg-clear-positive-fill" : "bg-clear-primary"} />
                <span className={cn("text-[13px]", done ? "text-clear-positive" : "text-clear-muted")}>
                  {status}
                </span>
              </span>
              <IconChevronRight aria-hidden size={16} stroke={2.4} className="shrink-0 text-clear-placeholder" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The payoff order as a vertical list of three options, each with what it leads to. */
export function PhoneOrderList({
  order,
  onOrder,
  sim,
  sims,
  className,
}: {
  order: DebtSort;
  onOrder: (order: DebtSort) => void;
  sim: Sim;
  sims: ReadonlyMap<DebtSort, Sim>;
  className?: string;
}) {
  const t = useTranslations("plan.debts");
  const monthYear = useMonthYear();
  const result = (o: DebtSort) => {
    const s = sims.get(o)!;
    if (s.months == null) return t("tile.never");
    const date = monthYear(monthsFromNow(s.months));
    const less = Math.round(sim.interest - s.interest);
    return o !== order && less > 0 ? t("phone.orderResultLess", { date, amount: formatEurWhole(less) }) : t("phone.orderResult", { date });
  };
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span id="debts-phone-order" className="text-sm font-bold">{t("phone.payOffFirst")}</span>
      <div role="radiogroup" aria-labelledby="debts-phone-order" className="flex flex-col gap-2">
        {DEBT_SORTS.map((o) => {
          const on = o === order;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onOrder(o)}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-clear-tile border-2 bg-clear-card px-3.5 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                on ? "border-clear-ink" : "border-clear-line hover:border-clear-placeholder",
              )}
            >
              <span aria-hidden className={cn("size-5 shrink-0 rounded-full", on ? "border-[6px] border-clear-ink" : "border-2 border-clear-placeholder")} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{t(`sort.short.${o}`)}</span>
                <span className="text-[13px] text-clear-muted"><MoneyText>{result(o)}</MoneyText></span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** What the extra does, as three rows on a mint tile: debt-free, sooner by, interest saved. */
export function PhoneResults({ base, sim, className }: { base: Sim; sim: Sim; className?: string }) {
  const t = useTranslations("plan.debts.simulator");
  const monthYear = useMonthYear();
  const sooner = base.months != null && sim.months != null ? base.months - sim.months : null;
  const rows = [
    { label: t("debtFree"), value: sim.months != null ? monthYear(monthsFromNow(sim.months)) : "—" },
    { label: t("sooner"), value: sooner != null && sooner > 0 ? t("months", { count: sooner }) : "—" },
    { label: t("saved"), value: formatEurWhole(Math.max(0, Math.round((base.interest - sim.interest) * 100) / 100)) },
  ];
  return (
    <dl className={cn("m-0 flex flex-col rounded-clear-tile bg-clear-mint px-3.5 py-0.5 text-clear-mint-ink", className)}>
      {rows.map((r, i) => (
        <div key={r.label} className={cn("flex min-h-12 items-center justify-between gap-3", i > 0 && "border-t border-clear-mint-ink/15")}>
          <dt className="text-sm">{r.label}</dt>
          <dd className="m-0 text-base font-extrabold tabular-nums"><MoneyText>{r.value}</MoneyText></dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * "Where the €100 goes, month by month" as a row that opens a sheet: per debt in the
 * payoff order its minimum, the extra it gets now, what you pay, until when and what
 * happens then — the desktop table, stacked so nothing scrolls sideways.
 */
export function PlanSheetRow({
  active,
  plan,
  extra,
  spread,
  className,
}: {
  active: ComputedDebt[];
  plan: PayoffPlanRow[];
  extra: number;
  spread: boolean;
  className?: string;
}) {
  const t = useTranslations("plan.debts.simulator.plan");
  const tTile = useTranslations("plan.debts.tile");
  const tForm = useTranslations("debtForm");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const [open, setOpen] = useState(false);
  const byId = new Map(active.map((c) => [c.debt.id, c]));
  const name = (id: number | null) => (id != null ? byId.get(id)?.debt.name ?? "" : "");
  const date = (m: number) => monthYear(monthsFromNow(m));
  const title = extra > 0 ? t("title", { amount: formatEurWhole(extra) }) : t("titleNone");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-h-[52px] cursor-pointer items-center justify-between gap-3 rounded-clear-tile border border-clear-line bg-clear-card px-3.5 py-2 text-left text-sm font-bold transition-colors hover:bg-clear-tile",
          className,
        )}
      >
        <span><MoneyText>{title}</MoneyText></span>
        <IconChevronRight aria-hidden size={16} stroke={2.2} className="shrink-0" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideHeaderRow title={title} className="gap-4 pt-6 font-clear text-clear-ink">
          <ClearDialogHeader title={<MoneyText>{title}</MoneyText>} subtitle={t("note")} onClose={() => setOpen(false)} closeLabel={tForm("close")} />
          <div className="flex flex-col gap-3 pb-2">
            {plan.map((r) => {
              const c = byId.get(r.id);
              if (!c) return null;
              const until =
                r.months == null
                  ? t("never")
                  : r.step
                    ? t("untilStep", { date: date(r.step.month), amount: formatEurWhole(r.step.pay) })
                    : t("untilPaidOff", { date: date(r.months) });
              const then =
                r.months == null
                  ? t("none")
                  : spread
                    ? r.rollsTo != null
                      ? t("spreadOn")
                      : t("none")
                    : r.step
                      ? r.rollsTo != null
                        ? t("paidOffRolls", { date: date(r.months), name: name(r.rollsTo) })
                        : t("paidOff", { date: date(r.months) })
                      : r.rollsTo != null
                        ? t("rollsOn", { amount: formatEurWhole(r.rolls), name: name(r.rollsTo) })
                        : t("none");
              const rows = [
                { label: t("minimum"), value: formatEurWhole(r.minimum) },
                { label: t("extraNow"), value: r.extraNow > 0 ? tTile("extraPlus", { amount: formatEurWhole(r.extraNow) }) : formatEurWhole(0), accent: r.extraNow > 0 },
                { label: t("pay"), value: formatEurWhole(r.pay), bold: true },
                { label: t("until"), value: until },
                { label: t("then"), value: then },
              ];
              return (
                <section key={r.id} aria-label={c.debt.name} className="flex flex-col rounded-clear-tile bg-clear-tile px-3.5 pt-3 pb-1">
                  <div className="flex items-center gap-3 pb-1">
                    <DebtIcon icon={c.debt.icon ?? c.linkedBills[0]?.icon} color={c.debt.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{c.debt.name}</span>
                    <span className="text-[13px] text-clear-muted">{t("rate", { rate: (c.debt.interestRate ?? 0).toLocaleString(locale) })}</span>
                  </div>
                  <dl className="m-0 flex flex-col">
                    {rows.map((row) => (
                      <div key={row.label} className="flex min-h-10 items-center justify-between gap-3 border-t border-clear-ground py-1.5">
                        <dt className="shrink-0 text-[13px] text-clear-muted">{row.label}</dt>
                        <dd className={cn("m-0 text-right text-sm tabular-nums", row.bold && "font-extrabold", row.accent && "font-bold text-clear-ember-text")}>
                          <MoneyText>{row.value}</MoneyText>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
