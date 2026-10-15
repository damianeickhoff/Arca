"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { IconAdjustmentsHorizontal, IconArrowDown, IconArrowUp, IconListDetails, IconPigMoney, IconPlus } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEur, formatEurWhole } from "@/lib/format";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { SPLIT_GRID } from "@/components/page-container";
import { PageHeading, SectionHead } from "@/components/ui/page-heading";
import { Stat } from "@/components/ui/stat";
import { Pill } from "@/components/ui/pill";
import { Bar, Ring } from "@/components/ui/ring";
import { CategoryIcon } from "@/components/ui/category-icon";
import { buttonVariants } from "@/components/ui/button";
import { SearchButton } from "@/components/shell/search-context";
import { PlanSwitch } from "@/components/shell/plan-switch";
import { AnchoredTip } from "@/components/anchored-tip";
import type { Goal } from "@/db/schema";
import { goalProgressPct } from "./goal-shared";
import { SavingsGoalDetailDialog } from "./savings-goal-detail-dialog";
import { SavingsGoalEditDialog } from "./savings-goal-edit-dialog";
import type { GoalsPageData } from "./load-goals";

const CARD = "rounded-card border border-line bg-surface shadow-card";
const GHOST = cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-3.5 text-[13px] font-semibold");

function goalColor(g: Goal) {
  return g.color ?? "var(--arca-accent)";
}

/** Payments still needed at the planned monthly amount: 0 when reached, null without a monthly amount. */
function monthsLeft(g: Goal): number | null {
  const remaining = g.targetAmount - g.currentAmount;
  if (g.targetAmount > 0 && remaining <= 0) return 0;
  const monthly = g.monthlyContribution ?? 0;
  return monthly > 0 && remaining > 0 ? Math.ceil(remaining / monthly) : null;
}

function addMonths(n: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d;
}

function useFormats() {
  const locale = useLocale();
  const monthYear = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" });
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  return {
    monthYear: (d: Date) => monthYear.format(d),
    /** "Nov 25" from a YYYY-MM */
    monthKey: (m: string) => monthShort.format(new Date(`${m}-15T12:00:00`)),
    day: (date: string) => day.format(new Date(`${date}T12:00:00`)),
  };
}

// ── Header ────────────────────────────────────────────────────────────────────

export function GoalsHeader({ goals }: { goals: Goal[] }) {
  const t = useTranslations("plan.goals");
  const tPlan = useTranslations("plan");
  const { monthYear } = useFormats();
  const upcoming = goals
    .map((g) => monthsLeft(g))
    .filter((m): m is number => m != null && m > 0)
    .sort((a, z) => a - z)[0];
  const parts = [t("count", { count: goals.length })];
  if (upcoming != null) parts.push(t("next", { date: monthYear(addMonths(upcoming)) }));
  return (
    <PageHeading
      className="w-full"
      title={
        <>
          <span className="lg:hidden">{tPlan("title")}</span>
          <span className="hidden lg:inline">{t("title")}</span>
        </>
      }
      subtitle={<span className="hidden lg:inline">{parts.join(" · ")}</span>}
      actions={
        <>
          <Link
            href="/goals/add?type=savings"
            aria-label={t("add")}
            className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-surface-2 lg:hidden"
          >
            <IconPlus size={18} stroke={1.8} />
          </Link>
          <Link href="/goals/add?type=savings" className={cn(GHOST, "hidden lg:inline-flex")}>
            <IconPlus size={16} stroke={1.8} />
            {t("add")}
          </Link>
          <SearchButton />
        </>
      }
    />
  );
}

// ── Page body ─────────────────────────────────────────────────────────────────

export function GoalsView({ data }: { data: GoalsPageData }) {
  const t = useTranslations("plan.goals");
  const isDesktop = useIsDesktop();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);

  const goals = data.goals;
  const selected = goals.find((g) => g.id === selectedId) ?? goals[0] ?? null;
  const sheet = sheetId != null ? goals.find((g) => g.id === sheetId) ?? null : null;
  const editing = editId != null ? goals.find((g) => g.id === editId) ?? null : null;

  function open(id: number) {
    if (isDesktop) setSelectedId(id);
    else setSheetId(id);
  }

  return (
    <>
      <PlanSwitch className="self-start" />

      {goals.length === 0 ? (
        <section className={cn(CARD, "flex flex-col items-center gap-4 px-6 py-12 text-center")}>
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-mustard-soft text-mustard-strong">
            <IconPigMoney size={26} stroke={1.8} />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="heading text-lg text-ink">{t("empty.title")}</h2>
            <p className="max-w-xs text-[13px] leading-[1.45] text-ink-2">{t("empty.body")}</p>
          </div>
          <Link href="/goals/add?type=savings" className={buttonVariants({ variant: "default", size: "lg" })}>
            <IconPlus size={16} stroke={2} />
            {t("add")}
          </Link>
        </section>
      ) : (
        <div className={SPLIT_GRID}>
          <div className="flex min-w-0 flex-col gap-5">
            <SavedCard data={data} />
            <section className="flex flex-col gap-3">
              <SectionHead title={t("yours")} link={t("add")} href="/goals/add?type=savings" />
              <div className="grid gap-3.5 sm:grid-cols-2 2xl:grid-cols-3">
                {goals.map((g) => (
                  <GoalCard key={g.id} goal={g} selected={isDesktop && selected?.id === g.id} onOpen={() => open(g.id)} />
                ))}
              </div>
            </section>
            <RecentCard data={data} />
          </div>
          {isDesktop && selected && (
            <div className="flex min-w-0 flex-col gap-5">
              <GoalDetailCard goal={selected} data={data} onEdit={() => setEditId(selected.id)} onDetails={() => setSheetId(selected.id)} />
            </div>
          )}
        </div>
      )}

      <SavingsGoalDetailDialog goal={sheet} categories={data.categories} onClose={() => setSheetId(null)} />
      {editing && (
        <SavingsGoalEditDialog goal={editing} categories={data.categories} open={editId != null} onOpenChange={(o) => { if (!o) setEditId(null); }} />
      )}

      <AnchoredTip id="goalsContributions" anchor="goalsContributions" active={goals.length > 0} />
      <AnchoredTip id="goalsDetail" anchor="goalsDetail" active={isDesktop && selected != null} />
    </>
  );
}

// ── Saved across goals ────────────────────────────────────────────────────────

function SavedCard({ data }: { data: GoalsPageData }) {
  const t = useTranslations("plan.goals.saved");
  const { monthKey } = useFormats();
  const total = data.goals.reduce((s, g) => s + g.currentAmount, 0);
  const monthly = data.goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);
  const thisMonth = data.months[data.months.length - 1]?.amount ?? 0;
  const share = data.income > 0 && monthly > 0 ? Math.round((monthly / data.income) * 100) : null;
  const plan = share != null ? t("planShare", { amount: formatEurWhole(monthly), pct: share }) : monthly > 0 ? t("plan", { amount: formatEurWhole(monthly) }) : null;
  const max = Math.max(1, ...data.months.map((m) => m.amount));
  const pill =
    thisMonth !== 0 ? (
      <Pill tone={thisMonth > 0 ? "positive" : "negative"} icon={thisMonth > 0 ? <IconArrowUp /> : <IconArrowDown />}>
        {t("thisMonth", { amount: `${thisMonth > 0 ? "+" : "-"}${formatEurWhole(Math.abs(thisMonth))}` })}
      </Pill>
    ) : null;

  return (
    <section data-tip-anchor="goalsContributions" className={cn(CARD, "flex flex-col gap-3.5 p-[18px] lg:flex-row lg:items-end lg:gap-8 lg:px-6 lg:py-[22px]")}>
      <div className="flex items-end justify-between gap-3 lg:shrink-0 lg:flex-col lg:items-start lg:gap-2">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">{t("title", { count: data.goals.length })}</span>
          <span className="amount text-[44px] leading-none tracking-[-0.035em] text-ink lg:text-[54px]">{formatEurWhole(total)}</span>
        </div>
        <span className="lg:hidden">{pill}</span>
        <span className="hidden items-center gap-2 text-[13px] text-ink-2 lg:flex">
          {plan}
          {pill}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex h-12 items-end gap-1.5 lg:h-[70px] lg:gap-2" aria-hidden>
          {data.months.map((m, i) => (
            <span
              key={m.month}
              className={cn("min-w-0 flex-1 rounded-[4px]", i === data.months.length - 1 ? "bg-mustard" : "bg-mustard/60")}
              style={{ height: `${Math.max(m.amount > 0 ? 6 : 2, (Math.max(0, m.amount) / max) * 100)}%` }}
              title={`${monthKey(m.month)} · ${formatEur(m.amount)}`}
            />
          ))}
        </div>
        <div className="flex justify-between gap-2">
          <span className="mono-label text-[10px]">{monthKey(data.months[0].month)}</span>
          <span className="mono-label truncate text-[10px] lg:hidden">{plan ?? t("contributions")}</span>
          <span className="mono-label hidden text-[10px] lg:inline">{t("contributions")}</span>
          <span className="mono-label text-[10px]">{monthKey(data.months[data.months.length - 1].month)}</span>
        </div>
      </div>
    </section>
  );
}

// ── Goal cards ────────────────────────────────────────────────────────────────

function GoalCard({ goal, selected, onOpen }: { goal: Goal; selected: boolean; onOpen: () => void }) {
  const t = useTranslations("plan.goals.card");
  const { monthYear } = useFormats();
  const pct = Math.round(goalProgressPct(goal));
  const left = monthsLeft(goal);
  const color = goalColor(goal);
  const sub = [
    goal.monthlyContribution ? t("perMonth", { amount: formatEurWhole(goal.monthlyContribution) }) : t("noMonthly"),
    left === 0 ? t("reached") : left != null ? t("by", { date: monthYear(addMonths(left)) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected || undefined}
      className={cn(CARD, "flex min-w-0 flex-col gap-3.5 p-[18px] text-left transition-colors hover:bg-surface-2/60", selected && "border-ink-3")}
    >
      <span className="flex items-center gap-3">
        <CategoryIcon icon={goal.icon} color={goal.color} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold text-ink">{goal.name}</span>
          <span className="truncate text-xs text-ink-3">{sub}</span>
        </span>
        <Ring pct={pct} color={left === 0 ? "var(--arca-positive)" : color} size={42}>
          <span className="font-mono text-[10px] font-medium text-ink">{pct}%</span>
        </Ring>
      </span>
      <span className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between gap-2">
          <span className="amount text-[26px] leading-none tracking-[-0.03em] text-ink">{formatEurWhole(goal.currentAmount)}</span>
          {goal.targetAmount > 0 && <span className="text-xs text-ink-3">{t("of", { amount: formatEurWhole(goal.targetAmount) })}</span>}
        </span>
        <Bar pct={pct} color={left === 0 ? "var(--arca-positive)" : color} height={7} />
      </span>
    </button>
  );
}

// ── Recent contributions ──────────────────────────────────────────────────────

function RecentCard({ data }: { data: GoalsPageData }) {
  const t = useTranslations("plan.goals.recent");
  const { day } = useFormats();
  const nameOf = new Map(data.goals.map((g) => [g.id, g.name]));
  return (
    <section className={cn(CARD, "flex flex-col gap-2 px-5 py-3.5")}>
      <SectionHead title={t("title")} size="sm" />
      {data.recent.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-3">{t("empty")}</p>
      ) : (
        data.recent.map((c) => (
          <div key={c.transactionId} className="flex min-h-[42px] items-center justify-between gap-3 border-t border-line pt-2 first-of-type:border-t-0">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-ink">{nameOf.get(c.goalId) ?? c.name}</span>
              <span className="truncate text-xs text-ink-3">{[day(c.date), c.account].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={cn("shrink-0 text-[15px] font-semibold tabular-nums", c.amount >= 0 ? "text-positive" : "text-negative")}>
              {c.amount >= 0 ? "+" : "-"}
              {formatEur(Math.abs(c.amount))}
            </span>
          </div>
        ))
      )}
    </section>
  );
}

// ── Selected goal (desktop) ───────────────────────────────────────────────────

function GoalDetailCard({ goal, data, onEdit, onDetails }: { goal: Goal; data: GoalsPageData; onEdit: () => void; onDetails: () => void }) {
  const t = useTranslations("plan.goals.detail");
  const { monthYear, monthKey } = useFormats();
  const color = goalColor(goal);
  const pct = goalProgressPct(goal);
  const left = monthsLeft(goal);
  const category = goal.categoryId != null ? data.categories.find((c) => c.id === goal.categoryId) : undefined;
  const account = data.recent.find((c) => c.goalId === goal.id)?.account ?? null;
  const started = goal.startDate ?? goal.createdAt?.slice(0, 10) ?? null;

  const links = [account ? t("account", { name: account }) : null, category ? t("category", { name: category.name }) : null].filter(Boolean);

  // The past 12 months from contributions (what the balance was at each month's end),
  // then the projection at the planned monthly amount until the target.
  const perMonth = data.byGoal[goal.id] ?? [];
  const history = perMonth.map((_, i) => goal.currentAmount - perMonth.slice(i + 1).reduce((s, v) => s + v, 0));
  const startIndex = started ? Math.max(0, data.months.findIndex((m) => m.month >= started.slice(0, 7))) : 0;
  const past = history.slice(startIndex === -1 ? 0 : startIndex);
  const future: number[] = [];
  if (left != null && left > 0) {
    for (let i = 1; i <= Math.min(left, 60); i++) future.push(Math.min(goal.targetAmount, goal.currentAmount + (goal.monthlyContribution ?? 0) * i));
  }
  const series = [...past, ...future];
  const max = Math.max(goal.targetAmount, ...series, 1);
  const w = 386;
  const h = 90;
  const pad = 4;
  const n = Math.max(2, series.length);
  const xy = series.map((v, i) => [pad + (i / (n - 1)) * (w - pad * 2), h - pad - (Math.max(0, v) / max) * (h - pad * 2)] as const);
  const path = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const pastPts = xy.slice(0, past.length);
  const futurePts = xy.slice(Math.max(0, past.length - 1));
  const firstLabel = data.months[startIndex === -1 ? 0 : startIndex]?.month;

  return (
    <section data-tip-anchor="goalsDetail" className={cn(CARD, "flex flex-col gap-4 p-[22px]")}>
      <div className="flex items-center gap-3.5">
        <CategoryIcon icon={goal.icon} color={goal.color} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h2 className="heading truncate text-xl text-ink">{goal.name}</h2>
          <span className="line-clamp-2 text-[13px] text-ink-3">{links.length > 0 ? links.join(" · ") : t("noLinks")}</span>
        </div>
        <span className="amount shrink-0 text-[26px] leading-none tracking-[-0.03em] text-ink">{formatEurWhole(goal.currentAmount)}</span>
      </div>
      <Bar pct={pct} color={left === 0 ? "var(--arca-positive)" : color} height={8} />
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Stat label={t("target")} value={goal.targetAmount > 0 ? formatEurWhole(goal.targetAmount) : "—"} />
        <Stat label={t("monthly")} value={goal.monthlyContribution ? formatEurWhole(goal.monthlyContribution) : "—"} />
        <Stat label={t("started")} value={started ? monthYear(new Date(`${started}T12:00:00`)) : "—"} />
        <Stat label={t("reachedBy")} value={left === 0 ? t("reached") : left != null ? monthYear(addMonths(left)) : "—"} tone={left === 0 ? "positive" : "default"} />
      </div>

      {series.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="block h-[90px] w-full">
            <defs>
              <linearGradient id={`goal-fill-${goal.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.28" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.33, 0.66].map((g) => (
              <line key={g} x1={0} x2={w} y1={h - pad - g * (h - pad * 2)} y2={h - pad - g * (h - pad * 2)} stroke="var(--arca-line)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={`${path(xy)} L${xy[xy.length - 1][0].toFixed(1)} ${h} L${xy[0][0].toFixed(1)} ${h} Z`} fill={`url(#goal-fill-${goal.id})`} />
            {pastPts.length > 1 && <path d={path(pastPts)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {future.length > 0 && (
              <path d={path(futurePts)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <div className="flex justify-between gap-2">
            <span className="mono-label text-[10px]">{firstLabel ? monthKey(firstLabel) : ""}</span>
            <span className="mono-label truncate text-[10px]" style={{ color }}>
              {left === 0 ? t("reached") : left != null ? t("projected", { date: monthKey(`${addMonths(left).getFullYear()}-${String(addMonths(left).getMonth() + 1).padStart(2, "0")}`) }) : t("noProjection")}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className={GHOST}>
          <IconAdjustmentsHorizontal size={16} stroke={1.8} />
          {t("edit")}
        </button>
        <button type="button" onClick={onDetails} className={GHOST}>
          <IconListDetails size={16} stroke={1.8} />
          {t("details")}
        </button>
      </div>
    </section>
  );
}
