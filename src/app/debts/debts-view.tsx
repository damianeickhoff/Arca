"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendarCheck,
  IconCalendarEvent,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCreditCard,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconCalendarDue,
  IconSchool,
  IconUsers,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatCompactEur, formatEur, formatEurWhole } from "@/lib/format";
import { simulatePayoff } from "@/lib/debt-simulate";
import type { OpenAdvance } from "@/lib/open-advances";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  parseDebtSort,
  sortDebts,
  type ComputedDebt,
  type DebtSort,
  type DebtsFreeToSpend,
} from "./debt-shared";
import { DebtDetailDialog } from "./debt-detail-dialog";
import { DebtFormDialog } from "./debt-form-dialog";
import { DebtIcon, PaymentNotice, monthsFromNow, pastel, useMonthYear, usePaymentNotice } from "./debt-ui";
import { MoneyText } from "@/components/clear/money";

/** What the add/edit form opens with — also what /debts?add=… and /debts?edit=… ask for. */
export type DebtFormRequest = { kind: "add"; direction: "owe" | "owed" } | { kind: "edit"; id: number };

const LINK_BUTTON = "cursor-pointer text-sm font-bold text-clear-ember-text hover:underline";

type Sim = ReturnType<typeof simulatePayoff>;

/** Whole months from this month to `date`'s month; 0 for this month or earlier. */
function monthsUntil(date: Date) {
  const now = new Date();
  return Math.max(0, (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth());
}

/**
 * Plan · Debts. One grid: three summary tiles (you owe, owed to you, debt-free) across
 * the top; your debts above the payoff timeline in a two-column-wide stack, beside the
 * extra-payment simulator and what others owe you. Every debt opens its detail sheet;
 * adding and editing happen in the debt form sheet. ?sort=… orders your debts and
 * decides which one the simulator's extra goes to first.
 */
export function DebtsView({
  computed,
  computedOwed,
  bills,
  totalDebt,
  totalOwed,
  totalMonthly,
  freeToSpend,
  advances,
  initialForm,
}: {
  computed: ComputedDebt[];
  computedOwed: ComputedDebt[];
  bills: RecurringItem[];
  totalDebt: number;
  totalOwed: number;
  totalMonthly: number;
  freeToSpend: DebtsFreeToSpend;
  advances: OpenAdvance[];
  initialForm: DebtFormRequest | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const sort = parseDebtSort(params.get("sort"));
  const sorted = useMemo(() => sortDebts(computed, sort), [computed, sort]);
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

  const all = [...computed, ...computedOwed];
  const sheet = sheetId != null ? all.find((c) => c.debt.id === sheetId) ?? null : null;
  const editing = form.kind === "edit" ? all.find((c) => c.debt.id === form.id) ?? null : null;
  const sortQuery = sort === "interest" ? "" : `?sort=${sort}`;

  function openForm(next: DebtFormRequest) {
    setForm(next);
    setFormOpen(true);
  }

  function formOpenChange(open: boolean) {
    setFormOpen(open);
    // Opened from /debts?add=… or ?edit=…: drop the parameter so a refresh doesn't
    // open the form again (the sort stays).
    if (!open && fromUrl) {
      setFromUrl(false);
      router.replace(`/debts${sortQuery}`, { scroll: false });
    }
  }

  // The sort lives in the URL so it survives a refresh; the native history API updates
  // it (and useSearchParams) without a server round trip.
  function chooseSort(next: DebtSort) {
    const query = new URLSearchParams(params.toString());
    if (next === "interest") query.delete("sort");
    else query.set("sort", next);
    const qs = query.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  const simDebts = useMemo(
    () => active.map((c) => ({ id: c.debt.id, balance: c.currentBalance, payment: c.debt.minimumPayment, annualRate: c.debt.interestRate })),
    [active],
  );
  // The extra goes to the debts in the order the list shows them.
  const order = useMemo(() => active.map((c) => c.debt.id), [active]);
  const base = useMemo(() => simulatePayoff(simDebts, 0, 600, order), [simDebts, order]);
  const sim = useMemo(() => simulatePayoff(simDebts, extra, 600, order), [simDebts, extra, order]);
  const hasRight = active.length > 0 || hasOwed;

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      <DebtsHeader active={active.length} monthly={totalMonthly} toReceive={openOwed.length + advances.length} empty={empty} onAdd={() => openForm({ kind: "add", direction: "owe" })} />

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
              totalMonthly={totalMonthly}
              hasOwn={computed.length > 0}
            />

            <div className={cn("flex min-w-0 flex-col gap-5 lg:col-span-2", !hasRight && "xl:col-span-3")}>
              <YourDebtsCard
                computed={sorted}
                sort={sort}
                onSort={chooseSort}
                onOpen={setSheetId}
                onEdit={(id) => openForm({ kind: "edit", id })}
                onAdd={() => openForm({ kind: "add", direction: "owe" })}
              />
              {active.length > 0 && <PayoffCard active={active} base={base} sim={sim} extra={extra} />}
            </div>

            {hasRight && (
              <div className="grid min-w-0 content-start gap-5 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:flex xl:flex-col">
                {active.length > 0 && (
                  <SimulatorCard
                    active={active}
                    sort={sort}
                    base={base}
                    sim={sim}
                    extra={extra}
                    onExtra={setExtra}
                    totalMonthly={totalMonthly}
                    freeToSpend={freeToSpend}
                    className={cn(!hasOwed && "xl:flex-1")}
                  />
                )}
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
          </>
        )}
      </div>

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
      <AnchoredTip id="debtsOwed" anchor="debtsOwed" active={hasOwed} />
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
}: {
  active: number;
  monthly: number;
  toReceive: number;
  empty: boolean;
  onAdd: () => void;
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
          <span className="hidden text-base text-clear-ink-2 lg:inline"><MoneyText>{empty ? t("subtitleNone") : parts.join(" · ")}</MoneyText></span>
        </div>
        <div className="flex items-center gap-2.5">
          {/* A cost paid in parts isn't a debt, but this is where people look for one. */}
          <AddRecurringButton type="plan" ariaLabel={t("addPlan")} className={cn(clearButtonVariants({ variant: "secondary", size: "icon" }), "size-12 lg:hidden")}>
            <IconCalendarDue aria-hidden />
          </AddRecurringButton>
          <AddRecurringButton type="plan" className={cn(clearButtonVariants({ variant: "secondary" }), "hidden lg:inline-flex")}>
            <IconCalendarDue aria-hidden />
            {t("addPlan")}
          </AddRecurringButton>
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
  totalMonthly,
  hasOwn,
}: {
  active: ComputedDebt[];
  totalDebt: number;
  owedTotal: number;
  owedCount: number;
  base: Sim;
  totalMonthly: number;
  hasOwn: boolean;
}) {
  const t = useTranslations("plan.debts.tiles");
  const monthYear = useMonthYear();
  const oweLine = useOweLine(active);
  const card = "gap-2.5 px-5 py-5 lg:px-6 lg:py-[22px]";
  const figure = "text-[30px] leading-none tracking-[-0.035em] lg:text-[40px]";
  const round = "inline-flex size-9 items-center justify-center rounded-full [&_svg]:size-[18px]";

  let free: { value: string; foot: string };
  if (!hasOwn) free = { value: "—", foot: t("free.none") };
  else if (active.length === 0) free = { value: t("free.now"), foot: t("free.allPaid") };
  else if (base.months == null) free = { value: "—", foot: t("free.never") };
  else free = { value: monthYear(monthsFromNow(base.months)), foot: t("free.atMinimums", { amount: formatEurWhole(totalMonthly) }) };

  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:col-span-2 xl:col-span-3">
      <ClearCard aria-labelledby="debts-owe-title" className={cn(card, "col-span-2 bg-clear-ember text-clear-ember-ink sm:col-span-1")}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="debts-owe-title" className="m-0 text-[15px] font-bold">{t("owe")}</h2>
          <span aria-hidden className={cn(round, "bg-clear-card/35")}>
            <IconArrowUpRight stroke={2.2} />
          </span>
        </div>
        <Amount value={totalDebt} whole splitCents={false} sign="none" className={figure} />
        <span className="line-clamp-2 text-[13px] font-semibold"><MoneyText>{oweLine}</MoneyText></span>
      </ClearCard>

      <ClearCard aria-labelledby="debts-owed-title" className={card}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="debts-owed-title" className="m-0 text-[15px] font-bold">{t("owed")}</h2>
          <span aria-hidden className={cn(round, "bg-clear-ground")}>
            <IconArrowDownRight stroke={2.2} />
          </span>
        </div>
        <Amount value={owedTotal} whole splitCents={false} sign="none" className={figure} />
        <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-clear-ink-2">
          {owedCount > 0 ? (
            t.rich("toReceive", {
              count: owedCount,
              n: (c) => <ClearChip tone="sky" className="h-6 px-2 text-xs">{c}</ClearChip>,
            })
          ) : (
            t("owedNone")
          )}
        </span>
      </ClearCard>

      <ClearCard aria-labelledby="debts-free-title" className={card}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="debts-free-title" className="m-0 text-[15px] font-bold">{t("free.title")}</h2>
          <span aria-hidden className={cn(round, "bg-clear-ground")}>
            <IconCalendarEvent stroke={2} />
          </span>
        </div>
        <span className={cn("clear-amount whitespace-nowrap", figure)}><MoneyText>{free.value}</MoneyText></span>
        <span className="text-[13px] font-semibold text-clear-ink-2"><MoneyText>{free.foot}</MoneyText></span>
      </ClearCard>
    </div>
  );
}

// ── Your debts ────────────────────────────────────────────────────────────────

/** The sort menu in the "Your debts" header — styled like Activity's. */
function DebtSortMenu({ sort, onSort }: { sort: DebtSort; onSort: (sort: DebtSort) => void }) {
  const t = useTranslations("plan.debts.sort");
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger aria-label={t("label", { order: t(`options.${sort}`) })} className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
        {t(`options.${sort}`)}
        <IconChevronDown aria-hidden stroke={2.2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-52 p-1.5">
        {DEBT_SORTS.map((o) => (
          <DropdownMenuItem key={o} onClick={() => onSort(o)} aria-checked={o === sort} className={o === sort ? "font-bold" : undefined}>
            {t(`options.${o}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function YourDebtsCard({
  computed,
  sort,
  onSort,
  onOpen,
  onEdit,
  onAdd,
}: {
  computed: ComputedDebt[];
  sort: DebtSort;
  onSort: (sort: DebtSort) => void;
  onOpen: (id: number) => void;
  onEdit: (id: number) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("plan.debts");
  const sortable = computed.length > 1;
  return (
    <ClearCard aria-labelledby="debts-yours-title">
      <ClearCardHeader
        title={<span id="debts-yours-title">{t("yours")}</span>}
        subtitle={
          computed.length === 0
            ? undefined
            : sortable
              ? t("yoursOrder", { count: computed.length, order: t(`sort.inline.${sort}`) })
              : t("yoursCount", { count: computed.length })
        }
        action={sortable ? <DebtSortMenu sort={sort} onSort={onSort} /> : undefined}
      />
      {computed.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-clear-tile bg-clear-tile p-5">
          <p className="m-0 text-[15px] leading-[1.45] text-clear-ink-2">{t("noneOfYourOwn")}</p>
          <button type="button" onClick={onAdd} className={clearButtonVariants()}>
            <IconPlus aria-hidden />
            {t("add")}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {computed.map((c, i) => (
            <DebtTile key={c.debt.id} c={c} anchor={i === 0} onOpen={() => onOpen(c.debt.id)} onEdit={() => onEdit(c.debt.id)} />
          ))}
        </div>
      )}
    </ClearCard>
  );
}

function DebtTile({ c, anchor, onOpen, onEdit }: { c: ComputedDebt; anchor: boolean; onOpen: () => void; onEdit: () => void }) {
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
  const status = done
    ? { tone: "mint" as const, text: t("done") }
    : c.neverPaysOff
      ? { tone: "rose" as const, text: t("never") }
      : c.lastPaymentDate
        ? { tone: "mint" as const, text: t("freeBy", { date: monthYear(c.lastPaymentDate) }) }
        : { tone: "neutral" as const, text: t("noDate") };
  const mini = "flex min-w-0 flex-col gap-0.5 rounded-clear-icon bg-clear-card px-3 py-2.5";

  return (
    <article
      data-tip-anchor={anchor ? "debtsDetail" : undefined}
      className="relative flex min-w-0 flex-col gap-3.5 rounded-clear-tile bg-clear-tile p-[18px] transition-shadow hover:ring-2 hover:ring-clear-ink/10"
    >
      <div className="flex items-center gap-3">
        <DebtIcon icon={debt.icon ?? bill?.icon} color={debt.color} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The name is the tile's one link: its hit area covers the whole tile. */}
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer truncate text-left text-base font-bold outline-none after:absolute after:inset-0 after:rounded-clear-tile focus-visible:after:ring-3 focus-visible:after:ring-clear-ember/50"
          >
            {debt.name}
          </button>
          <span className="truncate text-[13px] text-clear-muted">{meta}</span>
        </span>
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("edit", { name: debt.name })}
          className={cn(clearButtonVariants({ variant: "surface", size: "icon" }), "relative z-10 size-10")}
        >
          <IconPencil aria-hidden size={18} />
        </button>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <Amount value={currentBalance} whole splitCents={false} sign="none" className="text-[30px] leading-none tracking-[-0.03em]" />
          <span className="text-sm text-clear-ink-2"><MoneyText>{t("leftOf", { amount: formatEurWhole(total) })}</MoneyText></span>
        </span>
        <ClearChip tone={status.tone} icon={done ? <IconCheck stroke={3} aria-hidden /> : undefined}>
          {status.text}
        </ClearChip>
      </div>

      <div className="flex flex-col gap-1.5">
        <ClearProgress value={pct / 100} size="md" className="bg-clear-card" fillClassName={done ? "bg-clear-positive-fill" : "bg-clear-primary"} />
        <span className="flex flex-wrap justify-between gap-x-3 text-[13px] tabular-nums text-clear-ink-2">
          <span><MoneyText>{t.rich("paid", { pct, amount: formatEurWhole(paid), b: (ch) => <b className="text-clear-ink"><MoneyText>{ch}</MoneyText></b> })}</MoneyText></span>
          {!done && c.monthsRemaining != null && c.monthsRemaining > 0 && <span>{t("monthsLeft", { count: c.monthsRemaining })}</span>}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={mini}>
          <span className="text-xs text-clear-muted">{t("monthly")}</span>
          <span className="clear-amount text-base"><MoneyText>{formatEur(debt.minimumPayment)}</MoneyText></span>
        </div>
        <div className={mini}>
          <span className="text-xs text-clear-muted">{t("interest")}</span>
          <span className="clear-amount truncate text-base">
            {debt.interestRate ? t("perYear", { rate: debt.interestRate.toLocaleString(locale) }) : t("noInterest")}
          </span>
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
                    className="cursor-pointer truncate text-left text-base font-bold outline-none after:absolute after:inset-0 after:rounded-clear-tile focus-visible:after:ring-3 focus-visible:after:ring-clear-ember/50"
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
                    <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-sky text-[15px] font-extrabold text-clear-sky-ink">
                      {a.name.trim().charAt(0).toUpperCase()}
                    </span>
                  )
                }
                name={<span className="truncate text-base font-bold">{a.name}</span>}
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
        <Amount value={amount} sign="none" splitCents={false} className="text-lg" />
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

// ── Payoff timeline ───────────────────────────────────────────────────────────

/** A round step for the y-axis: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/** Band colours for debts without a colour of their own: the Clear pastels with their ink. */
const BAND_TOKENS = ["sky", "peach", "lilac", "mint", "butter", "rose", "stone"] as const;

function bandColor(color: string | null | undefined, index: number) {
  if (color) return { fill: `color-mix(in srgb, ${color} 34%, var(--clr-card))`, line: color };
  const token = BAND_TOKENS[index % BAND_TOKENS.length];
  return { fill: `var(--clr-${token})`, line: `var(--clr-${token}-ink)` };
}

/**
 * Every debt's balance month by month, stacked: the top edge is the total, each band one
 * debt, with a marker where it reaches zero. Follows the simulator — the extra goes to
 * the debts in the list's order — and, while there is an extra, a dashed line shows the
 * total at the minimums. Drawn in a stretchy SVG (non-scaling strokes) under HTML labels
 * and dots, so the chart can grow to fill its card; the summary is the aria-label.
 */
function PayoffCard({ active, base, sim, extra }: { active: ComputedDebt[]; base: Sim; sim: Sim; extra: number }) {
  const t = useTranslations("plan.debts.payoff");
  const monthYear = useMonthYear();
  const showBase = extra > 0;
  // Long enough to show everything ending, capped at 30 years so a never-ending debt
  // doesn't flatten everything else.
  const span = Math.max(1, Math.min(360, Math.max(sim.totals.length, showBase ? base.totals.length : 0) - 1));
  const start = sim.totals[0] ?? 0;
  const step = niceStep(start / 3);
  const top = Math.max(step, Math.ceil(start / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const x = (i: number) => (i / span) * 1000;
  const y = (v: number) => 1000 - (v / top) * 1000;
  const pct = (i: number) => `${(i / span) * 100}%`;
  const topPct = (v: number) => `${(1 - v / top) * 100}%`;
  const at = (series: number[], i: number) => series[Math.min(i, series.length - 1)] ?? 0;

  // Colours stay with the debt whatever the sort (assigned by id), and the bands stack
  // with the debt that lasts longest at the bottom — so each one ends on the top edge.
  const colourIndex = new Map([...active].sort((a, z) => a.debt.id - z.debt.id).map((c, i) => [c.debt.id, i]));
  const debtsById = new Map(active.map((c) => [c.debt.id, c]));
  const bands = sim.byDebt
    .filter((d) => debtsById.has(d.id))
    .sort((a, z) => (z.months ?? Infinity) - (a.months ?? Infinity) || a.id - z.id)
    .map((d) => ({ ...d, debt: debtsById.get(d.id)!.debt, colour: bandColor(debtsById.get(d.id)!.debt.color, colourIndex.get(d.id) ?? 0) }));

  const lower = new Array<number>(span + 1).fill(0);
  const shapes = bands.map((b) => {
    const end = Math.min(span, b.months ?? span);
    const bottom = lower.slice(0, end + 1);
    const upper = bottom.map((v, i) => v + at(b.balances, i));
    for (let i = 0; i <= end; i++) lower[i] = upper[i];
    const edge = upper.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const back = bottom.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse();
    return { ...b, area: [...edge, ...back].join(" "), edge: edge.join(" "), zeroAt: b.months != null && b.months <= span ? { i: b.months, v: bottom[b.months] ?? 0 } : null };
  });
  const baseLine = base.totals.slice(0, span + 1).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  // Year starts inside the span, thinned to at most seven labels.
  const now = new Date();
  const years: { label: number; at: number }[] = [];
  for (let yr = now.getFullYear() + 1; ; yr++) {
    const a = (yr - now.getFullYear()) * 12 - now.getMonth();
    if (a > span) break;
    years.push({ label: yr, at: a });
  }
  const every = Math.max(1, Math.ceil(years.length / 7));
  const yearLabels = years.filter((_, i) => i % every === 0);

  const sooner = showBase && base.months != null && sim.months != null ? base.months - sim.months : 0;
  const debtFree = sim.months != null ? t("debtFree", { date: monthYear(monthsFromNow(sim.months)) }) : t("debtFreeNever");
  const subtitle = sooner > 0 ? t("sooner", { count: sooner, amount: formatEurWhole(extra) }) : t("subtitle", { count: active.length });
  const summary = [
    t("summary", { amount: formatEurWhole(start), end: debtFree }),
    ...(sooner > 0 ? [subtitle] : []),
    ...[...bands]
      .reverse()
      .map((b) => (b.months != null ? t("summaryDebt", { name: b.debt.name, date: monthYear(monthsFromNow(b.months)) }) : t("summaryDebtNever", { name: b.debt.name }))),
  ].join(". ");

  const legend = "inline-flex h-[30px] max-w-full items-center gap-2 rounded-full bg-clear-tile px-3";

  return (
    <ClearCard aria-labelledby="debts-payoff-title" className="flex-1 gap-3.5">
      <ClearCardHeader
        title={<span id="debts-payoff-title">{t("title")}</span>}
        subtitle={<MoneyText>{subtitle}</MoneyText>}
        action={
          <ClearChip tone={sim.months != null ? "mint" : "rose"} icon={sim.months != null ? <IconCalendarCheck stroke={2.2} aria-hidden /> : undefined}>
            {debtFree}
          </ClearChip>
        }
      />

      <div role="img" aria-label={summary} className="relative flex min-h-[220px] flex-1 pb-7 pl-12 text-xs text-clear-muted">
        <div aria-hidden className="relative flex-1">
          {/* y-axis labels */}
          {ticks.map((v) => (
            <span key={v} className="absolute -left-12 w-10 -translate-y-1/2 text-right tabular-nums" style={{ top: topPct(v) }}>
              <MoneyText>{v === 0 ? formatEurWhole(0) : formatCompactEur(v)}</MoneyText>
            </span>
          ))}
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            {ticks.map((v) => (
              <line
                key={v}
                x1={0}
                x2={1000}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--clr-line)"
                strokeDasharray={v === 0 ? undefined : "3 4"}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {shapes.map((s) => (
              <polygon key={`a${s.id}`} points={s.area} style={{ fill: s.colour.fill }} />
            ))}
            {shapes.map((s) => (
              <polyline
                key={`l${s.id}`}
                points={s.edge}
                fill="none"
                stroke={s.colour.line}
                strokeWidth={2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {showBase && (
              <polyline points={baseLine} fill="none" stroke="var(--clr-ink-2)" strokeWidth={2} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            )}
            {sim.months != null && sim.months <= span && (
              <line x1={x(sim.months)} x2={x(sim.months)} y1={1000} y2={60} stroke="var(--clr-placeholder)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          {/* Today */}
          <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-clear-ink" style={{ left: 0, top: topPct(start) }} />
          <span className="absolute left-2 font-bold whitespace-nowrap text-clear-ink" style={{ top: `calc(${topPct(start)} - 22px)` }}>
            <MoneyText>{t("today", { amount: formatEurWhole(start) })}</MoneyText>
          </span>

          {/* Where each debt reaches zero */}
          {shapes.map((s) =>
            s.zeroAt && s.zeroAt.i > 0 ? (
              <span
                key={`z${s.id}`}
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] bg-clear-card"
                style={{ left: pct(s.zeroAt.i), top: topPct(s.zeroAt.v), borderColor: s.colour.line }}
              />
            ) : null,
          )}

          {/* Debt-free */}
          {sim.months != null && sim.months <= span && (
            <span className="absolute bottom-0 size-3.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-clear-card bg-clear-ember" style={{ left: pct(sim.months) }} />
          )}

          {/* x-axis: year starts */}
          {yearLabels.map((yl) => (
            <span key={yl.label} className="absolute -bottom-7 -translate-x-1/2 tabular-nums" style={{ left: pct(yl.at) }}>
              {yl.label}
            </span>
          ))}
        </div>
      </div>

      <ul aria-hidden className="m-0 flex list-none flex-wrap gap-2 p-0 text-[13px] font-bold">
        {[...bands].reverse().map((b) => (
          <li key={b.id} className={legend}>
            <span className="size-3 shrink-0 rounded-full border-2" style={{ background: b.colour.fill, borderColor: b.colour.line }} />
            <span className="truncate">
              {b.months != null ? t("paidOff", { name: b.debt.name, date: monthYear(monthsFromNow(b.months)) }) : t("paidOffNever", { name: b.debt.name })}
            </span>
          </li>
        ))}
        {showBase && (
          <li className={legend}>
            <span className="h-0 w-4 shrink-0 border-t-2 border-dashed border-clear-ink-2" />
            {base.months != null ? t("atMinimums", { date: monthYear(monthsFromNow(base.months)) }) : t("atMinimumsNever")}
          </li>
        )}
      </ul>
    </ClearCard>
  );
}

// ── Simulator ─────────────────────────────────────────────────────────────────

function SimulatorCard({
  active,
  sort,
  base,
  sim,
  extra,
  onExtra,
  totalMonthly,
  freeToSpend,
  className,
}: {
  active: ComputedDebt[];
  sort: DebtSort;
  base: Sim;
  sim: Sim;
  extra: number;
  onExtra: (n: number) => void;
  totalMonthly: number;
  freeToSpend: DebtsFreeToSpend;
  className?: string;
}) {
  const t = useTranslations("plan.debts.simulator");
  const tSort = useTranslations("plan.debts.sort");
  const monthYear = useMonthYear();
  const max = Math.max(500, Math.ceil(totalMonthly / 100) * 100);
  const names = sim.order.map((id) => active.find((c) => c.debt.id === id)?.debt.name ?? "");
  const sooner = base.months != null && sim.months != null ? base.months - sim.months : null;
  const saved = Math.max(0, Math.round((base.interest - sim.interest) * 100) / 100);
  const fill = `calc(13px + (100% - 26px) * ${extra / max})`;
  const stat = "flex min-w-0 flex-col gap-1 rounded-clear-tile p-3.5";

  return (
    <ClearCard data-tip-anchor="debtsSimulator" aria-labelledby="debts-sim-title" className={className}>
      <ClearCardHeader title={<span id="debts-sim-title">{t("title")}</span>} subtitle={<MoneyText>{t("subtitle", { amount: formatEurWhole(totalMonthly) })}</MoneyText>} />

      <div className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="debt-extra" className="text-[13px] font-bold text-clear-ink-2">
            {t("extra")}
          </label>
          <Amount value={extra} whole splitCents={false} sign="none" className="text-[28px] leading-none tracking-[-0.03em]" />
        </div>
        <div className="relative flex h-7 items-center">
          <span aria-hidden className="clear-hatch absolute inset-x-0 h-2.5 rounded-full" />
          <span aria-hidden className="absolute left-0 h-2.5 rounded-full bg-clear-ember" style={{ width: fill }} />
          <input
            id="debt-extra"
            type="range"
            min={0}
            max={max}
            step={10}
            value={extra}
            onChange={(e) => onExtra(Number(e.target.value))}
            aria-valuetext={t("valueText", { amount: formatEurWhole(extra) })}
            className="peer absolute inset-0 m-0 h-7 w-full cursor-pointer opacity-0"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute size-[26px] -translate-x-1/2 rounded-full border-4 border-clear-card bg-clear-primary shadow-clear-float peer-focus-visible:ring-3 peer-focus-visible:ring-clear-ember/50"
            style={{ left: `calc(13px + (100% - 26px) * ${extra / max})` }}
          />
        </div>
        <div aria-hidden className="flex justify-between text-xs tabular-nums text-clear-muted">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <span key={f}><MoneyText>{formatEurWhole(Math.round(max * f))}</MoneyText></span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className={cn(stat, "bg-clear-ember text-clear-ember-ink")}>
          <span className="text-xs font-semibold">{t("debtFree")}</span>
          <span className="clear-amount truncate text-lg">{sim.months != null ? monthYear(monthsFromNow(sim.months)) : "—"}</span>
        </div>
        <div className={cn(stat, "bg-clear-mint")}>
          <span className="text-xs font-semibold text-clear-mint-ink">{t("sooner")}</span>
          <span className="clear-amount truncate text-lg">{sooner != null && sooner > 0 ? t("months", { count: sooner }) : "—"}</span>
        </div>
        <div className={cn(stat, "col-span-2 bg-clear-tile sm:col-span-1")}>
          <span className="text-xs font-semibold text-clear-ink-2">{t("saved")}</span>
          <span className="clear-amount truncate text-lg"><MoneyText>{formatEur(saved)}</MoneyText></span>
        </div>
      </div>

      <FreeToSpendTile freeToSpend={freeToSpend} extra={extra} />

      <p className="m-0 mt-auto flex gap-2 text-[13px] leading-[1.45] text-clear-ink-2">
        <IconInfoCircle aria-hidden size={16} stroke={2} className="mt-px shrink-0" />
        <span>
          {names.length <= 1
            ? t("orderOne", { name: names[0] ?? "" })
            : t("orderSort", { first: names[0], rest: names.slice(1).join(", "), order: tSort(`inline.${sort}`) })}
        </span>
      </p>
    </ClearCard>
  );
}

/**
 * What the extra does to the month: free to spend now (recurring income minus bills,
 * debt payments, savings and the budget — computed on the server) and after the extra,
 * with a warning when the extra is more than there is.
 */
function FreeToSpendTile({ freeToSpend, extra }: { freeToSpend: DebtsFreeToSpend; extra: number }) {
  const t = useTranslations("plan.debts.simulator.free");
  const box = "flex min-w-0 flex-col gap-1.5 rounded-clear-tile bg-clear-tile p-3.5";

  if (freeToSpend.income <= 0) {
    return (
      <div data-tip-anchor="debtsSortAndImpact" className={box}>
        <span className="text-xs font-semibold text-clear-ink-2">{t("title")}</span>
        <span className="text-[13px] leading-[1.45] text-clear-ink-2">{t("noIncome")}</span>
      </div>
    );
  }

  const now = Math.round(freeToSpend.free);
  const after = Math.round(freeToSpend.free - extra);
  const short = after < 0 ? -after : 0;

  return (
    <div data-tip-anchor="debtsSortAndImpact" className={box}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-clear-ink-2">{t("title")}</span>
        {short > 0 && (
          <ClearChip tone="ember" icon={<IconAlertTriangle stroke={2.2} aria-hidden />} className="h-7 px-2.5 text-xs">
            <MoneyText>{t("short", { amount: formatEurWhole(short) })}</MoneyText>
          </ClearChip>
        )}
      </div>
      {extra > 0 && <span className="sr-only"><MoneyText>{t("change", { from: formatEurWhole(now), to: formatEurWhole(after) })}</MoneyText></span>}
      <span aria-hidden={extra > 0 || undefined} className="flex flex-wrap items-baseline gap-x-2 text-lg">
        <Amount value={now} whole splitCents={false} className={cn(extra > 0 && "text-clear-ink-2")} />
        {extra > 0 && (
          <>
            <span className="text-clear-muted">→</span>
            <Amount value={after} whole splitCents={false} className={cn(short > 0 && "text-clear-ember-text")} />
          </>
        )}
      </span>
      <span className="text-xs text-clear-muted">{t("basis")}</span>
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
        <h2 id="debts-empty-title" className="m-0 text-2xl font-extrabold tracking-[-0.02em]">{t("title")}</h2>
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
              <span className="text-[15px] font-bold">{t(`${k.key}.title`)}</span>
              <span className="text-[13px] leading-[1.45] text-clear-muted">{t(`${k.key}.body`)}</span>
            </span>
            <IconChevronRight aria-hidden size={18} stroke={2.2} className="mt-3 shrink-0 text-clear-muted" />
          </button>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 rounded-clear-tile bg-clear-tile px-4 py-3.5">
        <span className="text-sm font-bold">{t("total")}</span>
        <Amount value={0} sign="none" className="text-lg text-clear-placeholder" />
      </div>
    </ClearCard>
  );
}
