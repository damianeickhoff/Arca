"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MonthDial } from "./month-dial";

export type HeroPace = "onPace" | "fast" | "over" | "onTrack" | "low";

export interface HeroFigures {
  /** The headline "safe to spend" amount for this mode. */
  amount: number;
  /** Per-day allowance until the period resets; null when there is no period to spread over. */
  perDay: number | null;
  /** The reset date, already formatted for the user's locale ("25 Oct"). */
  until: string;
  pace: HeroPace | null;
  /** Shown instead of the per-day line when the figure needs explaining (no budget set). */
  hint: string | null;
  totalDays: number;
  daysLeft: number;
}

/**
 * The Home hero — the only saturated block on the page: a solid mustard card with ink
 * type. "Safe to spend" for the month (what's left of the budget) or from the balance
 * (what's in the accounts minus the bills still due), the per-day allowance, a pace
 * pill, and the month dial. On desktop it also carries three small stat chips.
 */
export function HeroCard({
  month,
  balance,
  stats,
}: {
  month: HeroFigures;
  balance: HeroFigures;
  stats: { budgetUsed: string; forecastLow: string; health: string };
}) {
  const t = useTranslations("home.hero");
  const [mode, setMode] = useState<"month" | "balance">("month");
  const figures = mode === "month" ? month : balance;

  const formatted = formatEur(figures.amount);
  const comma = formatted.lastIndexOf(",");
  const whole = comma === -1 ? formatted : formatted.slice(0, comma);
  const cents = comma === -1 ? "" : formatted.slice(comma);

  const warn = figures.pace === "fast" || figures.pace === "over" || figures.pace === "low";

  return (
    <section
      data-tip-anchor="homeHero"
      aria-label={t("safeToSpend")}
      className="flex flex-col gap-4 rounded-hero bg-mustard p-[22px] text-[#1E1A14]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-[rgba(30,26,20,0.7)]">{t("safeToSpend")}</span>
        <div role="tablist" aria-label={t("modeLabel")} className="inline-flex gap-0.5 rounded-2xl bg-[rgba(30,26,20,0.10)] p-[3px]">
          {(["month", "balance"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "h-[26px] rounded-[13px] px-2.5 text-xs font-bold transition-colors",
                mode === m ? "bg-[#1E1A14] text-[#F6F3EC]" : "text-[#1E1A14]",
              )}
            >
              {t(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="amount tabular-nums whitespace-nowrap text-[46px] lg:text-[64px]">
            {whole}
            <span className="text-[23px] text-[rgba(30,26,20,0.7)] lg:text-[32px]">{cents}</span>
          </span>
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-[rgba(30,26,20,0.7)]">
            {figures.hint
              ? figures.hint
              : figures.perDay != null &&
                t("perDay", { amount: formatEur(Math.round(figures.perDay)).replace(/,00$/, ""), date: figures.until })}
            {figures.pace && (
              <span className="inline-flex h-[22px] items-center gap-1 rounded-[11px] bg-[#1E1A14] px-2 text-[11px] font-bold text-mustard">
                {warn ? <IconAlertTriangle size={12} stroke={2} /> : <IconCheck size={12} stroke={2.4} />}
                {t(`pace.${figures.pace}`)}
              </span>
            )}
          </span>
        </div>
        <MonthDial
          totalDays={figures.totalDays}
          daysLeft={figures.daysLeft}
          size={84}
          daysLabel={t("days")}
          ariaLabel={t("daysLeft", { count: figures.daysLeft })}
          className="lg:hidden"
        />
        <MonthDial
          totalDays={figures.totalDays}
          daysLeft={figures.daysLeft}
          size={104}
          daysLabel={t("days")}
          ariaLabel={t("daysLeft", { count: figures.daysLeft })}
          className="hidden lg:inline-flex"
        />
      </div>

      <div className="hidden grid-cols-3 gap-2 lg:grid">
        <HeroStat label={t("stats.budgetUsed")} value={stats.budgetUsed} />
        <HeroStat label={t("stats.forecastLow")} value={stats.forecastLow} />
        <HeroStat label={t("stats.health")} value={stats.health} />
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px] rounded-xl bg-white/35 px-3 py-2.5">
      <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[rgba(30,26,20,0.7)]">{label}</span>
      <span className="truncate text-[15px] font-bold tabular-nums">{value}</span>
    </div>
  );
}
