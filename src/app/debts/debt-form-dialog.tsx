"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconChevronRight,
  IconHelpCircle,
  IconLink,
  IconReload,
  IconTrash,
  IconTrendingDown,
  IconTrendingUp,
} from "@tabler/icons-react";
import { currencySymbol, formatEur, formatEurWhole } from "@/lib/format";
import { evaluateExpression } from "@/lib/amount-expression";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ClearSwitch } from "@/components/clear/switch";
import { Segmented } from "@/components/clear/segmented";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { InfoHint } from "@/components/clear/info-hint";
import { DatePicker } from "@/components/date-picker";
import { IconColorField } from "@/components/icon-color-field";
import { RecurringMultiPicker } from "@/components/recurring-multi-picker";
import { CategoryPickerSheet } from "@/components/category-picker";
import { ContextualTip } from "@/components/contextual-tip";
import { TipWalkthrough } from "@/components/tip-walkthrough";
import type { Category, Debt, RecurringItem } from "@/db/schema";
import { amountToExpr, linkedBillsMonthlyTotal } from "./debt-shared";
import { DebtIcon, PaymentNotice, usePaymentNotice } from "./debt-ui";
import { MoneyText } from "@/components/clear/money";

// The walkthrough's running order — the order you fill the form in. Each entry needs
// matching copy at tips.debtFormTour.steps.<anchor>.
const DEBT_TOUR_STEPS = [
  "debtDirection",
  "debtIcon",
  "debtBalanceDate",
  "debtMinPayment",
  "debtInterest",
  "debtStartDate",
  "debtOriginalAmount",
  "debtLinkedBills",
  "debtAutoBill",
  "debtNote",
  "debtHelp",
  "debtSave",
] as const;

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * An amount as typed: "1.200,50", "1,200.50", "420" — and sums ("100+25", "3×75"), so
 * the old keypad's calculator still works by typing. Whichever of "," and "." comes
 * last is the decimal separator; the other is a thousands separator.
 */
export function parseAmountInput(raw: string): number | null {
  const s = raw.replace(/[\s€$£]/g, "");
  if (!s) return null;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  const cleaned = comma > dot ? s.replace(/\./g, "") : comma !== -1 ? s.replace(/,/g, "") : s;
  return evaluateExpression(cleaned);
}

const OPERATOR = /\d\s*[+\-*/×÷−]\s*\d/;

/**
 * Parse the annual-rate text field. Accepts a comma or a period as the decimal
 * separator and returns null for blank/zero/nonsense — null being the "this debt is
 * interest-free" value the whole payoff model keys off.
 */
function parseRatePercent(raw: string): number | null {
  const value = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1000) / 1000;
}

/** Digits and a single decimal separator, as typed. */
function sanitizeRate(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 3);
}

// The colour swatches beside the icon, as on the savings goal form; any other colour
// comes from the full picker next to them. Labels at debtForm.colors.<key>.
const DEBT_COLORS = [
  { key: "red", hex: "#ef4444" },
  { key: "orange", hex: "#f97316" },
  { key: "amber", hex: "#f59e0b" },
  { key: "green", hex: "#22c55e" },
  { key: "teal", hex: "#14b8a6" },
  { key: "blue", hex: "#3b82f6" },
  { key: "indigo", hex: "#6366f1" },
  { key: "purple", hex: "#a855f7" },
  { key: "pink", hex: "#ec4899" },
] as const;

const FIELD_BOX =
  "flex h-12 items-center gap-1.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 transition-colors focus-within:border-clear-ink";
const FIELD_INPUT =
  "min-w-0 w-full flex-1 border-none bg-transparent p-0 font-clear text-[15px] font-extrabold tabular-nums text-clear-ink outline-none placeholder:font-semibold placeholder:text-clear-placeholder";
const LABEL = "text-[13px] font-bold text-clear-ink-2";
const DATE_TRIGGER =
  "mt-0 mb-0 h-12 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 font-clear text-[15px] font-bold text-clear-ink focus-visible:border-clear-ink focus-visible:ring-0";

/** A money field: currency sign, the amount (sums allowed) and what a sum comes to. */
function MoneyInput({
  id,
  value,
  onChange,
  trailing,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  trailing?: React.ReactNode;
  describedBy?: string;
}) {
  const result = OPERATOR.test(value) ? parseAmountInput(value) : null;
  return (
    <div className={FIELD_BOX}>
      <span aria-hidden className="text-[15px] font-bold text-clear-muted">{currencySymbol()}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0,00"
        aria-describedby={describedBy}
        className={FIELD_INPUT}
      />
      {result != null && <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap text-clear-muted">= <MoneyText>{formatEur(result)}</MoneyText></span>}
      {trailing}
    </div>
  );
}

/**
 * Add or edit a debt — one form for both, a Clear sheet. Every field is on the page
 * (no sub-pages): direction, icon and name, the balance and the date it was true, the
 * monthly payment and interest (with a live read-out of what each payment does), start
 * date, original amount, linked recurring bills (or, when adding, a new bill created
 * from this debt) and a note.
 */
export function DebtFormDialog({
  open,
  onOpenChange,
  bills,
  debt,
  currentRecurringIds = [],
  initialDirection = "owe",
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bills: RecurringItem[];
  /** The debt to edit; omitted when adding one. */
  debt?: Debt | null;
  currentRecurringIds?: number[];
  initialDirection?: "owe" | "owed";
  onDeleted?: () => void;
}) {
  const t = useTranslations("debtForm");
  const title = debt ? t("editDebt") : t("addDebt");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideHeaderRow title={title} className="gap-4 pt-6">
        {/* Mounted per opening (the sheet unmounts its content once closed), so every
            opening starts from the debt as saved — or a blank form. */}
        <DebtFormBody
          bills={bills}
          debt={debt ?? null}
          currentRecurringIds={currentRecurringIds}
          initialDirection={initialDirection}
          title={title}
          open={open}
          onClose={() => onOpenChange(false)}
          onDeleted={onDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}

function DebtFormBody({
  bills,
  debt,
  currentRecurringIds,
  initialDirection,
  title,
  open,
  onClose,
  onDeleted,
}: {
  bills: RecurringItem[];
  debt: Debt | null;
  currentRecurringIds: number[];
  initialDirection: "owe" | "owed";
  title: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("debtForm");
  const locale = useLocale();
  const confirm = useConfirm();
  const notice = usePaymentNotice();
  const isEdit = debt != null;
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const dateLabel = (date: string) => dateFmt.format(new Date(`${date}T12:00:00`));

  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<"owe" | "owed">((debt?.direction as "owe" | "owed" | undefined) ?? initialDirection);
  const [name, setName] = useState(debt?.name ?? "");
  const [balanceExpr, setBalanceExpr] = useState(debt ? amountToExpr(debt.startingBalance) : "");
  const [startDate, setStartDate] = useState(debt ? debt.startDate ?? `${debt.startMonth}-01` : todayISO());
  // When the balance was true. New debts default to today, so entering a debt that began
  // years ago doesn't make the app assume years of repayments nobody recorded. Existing
  // debts were migrated to balanceDate = startDate (see src/db/index.ts).
  const [balanceDate, setBalanceDate] = useState(debt ? debt.balanceDate ?? debt.startDate ?? `${debt.startMonth}-01` : todayISO());
  const [paymentExpr, setPaymentExpr] = useState(debt?.minimumPayment ? amountToExpr(debt.minimumPayment) : "");
  // Linking a recurring bill fills the payment from that bill's monthly cost. Typing a
  // figure by hand switches this on and stops the link from overwriting it again — the
  // "Use linked bill amount" button hands control back. Opening the form never rewrites
  // a saved payment on its own: the derivation runs when bills are applied.
  const [paymentOverridden, setPaymentOverridden] = useState(false);
  // Optional true original amount, when it is larger than the balance because tracking
  // started after some of the debt was already paid off.
  const [originalExpr, setOriginalExpr] = useState(debt?.originalAmount != null ? amountToExpr(debt.originalAmount) : "");
  // Optional annual nominal interest. Blank = interest-free (see lib/debt-interest.ts).
  const [interestRate, setInterestRate] = useState(debt?.interestRate != null ? String(debt.interestRate) : "");
  const [notes, setNotes] = useState(debt?.notes ?? "");
  const [icon, setIcon] = useState<string | null>(debt?.icon ?? null);
  const [color, setColor] = useState<string>(debt?.color ?? DEBT_COLORS[0].hex);
  const [iconOpen, setIconOpen] = useState(false);
  const [recurringIds, setRecurringIds] = useState<number[]>(currentRecurringIds);
  const [recurringOpen, setRecurringOpen] = useState(false);
  // Adding only: saving also creates a monthly recurring bill from this debt's name,
  // payment, start date and note, and links it. A category is mandatory before it can
  // be turned on (picked in the category sheet).
  const [autoCreateBill, setAutoCreateBill] = useState(false);
  const [recurringCategoryId, setRecurringCategoryId] = useState("");
  const [recurringCatOpen, setRecurringCatOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const recurringCategory = categories.find((c) => String(c.id) === recurringCategoryId) ?? null;
  // Bumped by the help button to replay the walkthrough.
  const [tourToken, setTourToken] = useState(0);

  useEffect(() => {
    if (!recurringCatOpen || categories.length) return;
    fetch("/api/categories")
      .then((r) => r.json())
      .then((c) => setCategories(Array.isArray(c) ? c : []))
      .catch(() => {});
  }, [recurringCatOpen, categories.length]);

  const balance = parseAmountInput(balanceExpr);
  const payment = parseAmountInput(paymentExpr);
  const original = parseAmountInput(originalExpr);
  const rate = parseRatePercent(interestRate);
  const selectedBills = recurringIds.map((id) => bills.find((b) => b.id === id)).filter((b): b is RecurringItem => !!b);
  const linkedMonthly = linkedBillsMonthlyTotal(selectedBills);
  const owed = direction === "owed";
  const canSave = !busy && !!name.trim() && balance != null && (isEdit ? balance >= 0 : balance > 0);
  const preview = notice({ balance: balance ?? 0, payment: payment ?? 0, rate, owed, payoffFrom: balanceDate });

  function applyRecurringIds(ids: number[]) {
    setRecurringIds(ids);
    if (paymentOverridden) return;
    const linked = ids.map((id) => bills.find((b) => b.id === id)).filter((b): b is RecurringItem => !!b);
    setPaymentExpr(amountToExpr(linkedBillsMonthlyTotal(linked)));
  }

  function applyLinkedPayment() {
    setPaymentExpr(amountToExpr(linkedMonthly));
    setPaymentOverridden(false);
  }

  function toggleAutoBill(on: boolean) {
    if (on) {
      // A category is mandatory: open the picker; it only turns on once one is chosen.
      setRecurringCatOpen(true);
    } else {
      setAutoCreateBill(false);
      setRecurringCategoryId("");
    }
  }

  async function save() {
    if (!canSave || balance == null) return;
    setBusy(true);
    const body = {
      name: name.trim(),
      direction,
      startingBalance: balance,
      originalAmount: original || null,
      minimumPayment: payment || 0,
      interestRate: rate,
      startDate,
      startMonth: startDate.slice(0, 7),
      balanceDate,
      color: color || null,
      icon: icon || null,
      notes: notes.trim() || null,
      recurringIds,
    };
    await fetch("/api/debts", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isEdit
          ? { id: debt.id, ...body }
          : {
              ...body,
              createRecurringBill: autoCreateBill,
              recurringCategoryId: autoCreateBill ? recurringCategory?.id ?? null : null,
              recurringBudgetType: autoCreateBill ? recurringCategory?.budgetType ?? "nodig" : null,
            },
      ),
    });
    setBusy(false);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!debt) return;
    const ok = await confirm({
      title: t("confirmDelete", { name: debt.name }),
      body: t("confirmDeleteBody"),
      confirmLabel: t("confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    await fetch("/api/debts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: debt.id }),
    });
    setBusy(false);
    onClose();
    onDeleted?.();
    router.refresh();
  }

  const subDialogOpen = iconOpen || recurringOpen || recurringCatOpen;

  return (
    <>
      <ClearDialogHeader title={title} subtitle={t("subtitle")} onClose={onClose} closeLabel={t("close")} />

      <div data-tip-anchor="debtDirection" className="flex">
        <Segmented
          label={t("type")}
          surface="tile"
          value={direction}
          onChange={setDirection}
          className="w-full [&>button]:flex-1 [&>button]:gap-2"
          items={[
            { value: "owe", label: <><IconTrendingDown aria-hidden size={18} stroke={2} />{t("owe")}</> },
            { value: "owed", label: <><IconTrendingUp aria-hidden size={18} stroke={2} />{t("owed")}</> },
          ]}
        />
      </div>

      <IconColorField
        anchor="debtIcon"
        icon={icon}
        color={color}
        onIconChange={setIcon}
        onColorChange={setColor}
        swatches={DEBT_COLORS.map((c) => ({ hex: c.hex, label: t(`colors.${c.key}`) }))}
        tile={<DebtIcon icon={icon} color={color} owed={owed} size="xxl" />}
        label={t("iconColor")}
        changeIconLabel={t("changeIcon")}
        pickerOpen={iconOpen}
        onPickerOpenChange={setIconOpen}
      />

      <ClearField label={t("name")} htmlFor="debt-name">
        <ClearInput
          id="debt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={owed ? t("namePlaceholderOwed") : t("namePlaceholderOwe")}
          className="font-bold"
        />
      </ClearField>

      <div className="grid gap-3 sm:grid-cols-2">
        <ClearField label={t("balance")} htmlFor="debt-balance">
          <MoneyInput id="debt-balance" value={balanceExpr} onChange={setBalanceExpr} />
        </ClearField>

        <div data-tip-anchor="debtBalanceDate" role="group" aria-labelledby="debt-balance-date" className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5">
            <span id="debt-balance-date" className={LABEL}>{t("balanceAsOf")}</span>
            <InfoHint label={t("balanceDateInfo")}>{t("balanceDateHint")}</InfoHint>
          </span>
          <DatePicker
            value={balanceDate}
            onChange={setBalanceDate}
            label={balanceDate === todayISO() ? t("today") : dateLabel(balanceDate)}
            triggerClassName={DATE_TRIGGER}
          />
        </div>

        <div data-tip-anchor="debtMinPayment" className="flex flex-col gap-1.5">
          <ClearField label={t("minPayment")} htmlFor="debt-payment">
            <MoneyInput
              id="debt-payment"
              value={paymentExpr}
              onChange={(v) => {
                setPaymentExpr(v);
                setPaymentOverridden(true);
              }}
              trailing={<span className="shrink-0 text-[13px] font-semibold whitespace-nowrap text-clear-muted">{t("perMonth")}</span>}
            />
          </ClearField>
          {linkedMonthly > 0 && selectedBills.length > 0 && (
            <p className="m-0 text-[13px] leading-[1.45] text-clear-muted">
              <MoneyText>{paymentOverridden
                ? t("paymentOverridden", { amount: formatEur(linkedMonthly), count: selectedBills.length })
                : t("paymentFromLinked", { amount: formatEur(linkedMonthly), count: selectedBills.length })}</MoneyText>
              {paymentOverridden && (
                <>
                  {" "}
                  <button type="button" onClick={applyLinkedPayment} className="cursor-pointer font-bold text-clear-ember-text hover:underline">
                    {t("useLinkedAmount")}
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        <div data-tip-anchor="debtInterest">
          <ClearField label={t("interestRate")} htmlFor="debt-rate">
            <div className={FIELD_BOX}>
              <input
                id="debt-rate"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={interestRate}
                onChange={(e) => setInterestRate(sanitizeRate(e.target.value))}
                placeholder="0"
                className={FIELD_INPUT}
              />
              <span aria-hidden className="text-[15px] font-bold text-clear-muted">%</span>
            </div>
          </ClearField>
        </div>

        <div data-tip-anchor="debtStartDate" role="group" aria-labelledby="debt-start-date" className="flex flex-col gap-1.5">
          <span id="debt-start-date" className={LABEL}>{t("startDate")}</span>
          <DatePicker value={startDate} onChange={setStartDate} label={dateLabel(startDate)} triggerClassName={DATE_TRIGGER} />
        </div>

        <div data-tip-anchor="debtOriginalAmount" className="flex flex-col gap-1.5">
          {/* Not a ClearField: the "?" button can't sit inside a <label>. */}
          <span className="flex items-center gap-1.5">
            <label htmlFor="debt-original" className={LABEL}>
              {t("originalAmount")}
            </label>
            <InfoHint label={t("originalInfo")}>{t("originalHint")}</InfoHint>
          </span>
          <MoneyInput
            id="debt-original"
            value={originalExpr}
            onChange={setOriginalExpr}
            trailing={
              original != null && balance != null && original > balance ? (
                <span className="hidden shrink-0 text-[13px] font-semibold whitespace-nowrap text-clear-muted min-[420px]:inline">
                  <MoneyText>{owed ? t("receivedSoFar", { amount: formatEurWhole(original - balance) }) : t("paidSoFar", { amount: formatEurWhole(original - balance) })}</MoneyText>
                </span>
              ) : undefined
            }
          />
        </div>
      </div>

      <PaymentNotice notice={preview} />

      <div className="flex flex-col gap-2 rounded-clear-tile bg-clear-tile p-2">
        <button
          type="button"
          data-tip-anchor="debtLinkedBills"
          onClick={() => setRecurringOpen(true)}
          disabled={autoCreateBill}
          className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-clear-row px-2 text-left transition-colors hover:bg-clear-card disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-sky text-clear-sky-ink">
            <IconLink size={16} stroke={2.2} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{t("linkedBills")}</span>
            <span className="truncate text-[13px] text-clear-muted">
              {autoCreateBill
                ? t("linkedDisabled")
                : selectedBills.length === 0
                  ? t("linkedNone")
                  : selectedBills.length === 1
                    ? selectedBills[0].friendlyName ?? selectedBills[0].name
                    : t("billsCount", { count: selectedBills.length })}
            </span>
          </span>
          <IconChevronRight aria-hidden size={18} stroke={2.2} className="shrink-0 text-clear-muted" />
        </button>

        {!isEdit && (
          <div data-tip-anchor="debtAutoBill" className="flex flex-col gap-1 px-2 pt-1 pb-2">
            <div className="flex min-h-11 items-center gap-3">
              <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-mint text-clear-mint-ink">
                <IconReload size={16} stroke={2.2} />
              </span>
              <span id="debt-autobill-label" className="flex-1 text-[15px] font-bold">{t("autoBill")}</span>
              <ClearSwitch checked={autoCreateBill} onCheckedChange={toggleAutoBill} labelledBy="debt-autobill-label" />
            </div>
            {autoCreateBill && (
              <p className="m-0 pl-11 text-[13px] leading-[1.5] text-clear-ink-2">
                <MoneyText>{recurringCategory
                  ? t.rich("autoBillSummaryIn", {
                      name: name.trim() || "…",
                      amount: payment ? formatEur(payment) : t("minPaymentFallback"),
                      category: recurringCategory.name,
                      cat: (chunks) => (
                        <button type="button" onClick={() => setRecurringCatOpen(true)} className="cursor-pointer font-bold text-clear-ink underline underline-offset-2">
                          <MoneyText>{chunks}</MoneyText>
                        </button>
                      ),
                    })
                  : t("autoBillSummary", { name: name.trim() || "…", amount: payment ? formatEur(payment) : t("minPaymentFallback") })}</MoneyText>
              </p>
            )}
          </div>
        )}
      </div>

      <div data-tip-anchor="debtNote">
        <ClearField label={t("note")} htmlFor="debt-note">
          <textarea
            id="debt-note"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notePlaceholder")}
            rows={2}
            className="w-full resize-none rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 py-3 font-clear text-[15px] text-clear-ink outline-none transition-colors placeholder:text-clear-placeholder focus:border-clear-ink"
          />
        </ClearField>
      </div>

      <div className="pb-1">
        <ClearDialogFooter
          destructive={
            <>
              {isEdit && (
                <button type="button" onClick={remove} disabled={busy} className={clearButtonVariants({ variant: "danger" })}>
                  <IconTrash aria-hidden />
                  {t("delete")}
                </button>
              )}
              <button
                type="button"
                data-tip-anchor="debtHelp"
                onClick={() => setTourToken((n) => n + 1)}
                aria-label={t("whatDoFieldsDo")}
                title={t("whatDoFieldsDo")}
                className={clearButtonVariants({ variant: "ghost", size: "icon" })}
              >
                <IconHelpCircle aria-hidden />
              </button>
            </>
          }
        >
          <button type="button" onClick={onClose} className={clearButtonVariants({ variant: "secondary" })}>
            {t("cancel")}
          </button>
          <button type="button" data-tip-anchor="debtSave" onClick={save} disabled={!canSave} className={clearButtonVariants()}>
            {busy ? t("saving") : t("save")}
          </button>
        </ClearDialogFooter>
      </div>

      <RecurringMultiPicker bills={bills} selected={recurringIds} open={recurringOpen} onOpenChange={setRecurringOpen} onApply={applyRecurringIds} />

      {/* The one category picker; choosing one turns "also create a recurring bill" on,
          cancelling (or clearing) leaves it off. */}
      <CategoryPickerSheet
        categories={categories}
        current={recurringCategoryId || undefined}
        open={recurringCatOpen}
        onOpenChange={setRecurringCatOpen}
        onChange={(v) => {
          setRecurringCategoryId(v);
          setAutoCreateBill(!!v);
          if (v) setRecurringIds([]);
        }}
      />

      {/* Explains that linking a bill also sets the payment — shown the first time the
          picker is opened, and exempt from "Don't show again" (see tips.ts). */}
      <ContextualTip id="debtLinkedPayment" active={recurringOpen} />

      {/* Every field once, in the order you fill them in — automatically the first time
          a debt is added, and replayable from the help button. Paused while a sub-sheet
          is up so a card never points at a field hidden behind it. */}
      <TipWalkthrough id="debtFormTour" steps={DEBT_TOUR_STEPS} active={open && !isEdit && !subDialogOpen} replayToken={tourToken} />
    </>
  );
}
