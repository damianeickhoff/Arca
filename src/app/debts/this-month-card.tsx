"use client";

import { useLocale, useTranslations } from "next-intl";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEurWhole } from "@/lib/format";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { MoneyText } from "@/components/clear/money";
import { BillStatusControl } from "@/components/bill-status-control";
import type { ComputedDebt, DebtMonthPayment, DebtsMonthPayments } from "./debt-shared";
import { DebtIcon } from "./debt-ui";
import { setDebtMinimumPaidAction } from "./actions";

/**
 * "This month's payments": one row per open debt with this month's payment. Paid once
 * its linked bill matched a transaction (or was marked), else the shared bill status
 * control; a debt with no linked bill asks "Paid?" and stores its own mark. At the
 * bottom, the extra payments logged so far this year. Fills its column (flex-1) so the
 * column lines up with Your debts.
 */
export function ThisMonthCard({
  active,
  thisMonth,
  className,
}: {
  /** Open debts you owe, in the payoff order. */
  active: ComputedDebt[];
  thisMonth: DebtsMonthPayments;
  className?: string;
}) {
  const t = useTranslations("plan.debts.thisMonth");
  const locale = useLocale();
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const fmt = (iso: string) => day.format(new Date(`${iso}T12:00:00`));
  const byId = new Map(thisMonth.payments.map((p) => [p.debtId, p]));
  const rows = active.flatMap((c) => {
    const p = byId.get(c.debt.id);
    return p ? [{ c, p }] : [];
  });
  const minimums = rows.reduce((s, r) => s + r.c.debt.minimumPayment, 0);
  const toGo = rows.filter((r) => r.p.kind !== "notDue" && !r.p.paid).length;

  function sub(p: DebtMonthPayment) {
    if (p.paid) {
      if (!p.paidOn) return t("paidUndated");
      return p.source === "match" ? t("paidMatched", { date: fmt(p.paidOn) }) : t("paidMarked", { date: fmt(p.paidOn) });
    }
    if (p.kind === "notDue") return t("notDue");
    if (p.kind === "unlinked") return p.dueDay ? t("noBill", { day: p.dueDay }) : t("noBillNoDay");
    return p.dueDate ? t("dueOn", { date: fmt(p.dueDate) }) : t("notDue");
  }

  return (
    <ClearCard data-tip-anchor="debtsPaymentsMonth" aria-labelledby="debts-month-title" className={cn("gap-3", className)}>
      <ClearCardHeader
        title={<span id="debts-month-title">{t("title")}</span>}
        subtitle={<MoneyText>{t("subtitle", { amount: formatEurWhole(minimums), count: toGo })}</MoneyText>}
      />
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map(({ c, p }) => (
          <li key={c.debt.id} className="flex min-w-0 items-center gap-3 py-2">
            <DebtIcon icon={c.debt.icon ?? c.linkedBills[0]?.icon} color={c.debt.color} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{c.debt.name}</span>
              <span className="truncate text-xs font-medium text-clear-muted">
                <MoneyText>{sub(p)}</MoneyText>
              </span>
            </span>
            <Amount value={p.amount} sign="none" splitCents={false} className="shrink-0 text-sm font-bold!" />
            <PaymentStatus p={p} label={t("paid")} />
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 rounded-clear-tile bg-clear-tile px-4 py-3">
        <span className="text-[13px] font-medium text-clear-ink-2">{t("extraYear")}</span>
        <Amount value={thisMonth.extraThisYear} sign="none" splitCents={false} className="text-sm font-bold!" />
      </div>
    </ClearCard>
  );
}

/** A matched payment is a quiet mint chip; anything you can mark is the shared control. */
function PaymentStatus({ p, label }: { p: DebtMonthPayment; label: string }) {
  if (p.paid && p.source === "match") {
    return (
      <ClearChip tone="mint" icon={<IconCheck stroke={3} aria-hidden />} className="h-7 px-2.5 text-xs font-semibold">
        {label}
      </ClearChip>
    );
  }
  if (!p.control) return null;
  if (p.kind === "unlinked") {
    return (
      <BillStatusControl
        state={p.control}
        month={p.month}
        onMark={async (paid) => !(await setDebtMinimumPaidAction(p.debtId, paid)).error}
      />
    );
  }
  return <BillStatusControl state={p.control} recurringItemId={p.billId!} month={p.month} item={p.item} />;
}
