"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEurWhole } from "@/lib/format";
import { todayStr } from "@/lib/date-range";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { MoneyText } from "@/components/clear/money";
import { DatePicker } from "@/components/date-picker";
import type { ComputedDebt } from "./debt-shared";
import { DebtIcon } from "./debt-ui";
import { MoneyInput, parseAmountInput } from "./debt-form-dialog";
import { logDebtPaymentAction } from "./actions";

const DATE_TRIGGER =
  "mt-0 mb-0 h-12 w-full rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 font-clear text-[15px] font-semibold text-clear-ink focus-visible:border-clear-ink focus-visible:ring-0";

/**
 * "Log a payment" (Plan › Debts' heading): an extra or lump-sum payment on one of your
 * debts, which comes off its balance on its date. Pick the debt, the amount, the date
 * (today or earlier) and an optional note. Remounted per opening (the caller keys it).
 */
export function LogPaymentDialog({
  open,
  onOpenChange,
  debts,
  initialDebtId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open debts you owe, in the payoff order. */
  debts: ComputedDebt[];
  initialDebtId?: number | null;
}) {
  const t = useTranslations("plan.debts.logPayment");
  const [debtId, setDebtId] = useState<number | null>(initialDebtId ?? debts[0]?.debt.id ?? null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const chosen = debts.find((c) => c.debt.id === debtId) ?? null;
  const value = parseAmountInput(amount);
  const amountOk = value != null && value > 0;
  const dateOk = date <= todayStr();
  const after = chosen && amountOk ? Math.max(0, chosen.currentBalance - value) : null;

  async function save() {
    setTouched(true);
    if (!chosen || !amountOk || !dateOk) return;
    setBusy(true);
    setFailed(false);
    const res = await logDebtPaymentAction({ debtId: chosen.debt.id, amount: value, date, note }).catch(() => ({ error: "invalid" as const }));
    setBusy(false);
    if (res.error) {
      setFailed(true);
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideHeaderRow
        title={t("title")}
        className="gap-5 pt-7 font-clear text-clear-ink"
        sheetClassName="lg:w-[560px]"
        footer={
          <ClearDialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} className={clearButtonVariants({ variant: "secondary" })}>
              {t("cancel")}
            </button>
            <button type="button" onClick={save} disabled={busy || !chosen} className={clearButtonVariants()}>
              <IconCheck aria-hidden />
              {t("save")}
            </button>
          </ClearDialogFooter>
        }
      >
        <ClearDialogHeader title={t("title")} subtitle={t("subtitle")} onClose={() => onOpenChange(false)} closeLabel={t("close")} />

        <div className="flex flex-col gap-1.5">
          <span id="log-payment-debt" className="text-[13px] font-semibold text-clear-ink-2">
            {t("debt")}
          </span>
          <div role="radiogroup" aria-labelledby="log-payment-debt" className="flex flex-col gap-1.5">
            {debts.map((c) => {
              const on = c.debt.id === debtId;
              return (
                <button
                  key={c.debt.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDebtId(c.debt.id)}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-clear-row border-[1.5px] px-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                    on ? "border-clear-ink bg-clear-card" : "border-transparent bg-clear-tile hover:bg-clear-line",
                  )}
                >
                  <DebtIcon icon={c.debt.icon ?? c.linkedBills[0]?.icon} color={c.debt.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.debt.name}</span>
                  <span className="shrink-0 text-[13px] font-medium text-clear-muted">
                    <MoneyText>{t("balance", { amount: formatEurWhole(c.currentBalance) })}</MoneyText>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ClearField
            label={t("amount")}
            htmlFor="log-payment-amount"
            error={touched && !amountOk ? t("invalidAmount") : undefined}
            hint={
              chosen && after != null
                ? after <= 0
                  ? t("afterDone", { name: chosen.debt.name })
                  : t("after", { amount: formatEurWhole(after), name: chosen.debt.name })
                : undefined
            }
          >
            <MoneyInput id="log-payment-amount" value={amount} onChange={setAmount} />
          </ClearField>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-clear-ink-2">{t("date")}</span>
            <DatePicker value={date} onChange={setDate} triggerClassName={DATE_TRIGGER} />
            {!dateOk && (
              <span role="alert" className="text-[13px] font-semibold text-clear-negative">
                {t("futureDate")}
              </span>
            )}
          </div>
        </div>

        <ClearField label={t("note")} htmlFor="log-payment-note">
          <ClearInput id="log-payment-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} maxLength={200} />
        </ClearField>

        {failed && (
          <span role="alert" className="text-[13px] font-semibold text-clear-negative">
            {t("error")}
          </span>
        )}
      </DialogContent>
    </Dialog>
  );
}
