import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { IconCheck, IconAlertTriangle, IconChevronRight, IconPlus, IconScan, IconFileUpload, IconWallet } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { ClearCard } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { MoneyText } from "@/components/clear/money";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { formatEur, formatEurWhole } from "@/lib/format";
import type { SafeToSpend } from "@/lib/safe-to-spend";
import { cn } from "@/lib/utils";
import { isReceiptScanReady } from "@/lib/ai-provider";

// On the hero the button colours follow the hero (black in light mode, light in dark),
// so they use the hero tokens rather than the primary ones.
const heroSolid = "bg-clear-hero-ink text-clear-hero hover:opacity-90";

/**
 * Home's answer card: Safe to spend (see lib/safe-to-spend.ts for the one definition:
 * the budget, minus what is spent, minus the bills still to come that will count
 * toward it). The card shows that sum underneath so the number explains itself. Without a budget it
 * asks for one instead of showing a different figure under the same label.
 */
export async function HomeHero({
  figures,
  resetsOn,
  spendByDay,
}: {
  figures: SafeToSpend | null;
  /** Formatted reset day ("25 Oct"). */
  resetsOn: string;
  /** Cumulative spend against the budget per day so far (lib/safe-to-spend budgetSpendByDay). */
  spendByDay: number[];
}) {
  const [t, receiptScan] = await Promise.all([getTranslations("home.hero"), isReceiptScanReady()]);

  if (!figures) {
    return (
      <ClearCard hero aria-labelledby="home-hero-title" className="justify-between gap-5" data-tip-anchor="homeHero">
        <div className="flex flex-col gap-3">
          <h2 id="home-hero-title" className="m-0 text-[17px] font-bold">{t("title")}</h2>
          <span className="clear-amount text-[56px]">—</span>
          <p className="m-0 text-[15px] text-clear-hero-ink-2">{t("noBudget")}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/budget" className={cn(clearButtonVariants({ size: "lg" }), heroSolid, "flex-1")}>
            <IconWallet aria-hidden />
            {t("setBudget")}
          </Link>
          <Link href="/settings?panel=import" className={cn(clearButtonVariants({ variant: "outline", size: "lg" }), "flex-1")}>
            <IconFileUpload aria-hidden />
            {t("importCsv")}
          </Link>
        </div>
      </ClearCard>
    );
  }

  const { target, spent, reserved, amount, perDay, elapsed, pace } = figures;
  const paceTone = pace === "onPace" ? "mint" : pace === "fast" ? "butter" : "rose";

  return (
    <ClearCard hero aria-labelledby="home-hero-title" className="gap-4" data-tip-anchor="homeHero">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-hero-title" className="m-0 text-[17px] font-bold">{t("title")}</h2>
        <div className="flex items-center gap-2">
          <ClearChip tone={paceTone} icon={pace === "onPace" ? <IconCheck stroke={3} aria-hidden /> : <IconAlertTriangle stroke={2.4} aria-hidden />}>
            {t(`pace.${pace}`)}
          </ClearChip>
          <PrivacyToggle />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Amount value={amount} className="text-[44px] lg:text-[48px]" />
        <p className="m-0 text-[15px] text-clear-hero-ink-2">
          <MoneyText>{amount > 0
            ? t.rich("perDay", { amount: formatEurWhole(perDay), date: resetsOn, b: (c) => <b className="text-clear-hero-ink"><MoneyText>{c}</MoneyText></b> })
            : t("overBudget")}</MoneyText>
        </p>
      </div>

      <PaceLine
        target={target}
        spent={spent}
        totalDays={figures.totalDays}
        spendByDay={spendByDay}
        title={t("paceTitle")}
        under={(amount) => t("underPace", { amount })}
        over={(amount) => t("overPace", { amount })}
        description={(spentSoFar, evenSoFar) => t("paceDescription", { spent: spentSoFar, even: evenSoFar })}
      />

      <div className="flex flex-col gap-2">
        <ClearProgress
          onHero
          value={target > 0 ? spent / target : 0}
          reserved={target > 0 ? reserved / target : 0}
          marker={elapsed}
        />
        {/* The sum behind the number, so it never has to be taken on trust. The budget
            figure is the way into the Budget page. */}
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px] text-clear-hero-ink-2">
          <span><MoneyText>{t("sum", { spent: formatEur(spent), bills: formatEur(reserved) })}</MoneyText></span>
          <Link
            href="/budget"
            title={t("openBudget")}
            data-tip-anchor="homeBudgetLink"
            className="inline-flex items-center gap-0.5 rounded-full text-clear-hero-ink-2 no-underline hover:text-clear-hero-ink hover:underline"
          >
            <MoneyText>{t("budget", { amount: formatEurWhole(target) })}</MoneyText>
            <IconChevronRight size={14} stroke={2.4} aria-hidden />
          </Link>
        </div>
      </div>

      {/* One row at every width: the main action, and scanning as a round icon button. */}
      <div className="flex gap-2.5">
        <Link href="/transactions/add" className={cn(clearButtonVariants({ size: "md" }), heroSolid, "min-w-0 flex-1")}>
          <IconPlus aria-hidden />
          {t("add")}
        </Link>
        {receiptScan && (
          <Link
            href="/transactions/add?scan=1"
            aria-label={t("scan")}
            title={t("scan")}
            className={clearButtonVariants({ variant: "outline", size: "icon" })}
          >
            <IconScan aria-hidden />
          </Link>
        )}
      </div>
    </ClearCard>
  );
}

/**
 * Spending so far against an even pace through the period: the ember line is what has
 * been spent, day by day, up to today; the dashed line is the budget spread evenly over
 * every day. Below the dashed line means there is room to spare. It grows to fill the
 * hero, so the card has no empty bottom next to taller neighbours.
 */
function PaceLine({
  target,
  spent,
  totalDays,
  spendByDay,
  title,
  under,
  over,
  description,
}: {
  target: number;
  spent: number;
  totalDays: number;
  spendByDay: number[];
  title: string;
  under: (amount: string) => string;
  over: (amount: string) => string;
  description: (spent: string, even: string) => string;
}) {
  if (spendByDay.length === 0) return null;
  // The day-by-day sum can differ a little from the budget's own total (sub-category
  // rollups, shared costs), so scale it to end exactly at the spent figure shown.
  const last = spendByDay[spendByDay.length - 1];
  const scale = last > 0 ? spent / last : 0;
  const W = 300;
  const H = 80;
  const top = 8;
  const ceiling = Math.max(target, spent) || 1;
  const x = (day: number) => (day / totalDays) * W;
  const y = (v: number) => H - (v / ceiling) * (H - top);
  const points = [`0,${H}`, ...spendByDay.map((v, i) => `${x(i + 1)},${y(v * scale)}`)];
  const lastX = x(spendByDay.length);
  const even = (target * spendByDay.length) / totalDays;
  const diff = even - spent;

  return (
    <div className="flex flex-auto flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-bold text-clear-hero-ink-2">{title}</span>
        <span className="font-bold"><MoneyText>{diff >= 0 ? under(formatEurWhole(diff)) : over(formatEurWhole(-diff))}</MoneyText></span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-12 min-h-0 w-full flex-auto"
        role="img"
        aria-label={description(formatEurWhole(spent), formatEurWhole(even))}
      >
        <line x1="0" y1={H} x2={W} y2={y(target)} stroke="var(--clr-hero-ink)" strokeOpacity="0.35" strokeDasharray="4 5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polygon points={`${points.join(" ")} ${lastX},${H}`} fill="var(--clr-ember)" fillOpacity="0.18" />
        <polyline points={points.join(" ")} fill="none" stroke="var(--clr-ember)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1={lastX} y1={top / 2} x2={lastX} y2={H} stroke="var(--clr-hero-ink)" strokeOpacity="0.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
