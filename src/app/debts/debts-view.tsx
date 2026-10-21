"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendarEvent,
  IconCheck,
  IconChevronRight,
  IconCreditCard,
  IconPencil,
  IconPlus,
  IconCalendarDue,
  IconReceipt,
  IconSchool,
  IconUsers,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEur, formatEurWhole } from "@/lib/format";
import { buildPayoffPlan, payoffMonthsById, simulatePayoff, type PayoffPlanRow, type PayoffSimulation } from "@/lib/debt-simulate";
import type { OpenAdvance } from "@/lib/open-advances";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { Segmented } from "@/components/clear/segmented";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { Icon } from "@/components/icon";
import { PlanSwitch } from "@/components/shell/plan-switch";
import { AnchoredTip } from "@/components/anchored-tip";
import { AddRecurringButton } from "@/components/settings/recurring/add-recurring-button";
import type { RecurringItem } from "@/db/schema";
import {
  DEBT_SORTS,
  debtEffectivePaid,
  debtEffectiveTotal,
  debtPaidPct,
  sortDebts,
  type ComputedDebt,
  type DebtSort,
  type DebtsFreeToSpend,
  type DebtsMonthPayments,
} from "./debt-shared";
import { DebtDetailDialog } from "./debt-detail-dialog";
import { DebtFormDialog } from "./debt-form-dialog";
import { DebtIcon, ExtraSlider, PaymentNotice, monthsFromNow, pastel, useMonthYear, usePaymentNotice } from "./debt-ui";
import { PayoffTimelineCard } from "./payoff-timeline";
import { ThisMonthCard } from "./this-month-card";
import { LogPaymentDialog } from "./log-payment-dialog";
import { setDebtPayoffOrderAction } from "./actions";
import { MoneyText } from "@/components/clear/money";

/** What the add/edit form opens with — also what /debts?add=… and /debts?edit=… ask for. */
export type DebtFormRequest = { kind: "add"; direction: "owe" | "owed" } | { kind: "edit"; id: number };

const LINK_BUTTON = "cursor-pointer text-sm font-bold text-clear-ember-text hover:underline";

type Sim = PayoffSimulation;

/** Whole months from this month to `date`'s month; 0 for this month or earlier. */
function monthsUntil(date: Date) {
  const now = new Date();
  return Math.max(0, (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth());
}

/**
 * Plan · Debts. One grid: three summary tiles (you owe, owed to you, debt-free) across
 * the top, the extra-payment simulator across the full width under them (the slider,
 * the payoff order and where the extra goes month by month), then your debts (two
 * columns wide) beside this month's payments and what others owe you, and the payoff
 * timeline as the last full-width row. Every debt opens its detail sheet; adding and
 * editing happen in the debt form sheet; "Log a payment" records an extra or lump sum.
 * The order (saved in app settings) decides which debt the extra goes to first and how
 * Your debts is sorted.
 */
export function DebtsView({
  computed,
  computedOwed,
  bills,
  totalDebt,
  totalOwed,
  totalMonthly,
  freeToSpend,
  thisMonth,
  advances,
  order: savedOrder,
  initialForm,
}: {
  computed: ComputedDebt[];
  computedOwed: ComputedDebt[];
  bills: RecurringItem[];
  totalDebt: number;
  totalOwed: number;
  totalMonthly: number;
  freeToSpend: DebtsFreeToSpend;
  thisMonth: DebtsMonthPayments;
  advances: OpenAdvance[];
  order: DebtSort;
  initialForm: DebtFormRequest | null;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<DebtSort>(savedOrder);
  const [, startSaving] = useTransition();
  const sorted = useMemo(() => sortDebts(computed, order), [computed, order]);
  const active = useMemo(() => sorted.filter((c) => c.currentBalance > 0), [sorted]);
  const openOwed = useMemo(() => computedOwed.filter((c) => c.currentBalance > 0), [computedOwed]);
  const hasOwed = openOwed.length > 0 || advances.length > 0;
  const empty = computed.length === 0 && computedOwed.length === 0 && advances.length === 0;

  const [sheetId, setSheetId] = useState<number | null>(null);
  // The form's settings outlive its open flag, so it keeps its title and fields while
  // the sheet slides away.
  const [form, setForm] = useState<DebtFormRequest>(initialForm ?? { kind: "add", direction: "owe" });
  const [formOpen, setFormOpen] = useState(initialForm != null);
  const [fromUrl, setFromUrl] = useState(initialForm != null);
  const [extra, setExtra] = useState(100);
  // Remounted per opening, so it always starts empty on the first debt.
  const [logOpen, setLogOpen] = useState(false);
  const [logKey, setLogKey] = useState(0);

  const all = [...computed, ...computedOwed];
  const sheet = sheetId != null ? all.find((c) => c.debt.id === sheetId) ?? null : null;
  const editing = form.kind === "edit" ? all.find((c) => c.debt.id === form.id) ?? null : null;

  function openForm(next: DebtFormRequest) {
    setForm(next);
    setFormOpen(true);
  }

  function formOpenChange(open: boolean) {
    setFormOpen(open);
    // Opened from /debts?add=… or ?edit=…: drop the parameter so a refresh doesn't
    // open the form again.
    if (!open && fromUrl) {
      setFromUrl(false);
      router.replace("/debts", { scroll: false });
    }
  }

  function chooseOrder(next: DebtSort) {
    setOrder(next);
    startSaving(async () => {
      await setDebtPayoffOrderAction(next);
    });
  }

  function openLog() {
    setLogKey((k) => k + 1);
    setLogOpen(true);
  }

  const simDebts = useMemo(
    () => active.map((c) => ({ id: c.debt.id, balance: c.currentBalance, payment: c.debt.minimumPayment, annualRate: c.debt.interestRate })),
    [active],
  );
  // The minimums alone are the comparison. With the extra, every order is simulated so
  // the simulator can show the trade-off: in the list's order (what a debt can't absorb
  // moves on the same month) or spread equally, and once a debt is paid off its whole
  // payment rolls on.
  const ids = useMemo(() => active.map((c) => c.debt.id), [active]);
  const base = useMemo(() => simulatePayoff(simDebts, 0, 600, ids), [simDebts, ids]);
  const sims = useMemo(
    () =>
      new Map(
        DEBT_SORTS.map((mode) => {
          const modeIds = mode === order ? ids : sortDebts(active, mode).map((c) => c.debt.id);
          return [mode, simulatePayoff(simDebts, extra, 600, modeIds, { rollover: extra > 0, spread: mode === "spread" })] as const;
        }),
      ),
    [simDebts, extra, ids, active, order],
  );
  const sim = sims.get(order)!;
  const plan = useMemo(() => buildPayoffPlan(simDebts, sim, extra), [simDebts, sim, extra]);
  // Each debt card's "Free in …" line: the month it reaches zero with the extra, next to
  // the month it would at the minimums, and the extra it gets this month.
  const payoff = useMemo(
    () => ({ now: payoffMonthsById(sim), base: payoffMonthsById(base), extraNow: new Map(plan.map((r) => [r.id, r.extraNow])) }),
    [sim, base, plan],
  );
  const hasRight = active.length > 0 || hasOwed;
  // The slider runs to €500, or further when the minimums are higher than that.
  const extraMax = Math.max(500, Math.ceil(totalMonthly / 100) * 100);

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      <DebtsHeader
        active={active.length}
        monthly={totalMonthly}
        toReceive={openOwed.length + advances.length}
        empty={empty}
        onAdd={() => openForm({ kind: "add", direction: "owe" })}
        onLog={active.length > 0 ? openLog : undefined}
      />

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {empty ? (
          <>
            <EmptyCard onAdd={(direction) => openForm({ kind: "add", direction })} />
            <TrackCard onAdd={(direction) => openForm({ kind: "add", direction })} />
          </>
        ) : (
          <>
            <SummaryTiles
              active={active}
              totalDebt={totalDebt}
              owedTotal={totalOwed + advances.reduce((s, a) => s + a.remaining, 0)}
              owedCount={openOwed.length + advances.length}
              base={base}
              sim={sim}
              extra={extra}
              totalMonthly={totalMonthly}
              hasOwn={computed.length > 0}
            />

            {active.length > 0 && (
              <SimulatorCard
                active={active}
                order={order}
                onOrder={chooseOrder}
                base={base}
                sim={sim}
                sims={sims}
                plan={plan}
                extra={extra}
                max={extraMax}
                onExtra={setExtra}
                totalMonthly={totalMonthly}
                freeToSpend={freeToSpend}
                className="lg:col-span-2 xl:col-span-3"
              />
            )}

            <YourDebtsCard
              computed={sorted}
              payoff={payoff}
              extra={extra}
              order={order}
              onOpen={setSheetId}
              onEdit={(id) => openForm({ kind: "edit", id })}
              onAdd={() => openForm({ kind: "add", direction: "owe" })}
              className={cn("lg:col-span-2", !hasRight && "xl:col-span-3")}
            />

            {/* One column at xl beside Your debts; side by side under it at lg. This
                month's payments fills the column so it lines up with Your debts. */}
            {hasRight && (
              <div className="grid min-w-0 gap-5 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:flex xl:flex-col">
                {active.length > 0 && <ThisMonthCard active={active} thisMonth={thisMonth} className={cn("xl:flex-1", !hasOwed && "lg:col-span-2")} />}
                {hasOwed && (
                  <OwedCard
                    owed={openOwed}
                    advances={advances}
                    onOpen={setSheetId}
                    onAdd={() => openForm({ kind: "add", direction: "owed" })}
                    className={cn("lg:self-start xl:self-auto", active.length === 0 && "lg:col-span-2")}
                  />
                )}
              </div>
            )}

            {active.length > 0 && <PayoffTimelineCard active={active} base={base} sim={sim} extra={extra} className="lg:col-span-2 xl:col-span-3" />}
          </>
        )}
      </div>

      {active.length > 0 && <LogPaymentDialog key={logKey} open={logOpen} onOpenChange={setLogOpen} debts={active} />}
      <DebtDetailDialog computed={sheet} bills={bills} onClose={() => setSheetId(null)} />
      <DebtFormDialog
        open={formOpen && (form.kind === "add" || editing != null)}
        onOpenChange={formOpenChange}
        bills={bills}
        debt={editing?.debt ?? null}
        currentRecurringIds={editing?.linkedBillIds ?? []}
        initialDirection={form.kind === "add" ? form.direction : "owe"}
      />

      <AnchoredTip id="debtsDetail" anchor="debtsDetail" active={computed.length > 0} />
      <AnchoredTip id="debtsSimulator" anchor="debtsSimulator" active={active.length > 0} />
      <AnchoredTip id="debtsSortAndImpact" anchor="debtsSortAndImpact" active={active.length > 0} />
      <AnchoredTip id="debtsOrder" anchor="debtsOrder" active={active.length > 1} />
      <AnchoredTip id="debtsWhereExtraGoes" anchor="debtsWhereExtraGoes" active={plan.length > 0} />
      <AnchoredTip id="debtsPaymentsMonth" anchor="debtsPaymentsMonth" active={active.length > 0} />
      <AnchoredTip id="debtsOwed" anchor="debtsOwed" active={hasOwed} />
      <AnchoredTip id="debtsPayoffDates" anchor="debtsPayoffDates" active={active.length > 0} />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function DebtsHeader({
  active,
  monthly,
  toReceive,
  empty,
  onAdd,
  onLog,
}: {
  active: number;
  monthly: number;
  toReceive: number;
  empty: boolean;
  onAdd: () => void;
  /** "Log a payment"; left out when there is no open debt to log one on. */
  onLog?: () => void;
}) {
  const t = useTranslations("plan.debts");
  const tPlan = useTranslations("plan");
  const parts = [t("count", { count: active })];
  if (active > 0) parts.push(t("minimums", { amount: formatEurWhole(monthly) }));
  if (toReceive > 0) parts.push(t("toReceive", { count: toReceive }));

  return (
    <div className="flex flex-col gap-4 lg:gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{tPlan("title")}</h1>
          <span className="hidden text-base font-medium text-clear-ink-2 lg:inline"><MoneyText>{empty ? t("subtitleNone") : parts.join(" · ")}</MoneyText></span>
        </div>
        <div className="flex items-center gap-2.5">
          {/* A cost paid in parts isn't a debt, but this is where people look for one. */}
          <AddRecurringButton type="plan" ariaLabel={t("addPlan")} className={cn(clearButtonVariants({ variant: "surface", size: "icon" }), "size-12 lg:hidden")}>
            <IconCalendarDue aria-hidden />
          </AddRecurringButton>
          <AddRecurringButton type="plan" className={cn(clearButtonVariants({ variant: "surface" }), "hidden lg:inline-flex")}>
            <IconCalendarDue aria-hidden />
            {t("addPlan")}
          </AddRecurringButton>
          {onLog && (
            <>
              <button type="button" onClick={onLog} aria-label={t("logPayment.button")} className={cn(clearButtonVariants({ variant: "surface", size: "icon" }), "size-12 lg:hidden")}>
                <IconReceipt aria-hidden />
              </button>
              <button type="button" onClick={onLog} className={cn(clearButtonVariants({ variant: "surface" }), "hidden lg:inline-flex")}>
                <IconReceipt aria-hidden />
                {t("logPayment.button")}
              </button>
            </>
          )}
          <button type="button" onClick={onAdd} aria-label={t("add")} className={cn(clearButtonVariants({ size: "icon" }), "size-12 lg:hidden")}>
            <IconPlus aria-hidden />
          </button>
          <button type="button" onClick={onAdd} className={cn(clearButtonVariants(), "hidden lg:inline-flex")}>
            <IconPlus aria-hidden />
            {t("add")}
          </button>
        </div>
      </div>
      <div className="flex">
        <PlanSwitch />
      </div>
    </div>
  );
}

// ── Summary tiles ─────────────────────────────────────────────────────────────

/**
 * The "You owe" tile's line: the debt that is gone first and when, else why nothing
 * has a payoff date, else the biggest balances.
 */
function useOweLine(active: ComputedDebt[]) {
  const t = useTranslations("plan.debts.tiles");
  const monthYear = useMonthYear();
  if (active.length === 0) return t("oweNone");
  const first = active
    .filter((c) => !c.neverPaysOff && c.lastPaymentDate)
    .sort((a, z) => a.lastPaymentDate!.getTime() - z.lastPaymentDate!.getTime())[0];
  if (first) {
    const values = { name: first.debt.name, count: monthsUntil(first.lastPaymentDate!), date: monthYear(first.lastPaymentDate!) };
    return active.length === 1 ? t("paidOffOnly", values) : t("paidOffFirst", values);
  }
  const never = active.find((c) => c.neverPaysOff);
  if (never) return t("oweNever", { name: never.debt.name });
  const breakdown = [...active]
    .sort((a, z) => z.currentBalance - a.currentBalance)
    .slice(0, 3)
    .map((c) => `${c.debt.name} ${formatEurWhole(c.currentBalance)}`);
  if (active.length > 3) breakdown.push(t("more", { count: active.length - 3 }));
  return breakdown.join(" · ");
}

function SummaryTiles({
  active,
  totalDebt,
  owedTotal,
  owedCount,
  base,
  sim,
  extra,
  totalMonthly,
  hasOwn,
}: {
  active: ComputedDebt[];
  totalDebt: number;
  owedTotal: number;
  owedCount: number;
  base: Sim;
  sim: Sim;
  extra: number;
  totalMonthly: number;
  hasOwn: boolean;
}) {
  const t = useTranslations("plan.debts.tiles");
  const monthYear = useMonthYear();
  const oweLine = useOweLine(active);
  const card = "gap-2.5 px-5 py-5 lg:px-6 lg:py-[22px]";
  const figure = "text-[30px] leading-none font-bold! tracking-[-0.03em] lg:text-[36px]";
  const round = "inline-flex size-9 items-center justify-center rounded-full [&_svg]:size-[18px]";
  // The interest still to come at the current extra (the slider's plan).
  const interest = active.length > 0 && sim.months != null && sim.interest >= 0.5 ? t("interestToCome", { amount: formatEurWhole(sim.interest) }) : null;

  let free: { value: string; foot: string };
  if (!hasOwn) free = { value: "—", foot: t("free.none") };
  else if (active.length === 0) free = { value: t("free.now"), foot: t("free.allPaid") };
  else if (extra > 0 && sim.months != null)
    free = {
      value: monthYear(monthsFromNow(sim.months)),
      foot: base.months != null ? t("freeWithExtra", { amount: formatEurWhole(extra), date: monthYear(monthsFromNow(base.months)) }) : t("free.never"),
    };
  else if (base.months == null) free = { value: "—", foot: t("free.never") };
  else free = { value: monthYear(monthsFromNow(base.months)), foot: t("free.atMinimums", { amount: formatEurWhole(totalMonthly) }) };

  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:col-span-2 xl:col-span-3">
      <ClearCard hero aria-labelledby="debts-owe-title" className={cn(card, "col-span-2 sm:col-span-1")}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="debts-owe-title" className="m-0 text-[15px] font-semibold text-clear-hero-ink-2">{t("owe")}</h2>
          <span aria-hidden className={cn(round, "bg-clear-hero-ink/15")}>
            <IconArrowUpRight stroke={2.2} />
          </span>
        </div>
        <Amount value={totalDebt} whole splitCents={false} sign="none" className={figure} />
        <span className="line-clamp-2 text-[13px] font-medium text-clear-hero-ink-2">
          <MoneyText>{interest ? `${oweLine} · ${interest}` : oweLine}</MoneyText>
        </span>
      </ClearCard>

      <ClearCard aria-labelledby="debts-owed-title" className={card}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="debts-owed-title" className="m-0 text-[15px] font-semibold text-clear-ink-2">{t("owed")}</h2>
          <span aria-hidden className={cn(round, "bg-clear-ground")}>
            <IconArrowDownRight stroke={2.2} />
          </span>
        </div>
        <Amount value={owedTotal} whole splitCents={false} sign="none" className={figure} />
        <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-clear-ink-2">
          {owedCount > 0 ? (
            t.rich("toReceive", {
              count: owedCount,
              n: (c) => <ClearChip tone="sky" className="h-6 px-2 text-xs font-semibold">{c}</ClearChip>,
            })
          ) : (
            t("owedNone")
          )}
        </span>
      </ClearCard>

      <ClearCard aria-labelledby="debts-free-title" className={card}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="debts-free-title" className="m-0 text-[15px] font-semibold text-clear-ink-2">{t("free.title")}</h2>
          <span aria-hidden className={cn(round, "bg-clear-ground")}>
            <IconCalendarEvent stroke={2} />
          </span>
        </div>
        <span className={cn("clear-amount whitespace-nowrap", figure)}><MoneyText>{free.value}</MoneyText></span>
        <span className="text-[13px] font-medium text-clear-ink-2"><MoneyText>{free.foot}</MoneyText></span>
      </ClearCard>
    </div>
  );
}

// ── Your debts ────────────────────────────────────────────────────────────────

type PayoffMonths = { now: Map<number, number | null>; base: Map<number, number | null>; extraNow: Map<number, number> };

function YourDebtsCard({
  computed,
  payoff,
  extra,
  order,
  onOpen,
  onEdit,
  onAdd,
  className,
}: {
  computed: ComputedDebt[];
  payoff: PayoffMonths;
  extra: number;
  order: DebtSort;
  onOpen: (id: number) => void;
  onEdit: (id: number) => void;
  onAdd: () => void;
  className?: string;
}) {
  const t = useTranslations("plan.debts");
  // The tip points at the first open debt's "Free in …" chip.
  const firstOpen = computed.find((c) => payoff.now.has(c.debt.id))?.debt.id;
  const parts =
    computed.length === 0
      ? []
      : [computed.length > 1 ? t("yoursOrder", { count: computed.length, order: t(`sort.inline.${order}`) }) : t("yoursCount", { count: computed.length })];
  if (extra > 0 && firstOpen != null) parts.push(t("yoursExtra", { amount: formatEurWhole(extra) }));
  return (
    <ClearCard aria-labelledby="debts-yours-title" className={className}>
      <ClearCardHeader title={<span id="debts-yours-title">{t("yours")}</span>} subtitle={parts.length > 0 ? parts.join(" · ") : undefined} />
      {computed.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-clear-tile bg-clear-tile p-5">
          <p className="m-0 text-[15px] leading-[1.45] font-medium text-clear-ink-2">{t("noneOfYourOwn")}</p>
          <button type="button" onClick={onAdd} className={clearButtonVariants()}>
            <IconPlus aria-hidden />
            {t("add")}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {computed.map((c, i) => (
            <DebtTile
              key={c.debt.id}
              c={c}
              anchor={i === 0}
              payoffAnchor={c.debt.id === firstOpen}
              months={payoff.now.get(c.debt.id)}
              baseMonths={payoff.base.get(c.debt.id)}
              extraNow={payoff.extraNow.get(c.debt.id) ?? 0}
              onOpen={() => onOpen(c.debt.id)}
              onEdit={() => onEdit(c.debt.id)}
            />
          ))}
        </div>
      )}
    </ClearCard>
  );
}

function DebtTile({
  c,
  anchor,
  payoffAnchor,
  months,
  baseMonths,
  extraNow,
  onOpen,
  onEdit,
}: {
  c: ComputedDebt;
  anchor: boolean;
  payoffAnchor: boolean;
  /** The month this debt reaches zero with the simulator's extra; null never, undefined not simulated (paid off). */
  months: number | null | undefined;
  /** The same at the minimums, for "N months sooner". */
  baseMonths: number | null | undefined;
  /** What the extra adds to this debt's payment this month. */
  extraNow: number;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations("plan.debts.tile");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const notice = usePaymentNotice();
  const { debt, currentBalance } = c;
  const done = currentBalance === 0;
  const pct = Math.round(debtPaidPct(debt, c.amountPaid, currentBalance));
  const total = debtEffectiveTotal(debt);
  const paid = debtEffectivePaid(debt, c.amountPaid, currentBalance);
  const bill = c.linkedBills[0] ?? null;
  const meta = bill
    ? bill.dueDay
      ? t("paidByOn", { name: bill.friendlyName ?? bill.name, day: bill.dueDay })
      : t("paidBy", { name: bill.friendlyName ?? bill.name })
    : t("notLinked");
  // The payoff month follows the simulator's extra (the minimums when it is 0).
  const status = done
    ? { tone: "mint" as const, text: t("done") }
    : months === null || (months === undefined && c.neverPaysOff)
      ? { tone: "rose" as const, text: t("never") }
      : months !== undefined
        ? { tone: "mint" as const, text: t("payoffIn", { date: monthYear(monthsFromNow(months)) }) }
        : { tone: "neutral" as const, text: t("noDate") };
  const sooner = months != null && baseMonths != null ? baseMonths - months : 0;
  const monthsLeft = done ? null : months !== undefined ? months : c.monthsRemaining;
  const mini = "flex min-w-0 flex-col gap-0.5 rounded-clear-icon bg-clear-card px-2.5 py-2.5";
  const miniValue = "clear-amount truncate text-sm font-bold!";
  // The payoff chip sits in the header row when the tile is wide enough for it beside
  // the name and the pencil, else beside the balance (only one of the two is shown).
  const chip = (className: string) => (
    <span data-tip-anchor={payoffAnchor ? "debtsPayoffDates" : undefined} className={className}>
      <ClearChip tone={status.tone} icon={done ? <IconCheck stroke={3} aria-hidden /> : undefined} className="font-semibold">
        {status.text}
      </ClearChip>
    </span>
  );

  return (
    <article
      data-tip-anchor={anchor ? "debtsDetail" : undefined}
      className="@container relative flex min-w-0 flex-col gap-3.5 rounded-clear-tile bg-clear-tile p-[18px] transition-shadow hover:ring-2 hover:ring-clear-ink/10"
    >
      <div className="flex items-center gap-3">
        <DebtIcon icon={debt.icon ?? bill?.icon} color={debt.color} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The name is the tile's one link: its hit area covers the whole tile. */}
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer truncate text-left text-base font-semibold outline-none after:absolute after:inset-0 after:rounded-clear-tile focus-visible:after:ring-3 focus-visible:after:ring-clear-ember/50"
          >
            {debt.name}
          </button>
          <span className="truncate text-[13px] font-medium text-clear-muted">{meta}</span>
        </span>
        {chip("hidden shrink-0 @[21rem]:inline-flex")}
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("edit", { name: debt.name })}
          className={cn(clearButtonVariants({ variant: "surface", size: "icon" }), "relative z-10 size-10")}
        >
          <IconPencil aria-hidden size={18} />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <Amount value={currentBalance} whole splitCents={false} sign="none" className="text-[28px] leading-none font-bold! tracking-[-0.03em]" />
          <span className="text-sm font-medium text-clear-ink-2"><MoneyText>{t("leftOf", { amount: formatEurWhole(total) })}</MoneyText></span>
        </span>
        {chip("inline-flex @[21rem]:hidden")}
      </div>

      <div className="flex flex-col gap-1.5">
        <ClearProgress value={pct / 100} size="md" className="bg-clear-card" fillClassName={done ? "bg-clear-positive-fill" : "bg-clear-primary"} />
        <span className="flex flex-wrap justify-between gap-x-3 text-[13px] font-medium tabular-nums text-clear-ink-2">
          <span><MoneyText>{t.rich("paid", { pct, amount: formatEurWhole(paid), b: (ch) => <b className="font-bold text-clear-ink"><MoneyText>{ch}</MoneyText></b> })}</MoneyText></span>
          {sooner > 0 && <span className="font-semibold text-clear-positive">{t("soonerThanMinimum", { count: sooner })}</span>}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={mini}>
          <span className="truncate text-xs font-medium text-clear-muted">{t("monthly")}</span>
          <span className={miniValue}>
            <MoneyText>{formatEur(debt.minimumPayment)}</MoneyText>
            {extraNow > 0 && (
              <>
                {" "}
                <span className="text-clear-ember-text"><MoneyText>{t("extraPlus", { amount: formatEurWhole(extraNow) })}</MoneyText></span>
              </>
            )}
          </span>
        </div>
        <div className={mini}>
          <span className="truncate text-xs font-medium text-clear-muted">{t("interest")}</span>
          <span className={miniValue}>
            {debt.interestRate ? t("perYear", { rate: debt.interestRate.toLocaleString(locale) }) : t("noInterest")}
          </span>
        </div>
        <div className={mini}>
          <span className="truncate text-xs font-medium text-clear-muted">{t("monthsLeftLabel")}</span>
          <span className={miniValue}>{monthsLeft != null && monthsLeft > 0 ? monthsLeft : "—"}</span>
        </div>
      </div>

      <PaymentNotice variant="line" notice={notice({ balance: currentBalance, payment: debt.minimumPayment, rate: debt.interestRate, owed: false })} />
    </article>
  );
}

// ── Owed to you ───────────────────────────────────────────────────────────────

function OwedCard({
  owed,
  advances,
  onOpen,
  onAdd,
  className,
}: {
  owed: ComputedDebt[];
  advances: OpenAdvance[];
  onOpen: (id: number) => void;
  onAdd: () => void;
  className?: string;
}) {
  const t = useTranslations("plan.debts.owed");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  // Closing an advance: whatever hasn't come back by now isn't expected any more. The
  // expected amount drops to what was received.
  async function settleAdvance(a: OpenAdvance) {
    const ok = await confirm({
      title: t("settleConfirm", { name: a.name }),
      body: t("settleConfirmBody", { amount: formatEur(a.remaining) }),
      confirmLabel: t("settle"),
    });
    if (!ok) return;
    setBusy(`a${a.transactionId}`);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.transactionId, expectedReimbursement: a.received }),
    });
    setBusy(null);
    router.refresh();
  }

  // The same for a debt someone owes you: the total drops to what came back and its
  // linked bills end (see settleDebt in /api/debts).
  async function settleDebt(c: ComputedDebt) {
    const ok = await confirm({
      title: t("settleDebtConfirm", { name: c.debt.name }),
      body: t("settleDebtConfirmBody", { amount: formatEur(c.currentBalance) }),
      confirmLabel: t("settle"),
    });
    if (!ok) return;
    setBusy(`d${c.debt.id}`);
    await fetch("/api/debts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.debt.id, settle: true }),
    });
    setBusy(null);
    router.refresh();
  }

  const tile = "relative flex flex-col gap-3.5 rounded-clear-tile bg-clear-tile p-4";
  // Above the name button's whole-tile hit area, so it stays its own target.
  const settleButton = cn(clearButtonVariants({ variant: "primary" }), "relative z-10 w-full");

  return (
    <ClearCard data-tip-anchor="debtsOwed" aria-labelledby="debts-owed-list-title" className={cn("gap-4", className)}>
      <ClearCardHeader
        title={<span id="debts-owed-list-title">{t("title")}</span>}
        action={
          <button type="button" onClick={onAdd} className={LINK_BUTTON}>
            {t("add")}
          </button>
        }
      />
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {owed.map((c) => {
          const total = debtEffectiveTotal(c.debt);
          const back = debtEffectivePaid(c.debt, c.amountPaid, c.currentBalance);
          const pct = Math.round(debtPaidPct(c.debt, c.amountPaid, c.currentBalance));
          return (
            <li key={`d${c.debt.id}`} className={cn(tile, "transition-shadow hover:ring-2 hover:ring-clear-ink/10")}>
              <OwedHead
                avatar={<DebtIcon icon={c.debt.icon ?? c.linkedBills[0]?.icon} color={c.debt.color} owed />}
                name={
                  <button
                    type="button"
                    onClick={() => onOpen(c.debt.id)}
                    className="cursor-pointer truncate text-left text-base font-semibold outline-none after:absolute after:inset-0 after:rounded-clear-tile focus-visible:after:ring-3 focus-visible:after:ring-clear-ember/50"
                  >
                    {c.debt.name}
                  </button>
                }
                sub={t("debtSub", { amount: formatEurWhole(c.debt.minimumPayment) })}
                amount={c.currentBalance}
                of={total}
              />
              <OwedProgress pct={pct} back={back} />
              <button
                type="button"
                disabled={busy === `d${c.debt.id}`}
                onClick={() => settleDebt(c)}
                aria-label={t("settleNamed", { name: c.debt.name })}
                className={settleButton}
              >
                <IconCheck aria-hidden />
                {t("settle")}
              </button>
            </li>
          );
        })}
        {advances.map((a) => {
          const pct = a.expected > 0 ? Math.round((a.received / a.expected) * 100) : 0;
          return (
            <li key={`a${a.transactionId}`} className={tile}>
              <OwedHead
                avatar={
                  a.icon ? (
                    <span aria-hidden className="inline-flex shrink-0">
                      <Icon iconKey={a.icon} color={a.color} background={pastel(a.color)} size="md" round />
                    </span>
                  ) : (
                    <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-sky text-[15px] font-bold text-clear-sky-ink">
                      {a.name.trim().charAt(0).toUpperCase()}
                    </span>
                  )
                }
                name={<span className="truncate text-base font-semibold">{a.name}</span>}
                sub={t("advanceSub", { date: day.format(new Date(`${a.date}T12:00:00`)) })}
                amount={a.remaining}
                of={a.expected}
              />
              <OwedProgress pct={pct} back={a.received} />
              <button
                type="button"
                disabled={busy === `a${a.transactionId}`}
                onClick={() => settleAdvance(a)}
                aria-label={t("settleNamed", { name: a.name })}
                className={settleButton}
              >
                <IconCheck aria-hidden />
                {t("settle")}
              </button>
            </li>
          );
        })}
      </ul>
    </ClearCard>
  );
}

function OwedHead({ avatar, name, sub, amount, of }: { avatar: React.ReactNode; name: React.ReactNode; sub: string; amount: number; of: number }) {
  const t = useTranslations("plan.debts.owed");
  return (
    <div className="flex items-center gap-3">
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {name}
        <span className="truncate text-[13px] text-clear-muted"><MoneyText>{sub}</MoneyText></span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <Amount value={amount} sign="none" splitCents={false} className="text-lg font-bold!" />
        <span className="text-xs text-clear-muted"><MoneyText>{t("leftOf", { amount: formatEurWhole(of) })}</MoneyText></span>
      </span>
    </div>
  );
}

function OwedProgress({ pct, back }: { pct: number; back: number }) {
  const t = useTranslations("plan.debts.owed");
  return (
    <div className="flex flex-col gap-1.5">
      <ClearProgress value={pct / 100} size="md" className="bg-clear-card" fillClassName="bg-clear-positive-fill" />
      <span className="flex flex-wrap justify-between gap-x-3 text-[13px] tabular-nums text-clear-ink-2">
        <span>{t.rich("received", { pct, b: (ch) => <b className="text-clear-ink">{ch}</b> })}</span>
        <span><MoneyText>{t("backSoFar", { amount: formatEurWhole(back) })}</MoneyText></span>
      </span>
    </div>
  );
}

// ── Simulator ─────────────────────────────────────────────────────────────────

/**
 * "What if I pay extra?", across the full width. On the left the slider, the payoff
 * order (quickest win first · highest interest first · spread over all debts, which also
 * sorts Your debts) with a sentence saying where the extra goes and, pinned to the
 * bottom, what the extra leaves to spend each month. On the right what it does —
 * debt-free, how much sooner, the interest saved, each against the minimums with the
 * other two orders under it — and where the extra goes, month by month: one row per
 * debt, the extra on the first (or an equal share on each), what a debt can't absorb
 * moving on the same month and each paid-off debt's whole payment rolling on.
 */
function SimulatorCard({
  active,
  order,
  onOrder,
  base,
  sim,
  sims,
  plan,
  extra,
  max,
  onExtra,
  totalMonthly,
  freeToSpend,
  className,
}: {
  active: ComputedDebt[];
  order: DebtSort;
  onOrder: (order: DebtSort) => void;
  base: Sim;
  sim: Sim;
  /** The same extra in every order, for the comparison under the tiles. */
  sims: ReadonlyMap<DebtSort, Sim>;
  plan: PayoffPlanRow[];
  extra: number;
  max: number;
  onExtra: (n: number) => void;
  totalMonthly: number;
  freeToSpend: DebtsFreeToSpend;
  className?: string;
}) {
  const t = useTranslations("plan.debts.simulator");
  const tSort = useTranslations("plan.debts.sort");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const list = useMemo(() => new Intl.ListFormat(locale, { type: "conjunction" }), [locale]);
  // Each tile's figure against the minimums, for any order.
  const debtFreeOf = (s: Sim) => (s.months != null ? monthYear(monthsFromNow(s.months)) : "—");
  const soonerOf = (s: Sim) => {
    const n = base.months != null && s.months != null ? base.months - s.months : null;
    return n != null && n > 0 ? t("months", { count: n }) : "—";
  };
  const savedOf = (s: Sim) => formatEurWhole(Math.max(0, Math.round((base.interest - s.interest) * 100) / 100));
  // The other two orders under each tile, so the trade-off shows; only when they differ.
  const others = active.length > 1 && extra > 0 ? DEBT_SORTS.filter((o) => o !== order) : [];
  const compare = (value: (s: Sim) => string, className: string) =>
    others.length > 0 && (
      <span className={cn("flex flex-col text-xs font-medium", className)}>
        {others.map((o) => (
          <span key={o} className="truncate">
            <MoneyText>{t("compareLine", { mode: tSort(`short.${o}`), value: value(sims.get(o)!) })}</MoneyText>
          </span>
        ))}
      </span>
    );
  const names = active.map((c) => c.debt.name);
  const sentence =
    order === "spread"
      ? t("orderSentence.spread", { all: list.format(names) })
      : t(`orderSentence.${order}`, { first: names[0] ?? "", rest: list.format(names.slice(1)) });
  const stat = "flex min-w-0 flex-col gap-1 rounded-clear-tile p-3.5";
  const statValue = "clear-amount truncate text-[22px] font-bold! tracking-[-0.02em]";
  // Full names when the column is wide enough for them, short ones on a phone and in
  // the narrow xl column.
  const orderLabel = (o: DebtSort) => (
    <>
      <span className="truncate @[32rem]:hidden">{tSort(`short.${o}`)}</span>
      <span className="hidden truncate @[32rem]:inline">{tSort(`options.${o}`)}</span>
    </>
  );

  return (
    <ClearCard data-tip-anchor="debtsSimulator" aria-labelledby="debts-sim-title" className={cn("gap-6 xl:grid xl:grid-cols-[1.1fr_2fr]", className)}>
      <div className="flex min-w-0 flex-col gap-3.5">
        <ClearCardHeader title={<span id="debts-sim-title">{t("title")}</span>} subtitle={<MoneyText>{t("subtitle", { amount: formatEurWhole(totalMonthly) })}</MoneyText>} />

        <div className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="debt-extra" className="text-xs font-medium text-clear-muted">
              {t("extra")}
            </label>
            <Amount value={extra} whole splitCents={false} sign="none" className="text-[28px] leading-none font-bold! tracking-[-0.03em]" />
          </div>
          <ExtraSlider id="debt-extra" value={extra} max={max} onChange={onExtra} valueText={t("valueText", { amount: formatEurWhole(extra) })} />
          <div aria-hidden className="flex justify-between text-xs font-medium tabular-nums text-clear-muted">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f}><MoneyText>{formatEurWhole(Math.round(max * f))}</MoneyText></span>
            ))}
          </div>
        </div>

        {active.length > 1 && (
          <div data-tip-anchor="debtsSortAndImpact" className="@container flex flex-col gap-2">
            <span className="text-[13px] font-medium text-clear-muted">{t("order")}</span>
            <div data-tip-anchor="debtsOrder" className="flex min-w-0">
              <Segmented<DebtSort>
                label={t("orderLabel")}
                surface="tile"
                size="sm"
                value={order}
                onChange={onOrder}
                items={DEBT_SORTS.map((o) => ({ value: o, label: orderLabel(o) }))}
                className="grid w-full grid-cols-[repeat(3,minmax(0,auto))] [&>button]:min-w-0 [&>button]:px-2.5"
              />
            </div>
            <p className="m-0 text-[13px] leading-[1.45] font-medium text-clear-ink-2">{sentence}</p>
          </div>
        )}

        <FreeToSpendTile freeToSpend={freeToSpend} extra={extra} tipAnchor={active.length <= 1} className="xl:mt-auto" />
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className={cn(stat, "bg-clear-ember text-clear-ember-ink")}>
            <span className="text-xs font-medium">{t("debtFree")}</span>
            <span className={statValue}>{debtFreeOf(sim)}</span>
            {compare(debtFreeOf, "text-clear-ember-ink")}
          </div>
          <div className={cn(stat, "bg-clear-mint text-clear-mint-ink")}>
            <span className="text-xs font-medium">{t("sooner")}</span>
            <span className={statValue}>{soonerOf(sim)}</span>
            {compare(soonerOf, "text-clear-mint-ink")}
          </div>
          <div className={cn(stat, "col-span-2 bg-clear-tile sm:col-span-1")}>
            <span className="text-xs font-medium text-clear-muted">{t("saved")}</span>
            <span className={statValue}><MoneyText>{savedOf(sim)}</MoneyText></span>
            {compare(savedOf, "text-clear-muted")}
          </div>
        </div>

        <PlanTile active={active} plan={plan} extra={extra} spread={sim.spread} className="flex-1" />
      </div>
    </ClearCard>
  );
}

/**
 * What the extra does to the month: free to spend now (recurring income minus bills,
 * debt payments, savings and the budget — computed on the server) and after the extra,
 * with a chip saying whether that still leaves something or how much it falls short.
 */
function FreeToSpendTile({
  freeToSpend,
  extra,
  tipAnchor,
  className,
}: {
  freeToSpend: DebtsFreeToSpend;
  extra: number;
  /** Carries the order tip's anchor when there is no order switch to point at. */
  tipAnchor: boolean;
  className?: string;
}) {
  const t = useTranslations("plan.debts.simulator.free");
  const box = cn("flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-clear-tile bg-clear-tile px-4 py-3", className);
  const anchor = tipAnchor ? "debtsSortAndImpact" : undefined;

  if (freeToSpend.income <= 0) {
    return (
      <div data-tip-anchor={anchor} className={cn(box, "flex-col items-start")}>
        <span className="text-xs font-medium text-clear-muted">{t("title")}</span>
        <span className="text-[13px] leading-[1.45] font-medium text-clear-ink-2">{t("noIncome")}</span>
      </div>
    );
  }

  const now = Math.round(freeToSpend.free);
  const after = Math.round(freeToSpend.free - extra);
  const short = after < 0 ? -after : 0;

  return (
    <div data-tip-anchor={anchor} className={box}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium text-clear-muted">{t("title")}</span>
        {extra > 0 && <span className="sr-only"><MoneyText>{t("change", { from: formatEurWhole(now), to: formatEurWhole(after) })}</MoneyText></span>}
        <span aria-hidden={extra > 0 || undefined} className="flex flex-wrap items-baseline gap-x-1.5 text-[15px]">
          <Amount value={now} whole splitCents={false} className={cn("font-bold!", extra > 0 && "text-clear-ink-2")} />
          {extra > 0 && (
            <>
              <span className="text-clear-muted">→</span>
              <Amount value={after} whole splitCents={false} className={cn("font-bold!", short > 0 && "text-clear-ember-text")} />
            </>
          )}
        </span>
      </div>
      {short > 0 ? (
        <ClearChip tone="ember" icon={<IconAlertTriangle stroke={2.2} aria-hidden />} className="h-auto min-h-7 px-2.5 py-1 text-xs font-semibold whitespace-normal">
          <MoneyText>{t("short", { amount: formatEurWhole(short) })}</MoneyText>
        </ClearChip>
      ) : (
        extra > 0 && (
          <ClearChip tone="mint" className="h-auto min-h-7 px-2.5 py-1 text-xs font-semibold whitespace-normal">
            {t("stillLeft")}
          </ClearChip>
        )
      )}
    </div>
  );
}

/**
 * "Where the €200 goes, month by month": the plan as a table, one row per debt in the
 * payoff order — its minimum, the extra it gets now, what you pay, until when, and what
 * happens then. In order, "until" is when the payments before it roll on to it and
 * "then" where its own payment goes; spread over all debts, "until" is its payoff month
 * and "then" says its share is divided over the debts left. Scrolls sideways inside its
 * tile on a phone.
 */
function PlanTile({
  active,
  plan,
  extra,
  spread,
  className,
}: {
  active: ComputedDebt[];
  plan: PayoffPlanRow[];
  extra: number;
  /** The extra is divided equally over the open debts (the "Spread over all debts" order). */
  spread: boolean;
  className?: string;
}) {
  const t = useTranslations("plan.debts.simulator.plan");
  const tTile = useTranslations("plan.debts.tile");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const byId = new Map(active.map((c) => [c.debt.id, c]));
  const name = (id: number | null) => (id != null ? byId.get(id)?.debt.name ?? "" : "");
  const date = (m: number) => monthYear(monthsFromNow(m));
  const th = "pb-2 text-xs font-medium text-clear-muted whitespace-nowrap";
  const td = "border-t border-clear-ground py-2 align-top";

  return (
    <div data-tip-anchor="debtsWhereExtraGoes" className={cn("flex min-w-0 flex-col gap-2.5 rounded-clear-tile bg-clear-tile p-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="m-0 text-[13px] font-semibold text-clear-ink">
          <MoneyText>{extra > 0 ? t("title", { amount: formatEurWhole(extra) }) : t("titleNone")}</MoneyText>
        </h3>
        <span className="text-xs font-medium text-clear-muted">{t("note")}</span>
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[620px] border-collapse text-left text-[13px] font-medium tabular-nums">
          <thead>
            <tr>
              <th scope="col" className={cn(th, "pr-3")}>{t("debt")}</th>
              <th scope="col" className={cn(th, "pr-3 text-right")}>{t("minimum")}</th>
              <th scope="col" className={cn(th, "pr-3 text-right")}>{t("extraNow")}</th>
              <th scope="col" className={cn(th, "pr-3 text-right")}>{t("pay")}</th>
              <th scope="col" className={cn(th, "pr-3")}>{t("until")}</th>
              <th scope="col" className={th}>{t("then")}</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((r) => {
              const c = byId.get(r.id);
              if (!c) return null;
              const rate = c.debt.interestRate ?? 0;
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
              return (
                <tr key={r.id}>
                  <th scope="row" className={cn(td, "pr-3 font-medium whitespace-nowrap")}>
                    <span className="font-semibold text-clear-ink">{c.debt.name}</span>{" "}
                    <span className="text-xs text-clear-muted">{t("rate", { rate: rate.toLocaleString(locale) })}</span>
                  </th>
                  <td className={cn(td, "pr-3 text-right")}><MoneyText>{formatEurWhole(r.minimum)}</MoneyText></td>
                  <td className={cn(td, "pr-3 text-right", r.extraNow > 0 ? "font-bold text-clear-ember-text" : "text-clear-ink-2")}>
                    <MoneyText>{r.extraNow > 0 ? tTile("extraPlus", { amount: formatEurWhole(r.extraNow) }) : formatEurWhole(0)}</MoneyText>
                  </td>
                  <td className={cn(td, "pr-3 text-right font-bold")}><MoneyText>{formatEurWhole(r.pay)}</MoneyText></td>
                  <td className={cn(td, "pr-3 whitespace-nowrap")}><MoneyText>{until}</MoneyText></td>
                  <td className={cn(td, "text-clear-muted")}><MoneyText>{then}</MoneyText></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyCard({ onAdd }: { onAdd: (direction: "owe" | "owed") => void }) {
  const t = useTranslations("plan.debts.empty");
  return (
    <ClearCard aria-labelledby="debts-empty-title" className="items-center justify-center gap-6 px-6 py-12 text-center lg:col-span-2 lg:px-8">
      <svg width="260" height="200" viewBox="0 0 260 200" fill="none" aria-hidden className="h-auto w-full max-w-[260px]">
        <circle cx="130" cy="104" r="86" fill="var(--clr-sky)" />
        <path d="M50 170V60H86V84H122V108H158V132H194V156H230V170Z" fill="var(--clr-peach)" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M86 86V168M122 110V168M158 134V168M194 158V168" stroke="var(--clr-hatch-stripe)" strokeWidth="2" />
        <path d="M54 64h28M90 88h28M126 112h28M162 136h28" stroke="var(--clr-ember)" strokeWidth="3" strokeLinecap="round" />
        <path d="M60 48Q82 22 98 58" stroke="var(--clr-placeholder)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
        <circle cx="104" cy="73" r="10" fill="var(--clr-butter)" stroke="var(--clr-ink)" strokeWidth="2.2" />
        <path d="M214 156V100" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M214 102h30l-7 11 7 11h-30z" fill="var(--clr-mint)" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="38" cy="96" r="6" fill="var(--clr-butter)" />
        <circle cx="232" cy="62" r="5" fill="var(--clr-ember)" />
        <circle cx="200" cy="36" r="4" fill="var(--clr-card)" stroke="var(--clr-ink)" strokeWidth="2" />
      </svg>
      <div className="flex flex-col items-center gap-2.5">
        <h2 id="debts-empty-title" className="m-0 text-2xl font-bold tracking-[-0.02em]">{t("title")}</h2>
        <p className="m-0 max-w-[480px] text-base leading-normal text-clear-ink-2">{t("body")}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        <button type="button" onClick={() => onAdd("owe")} className={clearButtonVariants({ size: "lg" })}>
          <IconPlus aria-hidden />
          {t("add")}
        </button>
        <button type="button" onClick={() => onAdd("owed")} className={clearButtonVariants({ variant: "secondary", size: "lg" })}>
          <IconUsers aria-hidden />
          {t("owedToMe")}
        </button>
      </div>
    </ClearCard>
  );
}

function TrackCard({ onAdd }: { onAdd: (direction: "owe" | "owed") => void }) {
  const t = useTranslations("plan.debts.empty.track");
  const kinds = [
    { key: "loan", icon: <IconSchool />, tone: "bg-clear-sky text-clear-sky-ink", direction: "owe" as const },
    { key: "card", icon: <IconCreditCard />, tone: "bg-clear-peach text-clear-peach-ink", direction: "owe" as const },
    { key: "lent", icon: <IconUsers />, tone: "bg-clear-mint text-clear-mint-ink", direction: "owed" as const },
  ];
  return (
    <ClearCard aria-labelledby="debts-track-title" className="gap-4 lg:col-span-2 xl:col-span-1">
      <ClearCardHeader title={<span id="debts-track-title">{t("title")}</span>} subtitle={t("subtitle")} />
      <div className="flex flex-col gap-2.5">
        {kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => onAdd(k.direction)}
            className="flex cursor-pointer items-start gap-3.5 rounded-clear-tile bg-clear-tile p-4 text-left transition-shadow hover:ring-2 hover:ring-clear-ink/10"
          >
            <span aria-hidden className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-clear-icon [&_svg]:size-5", k.tone)}>
              {k.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[15px] font-semibold">{t(`${k.key}.title`)}</span>
              <span className="text-[13px] leading-[1.45] text-clear-muted">{t(`${k.key}.body`)}</span>
            </span>
            <IconChevronRight aria-hidden size={18} stroke={2.2} className="mt-3 shrink-0 text-clear-muted" />
          </button>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 rounded-clear-tile bg-clear-tile px-4 py-3.5">
        <span className="text-sm font-bold">{t("total")}</span>
        <Amount value={0} sign="none" className="text-lg font-bold! text-clear-placeholder" />
      </div>
    </ClearCard>
  );
}
