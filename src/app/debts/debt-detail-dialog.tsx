"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconCalendarCheck, IconChevronRight, IconNote, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEur, formatEurWhole } from "@/lib/format";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogFooterDock, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { Amount } from "@/components/clear/amount";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { Icon } from "@/components/icon";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { RecurringDetailDialog } from "@/components/settings/recurring/recurring-detail-dialog";
import type { Category, RecurringItem } from "@/db/schema";
import {
  computeDebtPayoffSchedule,
  debtBalanceDate,
  debtEffectivePaid,
  debtEffectiveTotal,
  debtPaidPct,
  type ComputedDebt,
} from "./debt-shared";
import { DebtFormDialog } from "./debt-form-dialog";
import { DebtIcon, PaymentNotice, pastel, useMonthYear, usePaymentNotice } from "./debt-ui";
import { MoneyText } from "@/components/clear/money";

/**
 * One debt in full (Popup-DebtDetail): what is left and when it is gone, the figures,
 * what each payment does, the details, linked bills and note, and every payment still
 * to come. Edit opens the debt form stacked on top, so closing it returns here. Phones
 * get a shorter sheet (R2-Phone-DebtDetail): the balance, the payoff chip and progress,
 * four label/value rows, the interest sentence, and Edit beside Log a payment.
 */
export function DebtDetailDialog({
  computed,
  bills,
  onClose,
  onLogPayment,
}: {
  computed: ComputedDebt | null;
  bills: RecurringItem[];
  onClose: () => void;
  /** Phones: "Log a payment" on this debt; left out when there is nothing to log on. */
  onLogPayment?: (id: number) => void;
}) {
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const t = useTranslations("plan.debts.sheet");
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Keep showing the last debt while the sheet animates closed — the caller nulls
  // `computed` the instant it starts closing, and unmounting the body then would
  // collapse the sheet before its slide-down finishes.
  const [cached, setCached] = useState(computed);
  if (computed && computed !== cached) setCached(computed);
  const shown = computed ?? cached;

  async function remove() {
    if (!shown) return;
    const ok = await confirm({
      title: t("confirmDelete", { name: shown.debt.name }),
      body: t("confirmDeleteBody"),
      confirmLabel: t("confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    await fetch("/api/debts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shown.debt.id }),
    });
    setBusy(false);
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={computed != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideHeaderRow title={shown?.debt.name ?? t("title")} className={isDesktop ? "gap-4 pt-6" : "gap-4 pt-4"}>
        {shown && !isDesktop && (
          <>
            <PhoneBody computed={shown} onClose={onClose} />
            <ClearDialogFooterDock className="pb-1">
              <div className="flex gap-2.5">
                <button type="button" onClick={() => setEditOpen(true)} className={cn(clearButtonVariants({ variant: "secondary", size: "lg" }), "flex-1")}>
                  <IconPencil aria-hidden />
                  {t("phone.edit")}
                </button>
                {onLogPayment && shown.debt.direction !== "owed" && shown.currentBalance > 0 && (
                  <button type="button" onClick={() => onLogPayment(shown.debt.id)} className={cn(clearButtonVariants({ size: "lg" }), "flex-[2]")}>
                    {t("phone.logPayment")}
                  </button>
                )}
              </div>
            </ClearDialogFooterDock>
          </>
        )}
        {shown && isDesktop && (
          <>
            <DetailBody computed={shown} onClose={onClose} />
            <ClearDialogFooterDock className="pb-1">
              <ClearDialogFooter
                destructive={
                  <button type="button" onClick={remove} disabled={busy} className={clearButtonVariants({ variant: "danger" })}>
                    <IconTrash aria-hidden />
                    {t("delete")}
                  </button>
                }
              >
                <button type="button" onClick={() => setEditOpen(true)} className={clearButtonVariants()}>
                  <IconPencil aria-hidden />
                  {t("edit")}
                </button>
              </ClearDialogFooter>
            </ClearDialogFooterDock>
          </>
        )}
        {shown && (
          /* Stacked inside this sheet, so closing the form comes back here. */
          <DebtFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            bills={bills}
            debt={shown.debt}
            currentRecurringIds={shown.linkedBillIds}
            onDeleted={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The phone sheet's body: header, balance and payoff chip, progress, four rows and the interest sentence. */
function PhoneBody({ computed, onClose }: { computed: ComputedDebt; onClose: () => void }) {
  const t = useTranslations("plan.debts.sheet");
  const tTile = useTranslations("plan.debts.tile");
  const tClose = useTranslations("debtForm");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const notice = usePaymentNotice();
  const { debt, linkedBills, amountPaid, currentBalance, lastPaymentDate, neverPaysOff, monthsRemaining } = computed;
  const owed = debt.direction === "owed";
  const done = currentBalance === 0;
  const pct = Math.round(debtPaidPct(debt, amountPaid, currentBalance));
  const total = debtEffectiveTotal(debt);
  const paid = debtEffectivePaid(debt, amountPaid, currentBalance);
  const rate = debt.interestRate ?? 0;
  const bill = linkedBills[0] ?? null;
  const billName = bill ? (bill.friendlyName ?? bill.name) : null;

  const status = done
    ? { tone: "mint" as const, text: owed ? t("settled") : t("paidOff") }
    : neverPaysOff
      ? { tone: "rose" as const, text: t("never") }
      : lastPaymentDate
        ? { tone: "mint" as const, text: owed ? t("backBy", { date: monthYear(lastPaymentDate) }) : tTile("payoffIn", { date: monthYear(lastPaymentDate) }) }
        : { tone: "neutral" as const, text: t("noDate") };

  const rows = [
    { label: t("phone.eachMonth"), value: formatEur(debt.minimumPayment) },
    { label: t("phone.interest"), value: rate > 0 ? t("perYear", { rate: rate.toLocaleString(locale) }) : t("noInterest") },
    { label: t("phone.monthsLeft"), value: !done && monthsRemaining != null && monthsRemaining > 0 ? String(monthsRemaining) : "—" },
    {
      label: t("phone.linkedBill"),
      value: bill ? (bill.dueDay ? t("phone.billOnDay", { name: billName!, day: bill.dueDay }) : billName!) : t("phone.notLinked"),
    },
  ];

  return (
    <>
      <div className="flex items-center gap-3">
        <DebtIcon icon={debt.icon ?? bill?.icon} color={debt.color} owed={owed} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 truncate text-lg font-extrabold">{debt.name}</h2>
          <span className="truncate text-[13px] text-clear-ink-2">
            {bill ? (bill.dueDay ? tTile("paidByOn", { name: billName!, day: bill.dueDay }) : tTile("paidBy", { name: billName! })) : tTile("notLinked")}
          </span>
        </span>
        <button type="button" onClick={onClose} aria-label={tClose("close")} className={cn(clearButtonVariants({ variant: "secondary", size: "icon" }), "size-10")}>
          <IconX aria-hidden size={18} stroke={2.2} />
        </button>
      </div>

      <div className="flex items-end justify-between gap-2.5">
        <span className="flex min-w-0 flex-col gap-1">
          <Amount value={currentBalance} whole splitCents={false} sign="none" className="text-[36px] leading-none tracking-[-0.03em]" />
          <span className="text-sm text-clear-ink-2"><MoneyText>{tTile("leftOf", { amount: formatEurWhole(total) })}</MoneyText></span>
        </span>
        <ClearChip tone={status.tone}>{status.text}</ClearChip>
      </div>

      <div className="flex flex-col gap-1.5">
        <ClearProgress value={pct / 100} size="md" fillClassName={done || owed ? "bg-clear-positive-fill" : "bg-clear-primary"} />
        <span className="text-sm text-clear-ink-2">
          <MoneyText>
            {t.rich(owed ? "phone.pctReceived" : "phone.pctPaidOff", { pct, amount: formatEurWhole(paid), b: (ch) => <b className="font-bold text-clear-ink">{ch}</b> })}
          </MoneyText>
        </span>
      </div>

      <dl aria-label={t("details")} className="m-0 flex flex-col rounded-clear-tile bg-clear-tile px-3.5 py-0.5">
        {rows.map((r, i) => (
          <div key={r.label} className={cn("flex min-h-[46px] items-center justify-between gap-3", i > 0 && "border-t border-clear-line")}>
            <dt className="text-sm text-clear-ink-2">{r.label}</dt>
            <dd className="m-0 truncate text-right text-[15px] font-extrabold tabular-nums"><MoneyText>{r.value}</MoneyText></dd>
          </div>
        ))}
      </dl>

      <PaymentNotice variant="line" notice={notice({ balance: currentBalance, payment: debt.minimumPayment, rate: debt.interestRate, owed })} className="text-sm" />
    </>
  );
}

function DetailBody({ computed, onClose }: { computed: ComputedDebt; onClose: () => void }) {
  const t = useTranslations("plan.debts.sheet");
  const tClose = useTranslations("debtForm");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const notice = usePaymentNotice();
  const longDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const day = (date: string) => longDate.format(new Date(`${date}T12:00:00`));
  const { debt, linkedBills, amountPaid, currentBalance, lastPaymentDate, neverPaysOff, remainingInterest, lastRecordedMonth } = computed;
  const owed = debt.direction === "owed";
  const done = currentBalance === 0;
  const pct = Math.round(debtPaidPct(debt, amountPaid, currentBalance));
  const total = debtEffectiveTotal(debt);
  const paid = debtEffectivePaid(debt, amountPaid, currentBalance);
  const schedule = computeDebtPayoffSchedule(debt, currentBalance, lastRecordedMonth);
  const scheduleTotal = schedule.reduce((s, e) => s + e.amount, 0);
  const startDate = debt.startDate ?? `${debt.startMonth}-01`;
  const balanceDate = debtBalanceDate(debt);
  const rate = debt.interestRate ?? 0;

  // Categories power the recurring-bill detail sheet opened from a linked bill.
  const [cats, setCats] = useState<Category[]>([]);
  const [billId, setBillId] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((c) => setCats(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);
  const bill = billId != null ? linkedBills.find((b) => b.id === billId) ?? null : null;

  const status = done
    ? { tone: "mint" as const, text: owed ? t("settled") : t("paidOff") }
    : neverPaysOff
      ? { tone: "rose" as const, text: t("never") }
      : lastPaymentDate
        ? { tone: "mint" as const, text: owed ? t("backBy", { date: monthYear(lastPaymentDate) }) : t("freeBy", { date: monthYear(lastPaymentDate) }) }
        : { tone: "neutral" as const, text: t("noDate") };

  const details: { label: string; value: string }[] = [
    { label: t("minimum"), value: formatEur(debt.minimumPayment) },
    { label: t("rate"), value: rate > 0 ? t("perYear", { rate: rate.toLocaleString(locale) }) : t("noInterest") },
    { label: t("startDate"), value: day(startDate) },
    // Only worth a row when it differs from the start date — the figures key off it.
    ...(balanceDate !== startDate ? [{ label: t("balanceAsOf"), value: day(balanceDate) }] : []),
    ...(lastPaymentDate && !done ? [{ label: t("lastPayment"), value: longDate.format(lastPaymentDate) }] : []),
  ];

  const tile = "flex min-w-0 flex-col gap-1 rounded-clear-tile px-3.5 py-3";

  return (
    <>
      <ClearDialogHeader
        title={debt.name}
        subtitle={[owed ? t("owed") : t("owe"), rate > 0 ? t("perYear", { rate: rate.toLocaleString(locale) }) : null].filter(Boolean).join(" · ")}
        icon={<DebtIcon icon={debt.icon ?? linkedBills[0]?.icon} color={debt.color} owed={owed} size="xl" />}
        onClose={onClose}
        closeLabel={tClose("close")}
      />

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2.5">
          <span className="flex items-baseline gap-2.5">
            <Amount value={currentBalance} sign="none" className="text-[36px] sm:text-[42px]" />
            <span className="text-base font-semibold text-clear-ink-2">{t("remaining")}</span>
          </span>
          <ClearChip tone={status.tone} icon={status.tone === "mint" ? <IconCalendarCheck stroke={2.2} aria-hidden /> : undefined}>
            {status.text}
          </ClearChip>
        </div>
        <ClearProgress value={pct / 100} hatchRemainder size="md" fillClassName={done || owed ? "bg-clear-positive-fill" : "bg-clear-ember"} />
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px] tabular-nums text-clear-ink-2">
          <span>
            <b className="font-extrabold text-clear-ink">{owed ? t("pctReceived", { pct }) : t("pctPaid", { pct })}</b>
            {" · "}
            <MoneyText>{t("ofTotal", { paid: formatEur(paid), total: formatEur(total) })}</MoneyText>
          </span>
          {schedule.length > 0 && <span>{t("paymentsLeft", { count: schedule.length })}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className={cn(tile, "bg-clear-tile")}>
          <span className="text-xs font-semibold text-clear-muted">{t("original")}</span>
          <span className="clear-amount truncate text-lg"><MoneyText>{formatEur(total)}</MoneyText></span>
        </div>
        <div className={cn(tile, "bg-clear-tile")}>
          <span className="text-xs font-semibold text-clear-muted">{owed ? t("alreadyReceived") : t("alreadyPaid")}</span>
          <span className="clear-amount truncate text-lg"><MoneyText>{formatEur(paid)}</MoneyText></span>
        </div>
        {remainingInterest > 0 ? (
          <div className={cn(tile, "col-span-2 bg-clear-peach sm:col-span-1")}>
            <span className="text-xs font-semibold text-clear-peach-ink">{owed ? t("interestToReceive") : t("interestToPay")}</span>
            <span className="clear-amount truncate text-lg"><MoneyText>{formatEur(remainingInterest)}</MoneyText></span>
          </div>
        ) : (
          <div className={cn(tile, "col-span-2 bg-clear-tile sm:col-span-1")}>
            <span className="text-xs font-semibold text-clear-muted">{t("monthly")}</span>
            <span className="clear-amount truncate text-lg"><MoneyText>{formatEur(debt.minimumPayment)}</MoneyText></span>
          </div>
        )}
      </div>

      <PaymentNotice notice={notice({ balance: currentBalance, payment: debt.minimumPayment, rate: debt.interestRate, owed })} />

      <dl aria-label={t("details")} className="m-0 grid border-t border-clear-ground sm:grid-cols-2 sm:gap-x-6">
        {details.map((d) => (
          <div key={d.label} className="flex min-h-9 items-center justify-between gap-2.5 border-b border-clear-ground py-1.5">
            <dt className="text-[13px] text-clear-muted">{d.label}</dt>
            <dd className="m-0 text-right text-sm font-bold tabular-nums"><MoneyText>{d.value}</MoneyText></dd>
          </div>
        ))}
      </dl>

      {(linkedBills.length > 0 || debt.notes) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {linkedBills.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-clear-ink-2">{t("linkedBills")}</span>
              {linkedBills.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBillId(b.id)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-clear-tile bg-clear-tile px-3 py-2.5 text-left transition-colors hover:bg-clear-line"
                >
                  <span aria-hidden className="inline-flex shrink-0">
                    <Icon iconKey={b.icon} color={b.iconColor} background={pastel(b.iconColor)} size="sm" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-sm font-bold">{b.friendlyName ?? b.name}</span>
                    {b.amount != null && (
                      <span className="truncate text-[13px] tabular-nums text-clear-muted">
                        <MoneyText>{b.dueDay ? t("billOn", { amount: formatEur(b.amount), day: b.dueDay }) : formatEur(b.amount)}</MoneyText>
                      </span>
                    )}
                  </span>
                  <IconChevronRight aria-hidden size={18} stroke={2.2} className="shrink-0 text-clear-muted" />
                </button>
              ))}
            </div>
          )}
          {debt.notes && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-clear-ink-2">{t("notes")}</span>
              <p className="m-0 flex flex-1 items-start gap-2.5 rounded-clear-tile bg-clear-tile px-3.5 py-2.5 text-sm leading-[1.4] font-semibold">
                <IconNote aria-hidden size={18} stroke={2} className="mt-px shrink-0 text-clear-muted" />
                <span className="min-w-0 break-words">{debt.notes}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {schedule.length > 0 && (
        <section aria-labelledby="debt-schedule-title" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="debt-schedule-title" className="m-0 text-base font-bold">{t("upcoming", { count: schedule.length })}</h3>
            <span className="text-[13px] tabular-nums text-clear-muted"><MoneyText>{t("inTotal", { amount: formatEur(scheduleTotal) })}</MoneyText></span>
          </div>
          {/* Scrolls within itself: a long loan is hundreds of rows. */}
          <div className="clear-scrollbar max-h-80 overflow-auto overscroll-contain">
            <table className="w-full border-separate border-spacing-0 tabular-nums">
              <thead className="sticky top-0">
                <tr>
                  <th scope="col" className="h-[34px] rounded-l-clear-row bg-clear-tile px-3 text-left text-xs font-bold text-clear-ink-2">{t("colDate")}</th>
                  <th scope="col" className="h-[34px] bg-clear-tile px-3 text-right text-xs font-bold text-clear-ink-2">{t("colPayment")}</th>
                  <th scope="col" className="h-[34px] rounded-r-clear-row bg-clear-tile px-3 text-right text-xs font-bold text-clear-ink-2">{t("colSplit")}</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((entry, i) => {
                  const last = i === schedule.length - 1;
                  return (
                    <tr key={i}>
                      <td className="h-[38px] border-b border-clear-ground px-3 text-sm font-bold whitespace-nowrap">
                        {monthYear(entry.date)}
                        {last && (
                          <ClearChip tone="mint" className="ml-1.5 h-[22px] px-2 align-middle text-xs font-bold">
                            {t("final")}
                          </ClearChip>
                        )}
                      </td>
                      <td className="h-[38px] border-b border-clear-ground px-3 text-right text-sm font-extrabold"><MoneyText>{formatEur(entry.amount)}</MoneyText></td>
                      <td className="h-[38px] border-b border-clear-ground px-3 text-right text-[13px] whitespace-nowrap text-clear-ink-2">
                        <MoneyText>{entry.interest > 0 ? t("split", { principal: formatEur(entry.principal), interest: formatEur(entry.interest) }) : t("allPrincipal")}</MoneyText>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <RecurringDetailDialog
        item={bill}
        category={bill?.categoryId != null ? cats.find((c) => c.id === bill.categoryId) ?? null : null}
        categories={cats}
        onClose={() => setBillId(null)}
      />
    </>
  );
}
