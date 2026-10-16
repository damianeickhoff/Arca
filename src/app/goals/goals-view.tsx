"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconLink, IconPencil, IconPlus, IconTarget } from "@tabler/icons-react";
import type { Goal } from "@/db/schema";
import { cn } from "@/lib/utils";
import { formatEur, formatEurWhole } from "@/lib/format";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { PlanSwitch } from "@/components/shell/plan-switch";
import { AnchoredTip } from "@/components/anchored-tip";
import type { GoalsPageData } from "./load-goals";
import { GOAL_COLORS, addMonths, goalColor, goalProgressPct, linkedAccount, monthsLeft } from "./goal-shared";
import { ContributionBars, GoalIcon, JarIllustration, MiniBars, ProgressRing } from "./goal-visuals";
import { GoalFormDialog, type GoalFormTarget } from "./goal-form-dialog";
import { SavingsGoalDetailDialog } from "./savings-goal-detail-dialog";
import { MoneyText } from "@/components/clear/money";

/** The empty state's starting points; names and descriptions live at plan.goals.suggestions.<key>. */
const SUGGESTIONS = [
  { key: "buffer", icon: "IconUmbrella", color: GOAL_COLORS[7].hex },
  { key: "holiday", icon: "IconPlane", color: GOAL_COLORS[0].hex },
  { key: "laptop", icon: "IconDeviceLaptop", color: GOAL_COLORS[2].hex },
] as const;

function useFormats() {
  const locale = useLocale();
  const monthYear = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  const monthOnly = new Intl.DateTimeFormat(locale, { month: "short" });
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return {
    monthYear: (d: Date) => monthYear.format(d),
    /** "Nov 2025" from a YYYY-MM */
    monthKeyYear: (m: string) => monthYear.format(new Date(`${m}-15T12:00:00`)),
    /** "Nov" from a YYYY-MM */
    monthKey: (m: string) => monthOnly.format(new Date(`${m}-15T12:00:00`)),
    day: (date: string) => day.format(new Date(`${date}T12:00:00`)),
    number: (n: number) => number.format(n),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Plan · Goals. One grid: what is saved across the goals (black hero) beside twelve
 * months of contributions, a card per goal, then the latest contributions across the
 * full width. Phones show the hero with a small bar chart, the goals as compact cards
 * and the contributions list. A goal card opens the goal's detail dialog (a centred
 * modal from lg, a bottom sheet on phones) with its projection.
 */
export function GoalsView({ data, initialForm }: { data: GoalsPageData; initialForm: GoalFormTarget | null }) {
  const router = useRouter();
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState<{ key: number; open: boolean; target: GoalFormTarget }>(() =>
    initialForm ? { key: 1, open: true, target: initialForm } : { key: 0, open: false, target: { mode: "new", type: "savings" } },
  );
  // Opened from /goals?new=… or ?edit=… (the old add and edit routes): drop the
  // parameter once the form closes, so a refresh doesn't open it again.
  const fromUrl = useRef(initialForm != null);

  const goals = data.goals;
  const detail = detailId != null ? (goals.find((g) => g.id === detailId) ?? null) : null;

  function openForm(target: GoalFormTarget) {
    setForm((f) => ({ key: f.key + 1, open: true, target }));
  }

  function formOpenChange(open: boolean) {
    setForm((f) => ({ ...f, open }));
    if (!open && fromUrl.current) {
      fromUrl.current = false;
      router.replace("/goals", { scroll: false });
    }
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      <GoalsHeader goals={goals} onAdd={() => openForm({ mode: "new", type: "savings" })} />

      {goals.length === 0 ? (
        <EmptyGoals onAdd={(preset) => openForm({ mode: "new", type: "savings", preset })} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <HeroCard data={data} />
          <ContributionsCard data={data} />
          {/* The goal cards share the page grid's columns (subgrid) and get rows of their
              own that are all as tall as the tallest card, so every goal card matches. */}
          <div className="col-span-full grid grid-cols-subgrid auto-rows-fr gap-5">
            {goals.map((g, i) => (
              <GoalCard
                key={g.id}
                goal={g}
                data={data}
                tipAnchor={i === 0}
                onOpen={() => setDetailId(g.id)}
                onEdit={() => openForm({ mode: "edit", goal: g })}
              />
            ))}
          </div>
          <RecentCard data={data} />
        </div>
      )}

      <SavingsGoalDetailDialog goal={detail} data={data} onClose={() => setDetailId(null)} />
      <GoalFormDialog key={form.key} target={form.target} open={form.open} onOpenChange={formOpenChange} categories={data.categories} />

      <AnchoredTip id="goalsContributions" anchor="goalsContributions" active={goals.length > 0} />
      <AnchoredTip id="goalsDetail" anchor="goalsDetail" active={goals.length > 0 && detail == null} />
      <AnchoredTip id="goalsSuggestions" anchor="goalsSuggestions" active={goals.length === 0} />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function GoalsHeader({ goals, onAdd }: { goals: Goal[]; onAdd: () => void }) {
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
    <div className="flex flex-col gap-4 lg:gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{tPlan("title")}</h1>
          <span className="hidden text-base text-clear-ink-2 lg:inline">{goals.length > 0 ? parts.join(" · ") : t("subtitleEmpty")}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onAdd} aria-label={t("add")} className={cn(clearButtonVariants({ size: "icon" }), "size-12 lg:hidden")}>
            <IconPlus aria-hidden />
          </button>
          <button type="button" onClick={onAdd} className={cn(clearButtonVariants(), "hidden lg:inline-flex")}>
            <IconPlus aria-hidden />
            {t("add")}
          </button>
        </div>
      </div>
      <PlanSwitch />
    </div>
  );
}

// ── Hero: saved across goals ──────────────────────────────────────────────────

function HeroCard({ data }: { data: GoalsPageData }) {
  const t = useTranslations("plan.goals.hero");
  const { monthYear, monthKeyYear } = useFormats();
  const goals = data.goals;
  const total = goals.reduce((s, g) => s + g.currentAmount, 0);
  const target = goals.reduce((s, g) => s + Math.max(0, g.targetAmount), 0);
  const monthly = goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);
  const thisMonth = data.months[data.months.length - 1]?.amount ?? 0;
  const share = data.income > 0 && monthly > 0 ? Math.round((monthly / data.income) * 100) : null;
  const b = (c: React.ReactNode) => <b className="font-bold text-clear-hero-ink">{c}</b>;

  // The goal reached soonest at its planned pace.
  const next = goals
    .map((g) => ({ g, left: monthsLeft(g) }))
    .filter((x): x is { g: Goal; left: number } => x.left != null && x.left > 0)
    .sort((a, z) => a.left - z.left)[0];

  return (
    <ClearCard hero aria-labelledby="goals-hero-title" className="gap-5 p-5 lg:p-[26px]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="goals-hero-title" className="m-0 text-[15px] font-bold lg:text-[17px]">
          {t("title", { count: goals.length })}
        </h2>
        {target > 0 && (
          <ClearChip tone="mint"><MoneyText>{t("ofTarget", { pct: Math.round((total / target) * 100), amount: formatEurWhole(target) })}</MoneyText></ClearChip>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Amount value={total} whole splitCents={false} className="text-[46px] leading-none tracking-[-0.035em] lg:text-[56px]" />
        {monthly > 0 && (
          <span className="text-sm text-clear-hero-ink-2 lg:text-[15px]">
            <MoneyText>{share != null ? t.rich("planShare", { amount: formatEurWhole(monthly), pct: share, b }) : t.rich("plan", { amount: formatEurWhole(monthly), b })}</MoneyText>
          </span>
        )}
      </div>

      {/* Phone: the twelve months of contributions live here instead of in their own card. */}
      <div data-tip-anchor="goalsContributions" className="flex flex-col gap-1.5 lg:hidden">
        <MiniBars months={data.months} />
        <div className="flex justify-between gap-2 text-xs text-clear-hero-ink-2">
          <span>{monthKeyYear(data.months[0].month)}</span>
          <span><MoneyText>{t("thisMonth", { amount: `${thisMonth < 0 ? "−" : thisMonth > 0 ? "+" : ""}${formatEurWhole(Math.abs(thisMonth))}` })}</MoneyText></span>
        </div>
      </div>

      {/* Desktop: how the total splits over the goals. */}
      <div className="hidden flex-col gap-3 lg:flex">
        <div aria-hidden className="flex h-3 gap-[3px] overflow-hidden rounded-full bg-clear-hero-ink/12">
          {total > 0 &&
            goals
              .filter((g) => g.currentAmount > 0)
              .map((g) => <span key={g.id} className="h-full rounded-full" style={{ width: `${(g.currentAmount / total) * 100}%`, background: goalColor(g) }} />)}
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-2 text-clear-hero-ink-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: goalColor(g) }} />
                <span className="truncate">{g.name}</span>
              </span>
              <b className="tabular-nums"><MoneyText>{formatEurWhole(g.currentAmount)}</MoneyText></b>
            </li>
          ))}
        </ul>
      </div>

      {next && (
        <div className="mt-auto flex items-center gap-3 rounded-clear-tile bg-clear-hero-ink/8 px-3.5 py-3">
          <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-clear-hero-ink/12">
            <IconTarget size={18} stroke={1.9} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-bold">{t("nextUp", { name: next.g.name, date: monthYear(addMonths(next.left)) })}</span>
            <span className="text-[13px] text-clear-hero-ink-2">
              <MoneyText>{t("nextUpSub", { amount: formatEurWhole(next.g.targetAmount - next.g.currentAmount), monthly: formatEurWhole(next.g.monthlyContribution ?? 0) })}</MoneyText>
            </span>
          </span>
        </div>
      )}
    </ClearCard>
  );
}

// ── Contributions (desktop) ───────────────────────────────────────────────────

function ContributionsCard({ data }: { data: GoalsPageData }) {
  const t = useTranslations("plan.goals.contrib");
  const { monthKey, monthKeyYear, number } = useFormats();
  const total = data.months.reduce((s, m) => s + m.amount, 0);
  const thisMonth = data.months[data.months.length - 1]?.amount ?? 0;
  const tile = "flex flex-col gap-0.5 rounded-clear-icon bg-clear-tile px-3 py-2";

  return (
    <ClearCard data-tip-anchor="goalsContributions" aria-labelledby="goals-contrib-title" className="hidden gap-3.5 lg:flex xl:col-span-2">
      <ClearCardHeader
        title={<span id="goals-contrib-title">{t("title")}</span>}
        subtitle={t("subtitle")}
        action={
          <span className="inline-flex gap-2">
            <span className={tile}>
              <span className="text-xs text-clear-muted">{t("total")}</span>
              <span className="text-[15px] font-extrabold tabular-nums"><MoneyText>{formatEurWhole(total)}</MoneyText></span>
            </span>
            <span className={tile}>
              <span className="text-xs text-clear-muted">{t("thisMonth")}</span>
              <span className="text-[15px] font-extrabold tabular-nums"><MoneyText>{formatEurWhole(thisMonth)}</MoneyText></span>
            </span>
          </span>
        }
      />
      <p className="sr-only">
        <MoneyText>{t("chartLabel", {
          from: monthKeyYear(data.months[0].month),
          to: monthKeyYear(data.months[data.months.length - 1].month),
          total: formatEurWhole(total),
          last: formatEurWhole(thisMonth),
        })}</MoneyText>
      </p>
      <ContributionBars
        months={data.months}
        monthLabel={monthKey}
        formatTick={(v) => (v === 0 ? formatEurWhole(0) : number(v))}
        formatValue={formatEurWhole}
        className="flex-1"
      />
    </ClearCard>
  );
}

// ── Goal cards ────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  data,
  tipAnchor,
  onOpen,
  onEdit,
}: {
  goal: Goal;
  data: GoalsPageData;
  /** The first card carries the "open a goal" tip. */
  tipAnchor: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations("plan.goals.card");
  const tDetail = useTranslations("goals.detail");
  const { monthYear } = useFormats();
  const pct = goalProgressPct(goal);
  const left = monthsLeft(goal);
  const done = left === 0;
  const color = goalColor(goal);
  const monthly = goal.monthlyContribution ?? 0;
  const projected = !done && monthly > 0 && goal.targetAmount > 0 ? Math.min(goal.targetAmount - goal.currentAmount, monthly * 3) : 0;
  const nameId = `goal-${goal.id}-name`;
  const sub = [
    monthly > 0 ? t("perMonth", { amount: formatEurWhole(monthly) }) : t("noMonthly"),
    done ? t("reached") : left != null ? t("by", { date: monthYear(addMonths(left)) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const links = goalLinks(goal, data, (key, values) => tDetail(key, values));

  return (
    <ClearCard
      aria-labelledby={nameId}
      data-tip-anchor={tipAnchor ? "goalsDetail" : undefined}
      className="relative h-full gap-3 p-4 transition-shadow hover:ring-2 hover:ring-clear-ink/10 lg:gap-[18px] lg:p-6"
    >
      {/* The whole card opens the goal's detail dialog. Every line below has a fixed
          height (truncated text, reserved rows) so all goal cards come out the same. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("open", { name: goal.name })}
        className="absolute inset-0 z-[1] cursor-pointer rounded-clear-card outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50"
      />

      <div className="flex items-center gap-3">
        <GoalIcon icon={goal.icon} color={goal.color} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id={nameId} className="m-0 truncate text-[15px] font-bold lg:text-[17px]">
            {goal.name}
          </h3>
          <span className="truncate text-[13px] text-clear-muted"><MoneyText>{sub}</MoneyText></span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 lg:hidden">
          <span className="text-[17px] font-extrabold tracking-[-0.02em] tabular-nums"><MoneyText>{formatEurWhole(goal.currentAmount)}</MoneyText></span>
          {goal.targetAmount > 0 && <span className="text-[13px] tabular-nums text-clear-muted"><MoneyText>{t("of", { amount: formatEurWhole(goal.targetAmount) })}</MoneyText></span>}
        </span>
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("edit", { name: goal.name })}
          className="relative z-10 hidden size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-ground text-clear-ink transition-colors hover:bg-clear-line lg:inline-flex"
        >
          <IconPencil size={17} stroke={2} aria-hidden />
        </button>
      </div>

      {/* Phone: one bar, the rest of the way hatched. */}
      <div className="mt-auto flex items-center gap-2.5 lg:hidden">
        <ClearProgress
          value={pct / 100}
          hatchRemainder
          size="md"
          className="flex-1"
          fillColor={done ? undefined : color}
          fillClassName={done ? "bg-clear-positive-fill" : undefined}
        />
        <span className="min-w-[34px] text-right text-[13px] font-extrabold tabular-nums">{Math.round(pct)}%</span>
      </div>

      {/* Desktop: ring, figures, a bar with the next three months hatched, and the links. */}
      <div className="hidden items-center gap-[18px] lg:flex">
        <ProgressRing pct={pct} color={done ? "var(--clr-positive-fill)" : color} label={t("ring", { name: goal.name, pct: Math.round(pct) })} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 items-baseline gap-x-1.5 whitespace-nowrap">
            <span className="clear-amount shrink-0 text-[28px] leading-none tracking-[-0.03em]"><MoneyText>{formatEurWhole(goal.currentAmount)}</MoneyText></span>
            {goal.targetAmount > 0 && <span className="truncate text-sm text-clear-ink-2"><MoneyText>{t("of", { amount: formatEurWhole(goal.targetAmount) })}</MoneyText></span>}
          </span>
          {/* Reserved: an empty line keeps reached goals and goals without a target as tall. */}
          <span className="truncate text-[13px] text-clear-ink-2">
            <MoneyText>{goal.targetAmount > goal.currentAmount ? t("toGo", { amount: formatEurWhole(goal.targetAmount - goal.currentAmount) }) : " "}</MoneyText>
          </span>
          {done ? (
            <ClearChip tone="mint" icon={<IconCheck stroke={3} aria-hidden />} className="max-w-full self-start">
              {t("done")}
            </ClearChip>
          ) : left != null ? (
            <ClearChip tone="mint" className="max-w-full self-start">
              <span className="truncate">{t("reachedOn", { date: monthYear(addMonths(left)) })}</span>
            </ClearChip>
          ) : (
            <ClearChip className="max-w-full self-start">
              <span className="truncate">{t("noProjection")}</span>
            </ClearChip>
          )}
        </span>
      </div>

      <div className="hidden flex-col gap-1.5 lg:flex">
        <ClearProgress
          value={pct / 100}
          reserved={goal.targetAmount > 0 ? projected / goal.targetAmount : 0}
          fillColor={done ? undefined : color}
          fillClassName={done ? "bg-clear-positive-fill" : undefined}
          className="bg-clear-ground"
        />
        {/* The legend's line stays reserved (invisible) when nothing is projected. */}
        <span aria-hidden={projected > 0 ? undefined : true} className={cn("flex justify-between gap-2 text-xs text-clear-muted", projected <= 0 && "invisible")}>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span aria-hidden className="clear-hatch h-2 w-3.5 shrink-0 rounded-full" />
            <span className="truncate">{t("projected")}</span>
          </span>
          <b className="shrink-0 tabular-nums text-clear-ink-2">+<MoneyText>{formatEurWhole(projected)}</MoneyText></b>
        </span>
      </div>

      <div className="mt-auto hidden items-center gap-2 border-t border-clear-ground pt-3.5 text-[13px] font-semibold text-clear-ink-2 lg:flex">
        <IconLink size={16} stroke={2} aria-hidden className="shrink-0" />
        <span className="truncate">{links.length > 0 ? links.join(" · ") : tDetail("noLinks")}</span>
      </div>
    </ClearCard>
  );
}

/** "Linked to Savings ••3305 · category “Travel”": what feeds the goal. */
function goalLinks(goal: Goal, data: GoalsPageData, t: (key: "account" | "category", values: { name: string }) => string) {
  const category = goal.categoryId != null ? data.categories.find((c) => c.id === goal.categoryId) : undefined;
  const account = linkedAccount(goal, data.recent);
  return [account ? t("account", { name: account }) : null, category ? t("category", { name: category.name }) : null].filter((s): s is string => s != null);
}

// ── Recent contributions ──────────────────────────────────────────────────────

function RecentCard({ data }: { data: GoalsPageData }) {
  const t = useTranslations("plan.goals.recent");
  const { day } = useFormats();
  const byId = new Map(data.goals.map((g) => [g.id, g]));
  // Grouped by day, newest first (the list already is), each with its total.
  const groups: { date: string; total: number; items: GoalsPageData["recent"] }[] = [];
  for (const c of data.recent) {
    const last = groups[groups.length - 1];
    if (last && last.date === c.date) {
      last.items.push(c);
      last.total += c.amount;
    } else groups.push({ date: c.date, total: c.amount, items: [c] });
  }
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${formatEur(Math.abs(n))}`;

  return (
    <ClearCard aria-labelledby="goals-recent-title" className="col-span-full gap-3.5">
      <ClearCardHeader
        title={<span id="goals-recent-title">{t("title")}</span>}
        subtitle={data.recent.length > 0 ? t("subtitle") : undefined}
        action={<ClearCardLink href="/transactions">{t("view")}</ClearCardLink>}
      />
      {data.recent.length === 0 ? (
        <p className="m-0 text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {groups.map((group) => (
            <section key={group.date} aria-label={day(group.date)} className="flex flex-col">
              <div className="flex h-9 items-center justify-between rounded-clear-icon bg-clear-tile px-3.5 text-[13px] font-bold text-clear-ink-2">
                <span>{day(group.date)}</span>
                <span className="tabular-nums"><MoneyText>{signed(group.total)}</MoneyText></span>
              </div>
              <ul className="m-0 flex list-none flex-col p-0">
                {group.items.map((c) => {
                  const g = byId.get(c.goalId);
                  return (
                    <li key={c.transactionId} className="flex min-h-[58px] items-center gap-3 border-b border-clear-ground px-3.5 py-2 last:border-b-0">
                      <GoalIcon icon={g?.icon ?? null} color={g?.color ?? null} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-bold">{g?.name ?? c.name}</span>
                        <span className="truncate text-[13px] text-clear-muted">{[c.name, c.account].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className={cn("shrink-0 text-[15px] font-extrabold tabular-nums", c.amount >= 0 ? "text-clear-positive" : "text-clear-negative")}>
                        <MoneyText>{signed(c.amount)}</MoneyText>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </ClearCard>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyGoals({ onAdd }: { onAdd: (preset?: { name: string; icon: string; color: string }) => void }) {
  const t = useTranslations("plan.goals");
  return (
    <>
      <ClearCard aria-labelledby="goals-empty-title" className="items-center gap-[22px] px-5 py-9 text-center lg:px-8 lg:py-11">
        <JarIllustration />
        <div className="flex flex-col items-center gap-2.5">
          <h2 id="goals-empty-title" className="m-0 text-[22px] font-extrabold tracking-[-0.02em] lg:text-2xl">
            {t("empty.title")}
          </h2>
          <p className="m-0 max-w-[500px] text-[15px] leading-normal text-clear-ink-2 lg:text-base">{t("empty.body")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          <button type="button" onClick={() => onAdd()} className={clearButtonVariants({ size: "lg" })}>
            <IconPlus aria-hidden />
            {t("add")}
          </button>
          <Link href="/settings?panel=accounts" className={clearButtonVariants({ variant: "secondary", size: "lg" })}>
            {t("empty.account")}
          </Link>
        </div>
      </ClearCard>

      <section data-tip-anchor="goalsSuggestions" aria-labelledby="goals-suggestions-title" className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <h2 id="goals-suggestions-title" className="m-0 text-lg font-bold">
            {t("suggestions.title")}
          </h2>
          <span className="text-sm text-clear-muted">{t("suggestions.subtitle")}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">
          {SUGGESTIONS.map((s) => {
            const name = t(`suggestions.${s.key}.name`);
            return (
              <ClearCard key={s.key} className="flex-row items-center gap-3.5 p-4 lg:p-5">
                <GoalIcon icon={s.icon} color={s.color} size="xl" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-base font-bold">{name}</span>
                  <span className="text-[13px] text-clear-muted">{t(`suggestions.${s.key}.body`)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onAdd({ name, icon: s.icon, color: s.color })}
                  aria-label={t("suggestions.useLabel", { name })}
                  className={clearButtonVariants({ variant: "secondary", size: "sm" })}
                >
                  {t("suggestions.use")}
                </button>
              </ClearCard>
            );
          })}
        </div>
      </section>
    </>
  );
}
