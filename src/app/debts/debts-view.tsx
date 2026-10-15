"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconCheck,
  IconCreditCard,
  IconInfoCircle,
  IconListDetails,
  IconPlus,
  IconTrendingUp,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEur, formatEurWhole } from "@/lib/format";
import { monthlyRate } from "@/lib/debt-interest";
import { simulatePayoff } from "@/lib/debt-simulate";
import type { OpenAdvance } from "@/lib/open-advances";
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
import type { RecurringItem } from "@/db/schema";
import { debtEffectiveTotal, debtPaidPct, type ComputedDebt } from "./debt-shared";
import { DebtDetailDialog } from "./debt-detail-dialog";
import { DebtEditDialog } from "./debt-edit-dialog";

const CARD = "rounded-card border border-line bg-surface shadow-card";
const GHOST = cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-3.5 text-[13px] font-semibold");

function debtColor(c: ComputedDebt) {
  return c.debt.color ?? "var(--arca-ink-3)";
}
function debtIcon(c: ComputedDebt) {
  return c.debt.icon ?? c.linkedBills[0]?.icon ?? null;
}

function useMonthYear() {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  return (d: Date) => fmt.format(d);
}

function addMonths(n: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d;
}

// ── Header ────────────────────────────────────────────────────────────────────

export function DebtsHeader({ debtCount, monthly, advanceCount }: { debtCount: number; monthly: number; advanceCount: number }) {
  const t = useTranslations("plan.debts");
  const tPlan = useTranslations("plan");
  const parts = [t("count", { count: debtCount })];
  if (debtCount > 0) parts.push(t("minimums", { amount: formatEurWhole(monthly) }));
  if (advanceCount > 0) parts.push(t("toReceive", { count: advanceCount }));
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
            href="/debts/add"
            aria-label={t("add")}
            className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-surface-2 lg:hidden"
          >
            <IconPlus size={18} stroke={1.8} />
          </Link>
          <Link href="/debts/add" className={cn(GHOST, "hidden lg:inline-flex")}>
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

export function DebtsView({
  computed,
  computedOwed,
  bills,
  totalDebt,
  totalOwed,
  totalPaidPct,
  totalMonthly,
  advances,
}: {
  computed: ComputedDebt[];
  computedOwed: ComputedDebt[];
  bills: RecurringItem[];
  totalDebt: number;
  totalOwed: number;
  totalPaidPct: number;
  totalMonthly: number;
  advances: OpenAdvance[];
}) {
  const t = useTranslations("plan.debts");
  const isDesktop = useIsDesktop();
  const active = useMemo(() => computed.filter((c) => c.currentBalance > 0), [computed]);

  // Desktop: the debt shown in the detail card. Phones (and "Payment schedule" on
  // desktop): the debt open in the detail sheet. Both by id, so a refresh after an edit
  // flows straight through.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [extra, setExtra] = useState(100);

  const all = [...computed, ...computedOwed];
  const selected = computed.find((c) => c.debt.id === selectedId) ?? active[0] ?? computed[0] ?? null;
  const sheet = sheetId != null ? all.find((c) => c.debt.id === sheetId) ?? null : null;
  const editing = editId != null ? all.find((c) => c.debt.id === editId) ?? null : null;

  function openDebt(id: number) {
    if (isDesktop) setSelectedId(id);
    else setSheetId(id);
  }

  const simDebts = useMemo(
    () => active.map((c) => ({ id: c.debt.id, balance: c.currentBalance, payment: c.debt.minimumPayment, annualRate: c.debt.interestRate })),
    [active],
  );
  const base = useMemo(() => simulatePayoff(simDebts, 0), [simDebts]);
  const sim = useMemo(() => simulatePayoff(simDebts, extra), [simDebts, extra]);
  const hasOwed = computedOwed.some((c) => c.currentBalance > 0) || advances.length > 0;

  return (
    <>
      <PlanSwitch className="self-start" />

      <div className={SPLIT_GRID}>
        <div className="flex min-w-0 flex-col gap-5">
          {(computed.length > 0 || hasOwed) && (
            <div className={cn("grid gap-5", hasOwed && computed.length > 0 && "md:grid-cols-2")}>
              {computed.length > 0 && <YouOweCard active={active} totalDebt={totalDebt} totalPaidPct={totalPaidPct} totalMonthly={totalMonthly} />}
              {hasOwed && <OwedToYouCard owed={computedOwed} totalOwed={totalOwed} advances={advances} onOpen={setSheetId} />}
            </div>
          )}

          <section className="flex flex-col gap-3">
            <SectionHead title={t("yours")} link={t("add")} href="/debts/add" />
            {computed.length === 0 ? (
              <div className={cn(CARD, "flex flex-col items-center gap-4 px-6 py-10 text-center")}>
                <span className="inline-flex size-14 items-center justify-center rounded-full bg-mustard-soft text-mustard-strong">
                  <IconCreditCard size={26} stroke={1.8} />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h2 className="heading text-lg text-ink">{t("empty.title")}</h2>
                  <p className="max-w-xs text-[13px] leading-[1.45] text-ink-2">{t("empty.body")}</p>
                </div>
                <Link href="/debts/add" className={buttonVariants({ variant: "default", size: "lg" })}>
                  <IconPlus size={16} stroke={2} />
                  {t("add")}
                </Link>
              </div>
            ) : (
              <div className={cn(CARD, "px-4 py-1 lg:px-5 lg:py-1.5")}>
                {computed.map((c) => (
                  <DebtRow key={c.debt.id} c={c} selected={isDesktop && selected?.debt.id === c.debt.id} onOpen={() => openDebt(c.debt.id)} />
                ))}
              </div>
            )}
          </section>

          {isDesktop && selected && (
            <DebtDetailCard c={selected} onEdit={() => setEditId(selected.debt.id)} onSchedule={() => setSheetId(selected.debt.id)} />
          )}
        </div>

        {active.length > 0 && (
          <div className="flex min-w-0 flex-col gap-5">
            <PayoffCard base={base} sim={sim} extra={extra} />
            <SimulatorCard active={active} base={base} sim={sim} extra={extra} onExtra={setExtra} totalMonthly={totalMonthly} />
          </div>
        )}
      </div>

      <DebtDetailDialog computed={sheet} bills={bills} onClose={() => setSheetId(null)} />
      {editing && (
        <DebtEditDialog
          debt={editing.debt}
          bills={bills}
          currentRecurringIds={editing.linkedBillIds}
          open={editId != null}
          onOpenChange={(o) => { if (!o) setEditId(null); }}
        />
      )}

      <AnchoredTip id="debtsDetail" anchor="debtsDetail" active={isDesktop && selected != null} />
      <AnchoredTip id="debtsSimulator" anchor="debtsSimulator" active={active.length > 0} />
      <AnchoredTip id="debtsOwed" anchor="debtsOwed" active={hasOwed} />
    </>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function YouOweCard({ active, totalDebt, totalPaidPct, totalMonthly }: { active: ComputedDebt[]; totalDebt: number; totalPaidPct: number; totalMonthly: number }) {
  const t = useTranslations("plan.debts.owe");
  return (
    <section className={cn(CARD, "flex flex-col gap-3 p-[18px] lg:p-[22px]")}>
      <span className="text-[13px] font-semibold text-ink-2">{t("title")}</span>
      <span className="amount text-[44px] leading-none tracking-[-0.035em] text-ink lg:text-[50px]">{formatEurWhole(totalDebt)}</span>
      <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
        <Pill tone="positive" icon={<IconTrendingUp />}>
          {t("paidOff", { pct: totalPaidPct })}
        </Pill>
        {t("monthly", { amount: formatEurWhole(totalMonthly), count: active.length })}
      </span>
      {totalDebt > 0 && (
        <>
          <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
            {active.map((c) => (
              <span key={c.debt.id} className="h-full" style={{ flexBasis: `${(c.currentBalance / totalDebt) * 100}%`, background: debtColor(c) }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {active.map((c) => (
              <span key={c.debt.id} className="mono-label inline-flex items-center gap-1.5 text-[10px] text-ink-2">
                <span className="size-2 rounded-full" style={{ background: debtColor(c) }} />
                <span className="max-w-[140px] truncate">{c.debt.name}</span> {Math.round((c.currentBalance / totalDebt) * 100)}%
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function OwedToYouCard({
  owed,
  totalOwed,
  advances,
  onOpen,
}: {
  owed: ComputedDebt[];
  totalOwed: number;
  advances: OpenAdvance[];
  onOpen: (id: number) => void;
}) {
  const t = useTranslations("plan.debts.owed");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const openOwed = owed.filter((c) => c.currentBalance > 0);
  const total = totalOwed + advances.reduce((s, a) => s + a.remaining, 0);

  // Closing an advance: whatever hasn't come back by now isn't expected any more. The
  // expected amount drops to what was received, which is exactly what the old
  // "expected" editor would do by hand.
  async function settle(a: OpenAdvance) {
    if (!confirm(t("settleConfirm", { name: a.name, amount: formatEur(a.remaining) }))) return;
    setBusy(a.transactionId);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.transactionId, expectedReimbursement: a.received }),
    });
    setBusy(null);
    router.refresh();
  }

  const items = [
    ...openOwed.map((c) => ({ kind: "debt" as const, c })),
    ...advances.map((a) => ({ kind: "advance" as const, a })),
  ];

  return (
    <section data-tip-anchor="debtsOwed" className={cn(CARD, "flex flex-col gap-3 p-[18px] lg:p-[22px]")}>
      <span className="text-[13px] font-semibold text-ink-2">{t("title")}</span>
      <span className="amount text-[44px] leading-none tracking-[-0.035em] text-mustard-strong lg:text-[50px]">{formatEurWhole(total)}</span>
      <div className="flex flex-col">
        {items.slice(0, 3).map((item) =>
          item.kind === "debt" ? (
            <button
              key={`d${item.c.debt.id}`}
              type="button"
              onClick={() => onOpen(item.c.debt.id)}
              className="-mx-2 flex min-h-11 items-center gap-2.5 rounded-row px-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-semibold text-ink">{item.c.debt.name}</span>
                <span className="truncate text-xs text-ink-3">
                  {t("debtSub", { pct: Math.round(debtPaidPct(item.c.debt, item.c.amountPaid, item.c.currentBalance)) })}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{formatEurWhole(item.c.currentBalance)}</span>
            </button>
          ) : (
            <div key={`a${item.a.transactionId}`} className="flex min-h-11 items-center gap-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-semibold text-ink">{item.a.name}</span>
                <span className="truncate text-xs text-ink-3">
                  {t("advanceSub", {
                    date: day.format(new Date(`${item.a.date}T12:00:00`)),
                    received: formatEurWhole(item.a.received),
                    expected: formatEurWhole(item.a.expected),
                  })}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{formatEur(item.a.remaining)}</span>
              <button
                type="button"
                disabled={busy === item.a.transactionId}
                onClick={() => settle(item.a)}
                aria-label={t("settle")}
                title={t("settle")}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line text-ink-3 transition-colors hover:border-positive hover:text-positive disabled:opacity-50"
              >
                <IconCheck className="size-3.5" stroke={2.4} />
              </button>
            </div>
          ),
        )}
        {items.length > 3 && <span className="pt-1 text-xs text-ink-3">{t("more", { count: items.length - 3 })}</span>}
      </div>
    </section>
  );
}

// ── Debt rows ─────────────────────────────────────────────────────────────────

function DebtRow({ c, selected, onOpen }: { c: ComputedDebt; selected: boolean; onOpen: () => void }) {
  const t = useTranslations("plan.debts.row");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const pct = Math.round(debtPaidPct(c.debt, c.amountPaid, c.currentBalance));
  const done = c.currentBalance === 0;
  const color = done ? "var(--arca-positive)" : debtColor(c);
  const sub = done
    ? t("paidOffSub")
    : [
        t("perMonth", { amount: formatEurWhole(c.debt.minimumPayment) }),
        c.debt.interestRate ? `${c.debt.interestRate.toLocaleString(locale)}%` : null,
        c.neverPaysOff ? t("never") : c.lastPaymentDate ? t("freeBy", { date: monthYear(c.lastPaymentDate) }) : null,
      ]
        .filter(Boolean)
        .join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected || undefined}
      className={cn(
        "-mx-2 flex min-h-[62px] w-[calc(100%+1rem)] items-center gap-3.5 rounded-row px-2 text-left transition-colors hover:bg-surface-2",
        selected && "bg-surface-2",
      )}
    >
      <Ring pct={pct} color={color} size={46} stroke={4}>
        <CategoryIcon icon={debtIcon(c)} color={c.debt.color} size="sm" />
      </Ring>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-sm font-semibold text-ink">{c.debt.name}</span>
        <span className={cn("truncate text-xs", c.neverPaysOff ? "text-negative" : "text-ink-3")}>{sub}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="amount text-base tabular-nums text-ink">{formatEurWhole(c.currentBalance)}</span>
        <span className="text-[11px] font-bold text-positive">{done ? t("done") : t("paid", { pct })}</span>
      </span>
    </button>
  );
}

// ── Selected debt (desktop) ───────────────────────────────────────────────────

function DebtDetailCard({ c, onEdit, onSchedule }: { c: ComputedDebt; onEdit: () => void; onSchedule: () => void }) {
  const t = useTranslations("plan.debts.detail");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const { debt, currentBalance } = c;
  const pct = debtPaidPct(debt, c.amountPaid, currentBalance);
  const bill = c.linkedBills[0] ?? null;
  const rate = monthlyRate(debt.interestRate);
  const start = new Date(`${debt.startDate ?? `${debt.startMonth}-01`}T12:00:00`);
  const interestNow = Math.round(currentBalance * rate * 100) / 100;
  const principalNow = Math.max(0, Math.round((debt.minimumPayment - interestNow) * 100) / 100);

  const linkLine = bill
    ? bill.dueDay
      ? t("linkedOn", { name: bill.friendlyName ?? bill.name, amount: formatEur(bill.amount ?? 0), day: bill.dueDay })
      : t("linked", { name: bill.friendlyName ?? bill.name, amount: formatEur(bill.amount ?? 0) })
    : t("notLinked", { amount: formatEur(debt.minimumPayment) });

  let notice: { tone: "positive" | "negative" | "warning"; text: string } | null = null;
  if (currentBalance > 0) {
    if (debt.minimumPayment <= 0) notice = { tone: "warning", text: t("noPayment") };
    else if (c.neverPaysOff) notice = { tone: "negative", text: t("neverCovers", { payment: formatEur(debt.minimumPayment), interest: formatEur(interestNow) }) };
    else if (rate > 0) notice = { tone: "positive", text: t("covers", { payment: formatEur(debt.minimumPayment), interest: formatEur(interestNow), principal: formatEur(principalNow) }) };
    else notice = { tone: "positive", text: t("noInterest", { payment: formatEur(debt.minimumPayment) }) };
  }

  return (
    <section data-tip-anchor="debtsDetail" className={cn(CARD, "flex flex-col gap-4 p-[22px]")}>
      <div className="flex items-center gap-3.5">
        <CategoryIcon icon={debtIcon(c)} color={debt.color} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h2 className="heading truncate text-xl text-ink">{debt.name}</h2>
          <span className="line-clamp-2 text-[13px] text-ink-3">{linkLine}</span>
        </div>
        <span className="amount shrink-0 text-[26px] leading-none tracking-[-0.03em] text-ink">{formatEurWhole(currentBalance)}</span>
      </div>
      <Bar pct={pct} color={currentBalance === 0 ? "var(--arca-positive)" : debtColor(c)} height={8} />
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Stat label={t("started")} value={monthYear(start)} />
        <Stat label={t("original")} value={formatEurWhole(debtEffectiveTotal(debt))} />
        <Stat label={t("interest")} value={debt.interestRate ? t("perYear", { rate: debt.interestRate.toLocaleString(locale) }) : t("none")} />
        <Stat
          label={t("debtFree")}
          value={currentBalance === 0 ? t("done") : c.neverPaysOff || !c.lastPaymentDate ? "—" : monthYear(c.lastPaymentDate)}
          tone={currentBalance === 0 ? "positive" : "default"}
        />
      </div>
      {notice && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-tile px-3.5 py-3 text-[13px] font-semibold leading-[1.4]",
            notice.tone === "positive" ? "bg-positive-soft text-positive" : notice.tone === "negative" ? "bg-negative-soft text-negative" : "bg-warning-soft text-warning",
          )}
        >
          {notice.tone === "positive" ? <IconCheck size={16} className="mt-px shrink-0" /> : <IconAlertTriangle size={16} className="mt-px shrink-0" />}
          {notice.text}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className={GHOST}>
          <IconAdjustmentsHorizontal size={16} stroke={1.8} />
          {t("edit")}
        </button>
        <button type="button" onClick={onSchedule} className={GHOST}>
          <IconListDetails size={16} stroke={1.8} />
          {t("schedule")}
        </button>
      </div>
    </section>
  );
}

// ── Payoff timeline + simulator ───────────────────────────────────────────────

type Sim = ReturnType<typeof simulatePayoff>;

function PayoffCard({ base, sim, extra }: { base: Sim; sim: Sim; extra: number }) {
  const t = useTranslations("plan.debts.payoff");
  const monthYear = useMonthYear();
  // Long enough to show both lines ending, capped at 30 years so a never-ending
  // minimums line doesn't flatten everything else.
  const span = Math.max(1, Math.min(360, Math.max(base.totals.length, sim.totals.length) - 1));
  const w = 386;
  const h = 150;
  const pad = 4;
  const max = Math.max(1, base.totals[0]);
  const pts = (totals: number[]) =>
    totals.slice(0, span + 1).map((v, i) => [pad + (i / span) * (w - pad * 2), h - pad - (v / max) * (h - pad * 2)] as const);
  const basePts = pts(base.totals);
  const simPts = pts(sim.totals);
  const line = (p: readonly (readonly [number, number])[]) => p.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const end = simPts[simPts.length - 1];
  const showSim = extra > 0;

  return (
    <section className={cn(CARD, "flex flex-col gap-3 px-5 py-[18px]")}>
      <SectionHead title={t("title")} size="sm" />
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="block h-[110px] w-full lg:h-[150px]">
        <defs>
          <linearGradient id="debt-payoff-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--arca-accent)" stopOpacity="0.3" />
            <stop offset="1" stopColor="var(--arca-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line(simPts)} L${end[0].toFixed(1)} ${h} L${pad} ${h} Z`} fill="url(#debt-payoff-fill)" />
        {showSim && <path d={line(basePts)} fill="none" stroke="var(--arca-ink-3)" strokeWidth={2} strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />}
        <path d={line(simPts)} fill="none" stroke="var(--arca-ink)" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between gap-2">
        <span className="mono-label text-[10px]">{monthYear(new Date())}</span>
        {showSim && sim.months != null && (
          <span className="mono-label truncate text-[10px] text-mustard-strong">
            {t("withExtra", { amount: formatEurWhole(extra), date: monthYear(addMonths(sim.months)) })}
          </span>
        )}
        <span className="mono-label truncate text-[10px]">
          {base.months != null ? t("minimums", { date: monthYear(addMonths(base.months)) }) : t("minimumsNever")}
        </span>
      </div>
    </section>
  );
}

function SimulatorCard({
  active,
  base,
  sim,
  extra,
  onExtra,
  totalMonthly,
}: {
  active: ComputedDebt[];
  base: Sim;
  sim: Sim;
  extra: number;
  onExtra: (n: number) => void;
  totalMonthly: number;
}) {
  const t = useTranslations("plan.debts.simulator");
  const monthYear = useMonthYear();
  const max = Math.max(500, Math.ceil(totalMonthly / 100) * 100);
  const names = sim.order.map((id) => active.find((c) => c.debt.id === id)?.debt.name ?? "");
  const topRate = active.find((c) => c.debt.id === sim.order[0])?.debt.interestRate ?? 0;
  const sooner = base.months != null && sim.months != null ? base.months - sim.months : null;
  const saved = Math.max(0, Math.round((base.interest - sim.interest) * 100) / 100);

  return (
    <section data-tip-anchor="debtsSimulator" className={cn(CARD, "flex flex-col gap-3.5 p-[18px]")}>
      <SectionHead title={t("title")} size="sm" />
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="debt-extra" className="text-[13px] text-ink-2">
            {t("extra")}
          </label>
          <span className="amount text-[22px] leading-none text-mustard-strong">{formatEurWhole(extra)}</span>
        </div>
        <input
          id="debt-extra"
          type="range"
          min={0}
          max={max}
          step={10}
          value={extra}
          onChange={(e) => onExtra(Number(e.target.value))}
          className="w-full accent-[var(--arca-accent)]"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label={t("debtFree")} value={sim.months != null ? monthYear(addMonths(sim.months)) : "—"} />
        <Stat label={t("sooner")} value={sooner != null && sooner > 0 ? t("months", { count: sooner }) : "—"} tone={sooner ? "positive" : "default"} />
        <Stat label={t("saved")} value={formatEur(saved)} tone={saved > 0 ? "positive" : "default"} className="col-span-2 sm:col-span-1" />
      </div>
      <p className="flex items-start gap-1.5 text-xs leading-[1.45] text-ink-3">
        <IconInfoCircle size={14} className="mt-px shrink-0" />
        {names.length <= 1
          ? t("orderOne", { name: names[0] ?? "" })
          : t(topRate > 0 ? "orderRate" : "orderBalance", { first: names[0], rest: names.slice(1).join(", ") })}
      </p>
    </section>
  );
}
