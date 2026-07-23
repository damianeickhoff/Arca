"use client";

import { useState } from "react";
import { AmountInput } from "@/components/ui/amount-input";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { currencySymbol, formatEur } from "@/lib/format";

interface DebtData {
  name: string;
  currentBalance: number;
  minimumPayment: number;
  color: string | null;
  icon: string | null;
}

interface Props {
  debts: DebtData[];
}

function fmtMonth(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function payoffMonths(balance: number, payment: number): number | null {
  return payment > 0 && balance > 0 ? Math.ceil(balance / payment) : balance === 0 ? 0 : null;
}
function payoffDate(months: number | null): Date | null {
  if (months == null) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

export function DebtSimulationClient({ debts }: Props) {
  const [globalExtra, setGlobalExtra] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});

  const activeDebts = debts.filter((d) => d.currentBalance > 0);
  const count = activeDebts.length || 1;

  // Overall simulation: global extra distributed evenly
  const globalNum = Math.max(0, parseFloat(globalExtra) || 0);
  const globalPerDebt = globalNum / count;
  const baseLatestMonths = Math.max(0, ...activeDebts.map((d) => payoffMonths(d.currentBalance, d.minimumPayment) ?? 0));
  const simLatestMonths = Math.max(0, ...activeDebts.map((d) => payoffMonths(d.currentBalance, d.minimumPayment + globalPerDebt) ?? 0));
  const globalSaved = baseLatestMonths - simLatestMonths;
  const globalLatestDate = payoffDate(simLatestMonths > 0 ? simLatestMonths : null);
  const baseLatestDate = payoffDate(baseLatestMonths > 0 ? baseLatestMonths : null);

  // Per-debt simulation
  function setExtra(name: string, value: string) {
    setExtras((prev) => ({ ...prev, [name]: value }));
  }

  const perDebtSims = activeDebts.map((debt) => {
    const extraNum = Math.max(0, parseFloat(extras[debt.name] ?? "0") || 0);
    const totalPayment = debt.minimumPayment + globalPerDebt + extraNum;
    const baseMonths = payoffMonths(debt.currentBalance, debt.minimumPayment);
    const newMonths = payoffMonths(debt.currentBalance, totalPayment);
    const savedMonths = baseMonths != null && newMonths != null ? baseMonths - newMonths : 0;
    return {
      ...debt,
      extraNum,
      totalPayment,
      baseMonths,
      newMonths,
      savedMonths,
      payoffDate: payoffDate(newMonths),
      basePayoffDate: payoffDate(baseMonths),
    };
  });

  return (
    <div className="rounded-2xl bg-card lg:bg-card p-5 mt-5 space-y-5">
      <div>
        <h2 className="font-medium text-base">Debt simulator</h2>
        <p className="text-xs text-foreground/60 mt-0.5">
          Simulate the effect of putting extra money in a debt.
        </p>
      </div>

      {/* Overall simulator */}
      <div className="rounded-xl bg-foreground/3 lg:border lg:bg-transparent p-4 space-y-3">
        <p className="text-xs font-medium text-foreground uppercase tracking-wider">Total extra (seperated evenly)</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 w-36">
            <span className={cn("text-sm", globalExtra ? "text-foreground" : "text-foreground/30")}>{currencySymbol()}</span>
            <AmountInput
              value={globalExtra}
              onChange={(e) => setGlobalExtra(e.target.value)}
              className="pt-2"
              placeholder="0"
            />
          </div>
          <span className="text-sm text-foreground/60">extra per month, seperated over {count} debts</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-base text-foreground mb-0.5">debt free on</p>
            <p className="text-lg font-medium">{baseLatestDate ? fmtMonth(baseLatestDate) : "—"}</p>
            {baseLatestMonths > 0 && <p className="text-xs text-foreground/60">{baseLatestMonths} mnd</p>}
          </div>
          <div>
            <p className="text-sm text-foreground mb-0.5">Incl. putting extra</p>
            <p className={`font-medium text-lg ${globalSaved > 0 ? "text-green-600" : ""}`}>
              {globalNum > 0 && globalLatestDate ? fmtMonth(globalLatestDate) : "—"}
            </p>
            {globalNum > 0 && simLatestMonths > 0 && <p className="text-xs text-foreground/60">{simLatestMonths} mnd</p>}
          </div>
          {globalSaved > 0 && (
            <div>
              <p className="text-base text-foreground mb-0.5">Tijdwinst</p>
              <p className="font-medium text-lg text-green-600">-{globalSaved} maanden</p>
            </div>
          )}
        </div>

      </div>

      {/* Per-debt simulator */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground uppercase tracking-wider">Per debt</p>

        {/* Mobile: stacked cards */}
        <div className="md:hidden space-y-2">
          {perDebtSims.map((s) => (
            <div key={s.name} className="py-3 px-4 rounded-xl bg-foreground/3 flex items-center gap-3">
              <Icon iconKey={s.icon} color={s.color} size="xxl" round flat />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{s.name}</p>
                <p className="text-xs text-foreground/60 mt-0.5">{formatEur(s.totalPayment)} / mnd</p>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center justify-end gap-1 w-24">
                  <span className={cn("text-xs", extras[s.name] ? "text-foreground" : "text-foreground/30")}>{currencySymbol()}</span>
                  <AmountInput
                    value={extras[s.name] ?? ""}
                    onChange={(e) => setExtra(s.name, e.target.value)}
                    className="pr-2 h-8 text-sm text-right"
                    placeholder="0"
                  />
                </div>
                <p className={cn("text-xs mt-0.5", s.payoffDate ? (s.savedMonths > 0 ? "text-green-600 font-semibold" : "text-foreground/60") : "text-foreground/60")}>
                  {s.payoffDate ? (
                    <>
                      {fmtMonth(s.payoffDate)}
                      {s.savedMonths > 0 && <span className="ml-1">(-{s.savedMonths} mnd)</span>}
                    </>
                  ) : "—"}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block divide-y rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[1fr_110px_130px_120px] gap-3 px-4 py-2 text-xs text-muted-foreground font-medium bg-muted/30">
            <span>Debt</span>
            <span className="text-right">Extra / mnd</span>
            <span className="text-right">Nieuw bedrag</span>
            <span className="text-right">Vrij op</span>
          </div>
          {perDebtSims.map((s) => (
            <div key={s.name} className="grid grid-cols-[1fr_110px_130px_120px] gap-3 px-4 py-3 items-center">
              <div className="flex items-center gap-2 min-w-0">
                <Icon iconKey={s.icon} color={s.color} size="xxl" round flat />
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{s.name}</p>
                  {s.basePayoffDate && (
                    <p className="text-[10px] text-foreground/60">Min: {fmtMonth(s.basePayoffDate)}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <div className="flex items-center gap-1 w-24">
                  <span className={cn("text-xs", extras[s.name] ? "text-foreground" : "text-foreground/30")}>{currencySymbol()}</span>
                  <AmountInput
                    value={extras[s.name] ?? ""}
                    onChange={(e) => setExtra(s.name, e.target.value)}
                    className="pr-2 h-8 text-sm text-right"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{formatEur(s.totalPayment)}</p>
                {(globalPerDebt > 0 || s.extraNum > 0) && (
                  <p className="text-[10px] text-green-600">
                    {globalPerDebt > 0 && s.extraNum > 0
                      ? `+${formatEur(globalPerDebt)} gl. +${formatEur(s.extraNum)}`
                      : globalPerDebt > 0
                      ? `+${formatEur(globalPerDebt)} globaal`
                      : `+${formatEur(s.extraNum)} extra`}
                  </p>
                )}
              </div>

              <div className="text-right">
                {s.payoffDate ? (
                  <>
                    <p className={`text-sm font-semibold tabular-nums ${s.savedMonths > 0 ? "text-green-600" : ""}`}>
                      {fmtMonth(s.payoffDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.newMonths} mnd
                      {s.savedMonths > 0 && <span className="text-green-600 ml-1">(-{s.savedMonths})</span>}
                    </p>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
