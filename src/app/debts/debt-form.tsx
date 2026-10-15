"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconX,
  IconDots,
  IconCalculator,
  IconNote,
  IconCheck,
  IconTrendingDown,
  IconTrendingUp,
  IconCoinEuro,
  IconReceipt2,
  IconReload,
  IconPercentage,
  IconHelpCircle,
} from "@tabler/icons-react";
import {
  IconBackspace,
  IconDivide,
  IconX as IconMultiply,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";
import { DatePicker } from "@/components/date-picker";
import { AmountKeypad } from "@/components/amount-keypad";
import { RecurringMultiPicker } from "@/components/recurring-multi-picker";
import { CategoryPickerSheet } from "@/components/category-picker";
import { IconPicker } from "@/components/icon-picker";
import { ColorPicker } from "@/components/color-picker";
import { PickerField } from "@/components/picker-field";
import { Icon } from "@/components/icon";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { m, AnimatePresence, LazyMotion, domMax, easeOutQuart } from "@/lib/motion";
import { isOperator, evaluateExpression, formatAmount, pressKey } from "@/lib/amount-expression";
import { useKeypadKeyboard } from "@/lib/use-keypad-keyboard";
import { formatEur, currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SHEET_COLUMN } from "@/components/page-container";
import { ContextualTip } from "@/components/contextual-tip";
import { TipWalkthrough } from "@/components/tip-walkthrough";
import { LinkedPaymentHint } from "./linked-payment-hint";
import { InterestRateField, parseRatePercent } from "./interest-rate-field";
import { amountToExpr, linkedBillsMonthlyTotal } from "./debt-shared";
import type { Category, RecurringItem } from "@/db/schema";

// The walkthrough's running order — roughly top-left to bottom-right, the order you'd
// fill the form in. Each entry needs matching copy at tips.debtFormTour.steps.<anchor>.
const DEBT_TOUR_STEPS = [
  "debtDirection",
  "debtIcon",
  "debtBalanceDate",
  "debtStartDate",
  "debtMinPayment",
  "debtOriginalAmount",
  "debtInterest",
  "debtAutoBill",
  "debtNote",
  "debtLinkedBills",
  "debtMenu",
  "debtSave",
  "debtClose",
] as const;

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The debt add form (behind /debts/add) — full-screen calculator style, matching the
// add-transaction page. Editing an existing debt uses DebtEditDialog instead (see
// debt-edit-dialog.tsx), which matches the recurring-item edit dialog's row-list style.
export function DebtForm({ bills }: { bills: RecurringItem[] }) {
  const router = useRouter();
  const t = useTranslations("debtForm");
  const locale = useLocale();
  const [loading, setLoading] = useState(false);

  const [direction, setDirection] = useState<"owe" | "owed">("owe");
  const [name, setName] = useState("");
  const [expr, setExpr] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  // When the amount above was true. Defaults to today, so entering a debt that began
  // years ago no longer makes the app assume years of repayments nobody recorded.
  const [balanceDate, setBalanceDate] = useState(todayISO());
  const [balanceDateOpen, setBalanceDateOpen] = useState(false);
  const [paymentExpr, setPaymentExpr] = useState("");
  const [paymentCalcEnabled, setPaymentCalcEnabled] = useState(false);
  const [minPaymentOpen, setMinPaymentOpen] = useState(false);
  // Linking a recurring bill fills the minimum payment from that bill's monthly cost.
  // Touching the payment keypad by hand switches this on and stops the link from
  // overwriting the figure again — the "Use linked bill amount" button hands control back.
  const [paymentOverridden, setPaymentOverridden] = useState(false);
  // Optional true original amount, when it's larger than the balance above because
  // tracking started after some of the debt was already paid off.
  const [originalExpr, setOriginalExpr] = useState("");
  const [originalCalcEnabled, setOriginalCalcEnabled] = useState(false);
  const [originalAmountOpen, setOriginalAmountOpen] = useState(false);
  // Optional annual nominal interest. Blank = interest-free, which is the maths this
  // app used for every debt before rates existed (see lib/debt-interest.ts).
  const [interestRate, setInterestRate] = useState("");
  const [interestOpen, setInterestOpen] = useState(false);
  // Bumped by the "What do these buttons do?" menu item to replay the walkthrough.
  const [tourToken, setTourToken] = useState(0);
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState("#ef4444");
  const [iconColorOpen, setIconColorOpen] = useState(false);
  const [recurringIds, setRecurringIds] = useState<number[]>([]);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [calcEnabled, setCalcEnabled] = useState(false);
  // When on, saving also creates a monthly recurring bill from this debt's own name +
  // minimum payment + start month + notes, and links it — so you don't have to fill it
  // in twice. A category is mandatory before it can be turned on (picked via the popup).
  const [autoCreateBill, setAutoCreateBill] = useState(false);
  const [recurringCategoryId, setRecurringCategoryId] = useState<string>("");
  const [recurringCatOpen, setRecurringCatOpen] = useState(false);
  // Loaded here rather than passed down: this page's server component only supplies the
  // recurring bills, and the shared category picker takes the list as a prop.
  const [categories, setCategories] = useState<Category[]>([]);
  const recurringCategory = categories.find((c) => String(c.id) === recurringCategoryId) ?? null;

  useEffect(() => acquireNavHidden(), []);

  useEffect(() => {
    if (!recurringCatOpen || categories.length) return;
    fetch("/api/categories").then((r) => r.json()).then((c) => setCategories(Array.isArray(c) ? c : [])).catch(() => {});
  }, [recurringCatOpen, categories.length]);

  const result = evaluateExpression(expr);
  const paymentVal = evaluateExpression(paymentExpr);
  const originalVal = evaluateExpression(originalExpr);
  const canSave = !loading && !!name.trim() && result !== null && result > 0;
  const selectedBills = recurringIds.map((id) => bills.find((b) => b.id === id)).filter((b): b is RecurringItem => !!b);
  const linkedMonthly = linkedBillsMonthlyTotal(selectedBills);
  const interestVal = parseRatePercent(interestRate);

  // Applying a bill selection derives the minimum payment from it, unless the user has
  // already typed their own figure.
  function applyRecurringIds(ids: number[]) {
    setRecurringIds(ids);
    if (paymentOverridden) return;
    const linked = ids.map((id) => bills.find((b) => b.id === id)).filter((b): b is RecurringItem => !!b);
    setPaymentExpr(amountToExpr(linkedBillsMonthlyTotal(linked)));
  }

  function useLinkedPayment() {
    setPaymentExpr(amountToExpr(linkedMonthly));
    setPaymentOverridden(false);
  }

  const hasOps = expr.split("").some(isOperator);
  const bigDisplay = hasOps ? (result === null ? "0" : formatAmount(result)) : expr || "0";
  const isZeroDisplay = bigDisplay === "0";
  const amountChars = bigDisplay.split("");
  const press = (key: string) => setExpr((prev) => pressKey(prev, key));

  // Hardware keyboard / numpad entry for this page's own keypad, matching AmountKeypad.
  // The hook's on-screen check keeps it silent while one of the dialogs above it (minimum
  // payment, original amount) has the keypad the user is actually looking at.
  const keypadRef = useKeypadKeyboard({ calcEnabled, onKey: press, onEnter: () => { if (canSave) save(); } });

  async function save() {
    if (!name.trim() || result === null || result <= 0) return;
    setLoading(true);
    await fetch("/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        direction,
        startingBalance: result,
        originalAmount: originalVal || null,
        minimumPayment: paymentVal || 0,
        interestRate: interestVal,
        startDate,
        startMonth: startDate.slice(0, 7),
        balanceDate,
        color: color || null,
        icon: icon || null,
        notes: notes.trim() || null,
        recurringIds,
        createRecurringBill: autoCreateBill,
        recurringCategoryId: autoCreateBill ? recurringCategory?.id ?? null : null,
        recurringBudgetType: autoCreateBill ? recurringCategory?.budgetType ?? "nodig" : null,
      }),
    });
    setLoading(false);
    router.back();
    router.refresh();
  }

  const digitKey =
    "flex items-center justify-center rounded-2xl h-13 text-2xl font-medium text-foreground bg-foreground/5 active:bg-foreground/10 transition-colors select-none";
  const opKey =
    "flex items-center justify-center rounded-2xl h-13 text-foreground/80 bg-foreground/[0.07] active:bg-foreground/15 transition-colors select-none";

  return (
    <div className={cn(SHEET_COLUMN, "fixed inset-0 flex flex-col bg-background")}>
      {/* Header: close (left) + direction toggle (center) + overflow menu (right) */}
      <div className="flex items-center justify-between px-4 pt-[calc(var(--sat)+0.75rem)] pb-2 shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          data-tip-anchor="debtClose"
          aria-label={t("close")}
          className="glass-icon-btn size-11"
        >
          <IconX className="size-5 text-foreground" />
        </button>

        {/* Direction — same segmented-pill style as the Weekly/Monthly toggle on the
            budget page: the active option expands to show its label, the inactive one
            collapses down to just its badge. */}
        <div data-tip-anchor="debtDirection" className="inline-flex items-center gap-1 rounded-full bg-foreground/8 p-1">
          {(
            [
              { key: "owe", label: t("owe"), Icon: IconTrendingDown },
              { key: "owed", label: t("owed"), Icon: IconTrendingUp },
            ] as const
          ).map((opt) => {
            const active = direction === opt.key;
            const OptIcon = opt.Icon;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDirection(opt.key)}
                className={cn(
                  "flex items-center gap-2 rounded-full transition-all duration-200",
                  active ? "bg-foreground/15 py-1 pl-1 pr-3.5" : "py-1 px-1",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center size-7 rounded-full shrink-0 transition-colors",
                    active ? "bg-foreground text-background" : "bg-foreground/8 text-foreground/45",
                  )}
                >
                  <OptIcon className="size-4" />
                </span>
                {active && <span className="text-sm font-semibold text-foreground whitespace-nowrap">{opt.label}</span>}
              </button>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            data-tip-anchor="debtMenu"
            aria-label={t("moreOptions")}
            className="glass-icon-btn size-11"
          >
            <IconDots className="size-5 text-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="min-w-56 w-auto p-1.5">
            <DropdownMenuItem closeOnClick={false} onClick={() => setCalcEnabled((c) => !c)} className="gap-2.5 py-2.5">
              <IconCalculator className="size-4.5" />
              <span className="flex-1">{t("calculator")}</span>
              {calcEnabled && <IconCheck className="size-4 text-foreground/60" />}
            </DropdownMenuItem>
            {/* Always available, so the walkthrough stays reachable after it has run
                once (or been skipped) — the tip system's own storage never replays. */}
            <DropdownMenuItem onClick={() => setTourToken((n) => n + 1)} className="gap-2.5 py-2.5">
              <IconHelpCircle className="size-4.5" />
              <span className="flex-1">{t("whatDoButtonsDo")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: easeOutQuart }}
        className="flex-1 flex flex-col min-h-0"
      >
        {/* One card holding the icon/name, the amount, the date/payment/note controls and the keypad */}
        <div className="relative overflow-hidden flex-1 flex flex-col min-h-0 mx-4 mb-3 rounded-card border border-line bg-surface shadow-card p-4">
          {/* Accent wash from the chosen color — tall enough to reach past the running
              amount below the name, not just the icon/name row, and an ellipse (not a
              circle) so it reaches the card's full width instead of fading out early
              on this wide-but-short card. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-72 pointer-events-none rounded-t-3xl"
            style={{ background: `radial-gradient(ellipse 90% 90% at top, ${color}45, transparent 80%)` }}
          />

          {/* Icon above the name — tap opens the icon + color picker together */}
          <div className="flex flex-col items-center gap-2 shrink-0 pt-2">
            <button
              type="button"
              onClick={() => setIconColorOpen(true)}
              data-tip-anchor="debtIcon"
              aria-label={t("chooseIconColor")}
              className="size-14 rounded-full flex items-center justify-center active:scale-[0.96] transition-transform"
              style={{ backgroundColor: icon ? undefined : "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
            >
              <Icon iconKey={icon} color={color} size="xl" round />
            </button>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={direction === "owe" ? t("namePlaceholderOwe") : t("namePlaceholderOwed")}
              className="w-full max-w-xs mx-auto text-center text-base font-medium text-foreground placeholder:text-foreground/30 bg-transparent outline-none"
            />
          </div>

          {/* Running amount — fills the space between the name and the controls row */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            <LazyMotion features={domMax}>
              <m.div layout className="flex items-baseline justify-center">
                <m.span layout className={cn("text-6xl font-bold shrink-0 mr-2", direction === "owed" ? "text-success/40" : "text-foreground/40")}>
                  {currencySymbol()}
                </m.span>
                <div className="relative flex items-baseline">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {amountChars.map((ch, i) => (
                      <m.span
                        key={`${i}-${ch}`}
                        layout
                        initial={{ opacity: 0, y: -30, filter: "blur(10px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                        transition={{
                          default: { type: "spring", stiffness: 520, damping: 36, mass: 0.9 },
                          opacity: { duration: 0.16 },
                          filter: { duration: 0.22 },
                        }}
                        className={cn(
                          "inline-block text-6xl font-bold tabular-nums",
                          direction === "owed"
                            ? "text-success"
                            : isZeroDisplay ? "text-foreground/40" : "text-foreground",
                        )}
                      >
                        {ch}
                      </m.span>
                    ))}
                  </AnimatePresence>
                </div>
              </m.div>
            </LazyMotion>
            {hasOps && <div className="mt-3 text-base text-foreground/40 tabular-nums">{expr}</div>}
            {/* States plainly which date the amount above belongs to. The default (today)
                is what stops the app back-calculating repayments it has no evidence of;
                moving it back opts into that projection deliberately. */}
            <button
              type="button"
              data-tip-anchor="debtBalanceDate"
              onClick={() => setBalanceDateOpen(true)}
              className="mt-3 text-sm text-foreground/45 underline underline-offset-4 decoration-foreground/20"
            >
              {balanceDate === todayISO()
                ? t("balanceToday")
                : t("balanceOn", { date: formatDateLabel(balanceDate, locale) })}
            </button>
          </div>

          {/* Controls row: start month + minimum payment (icon-only) on the left, note on the right */}
          <div className="flex items-center justify-between gap-2 pb-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {/* Wrapped rather than tagged directly: DatePicker owns its own trigger
                  markup and doesn't forward arbitrary attributes down to it. */}
              <span data-tip-anchor="debtStartDate" className="inline-flex rounded-full">
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  granularity="day"
                  label={formatDateLabel(startDate, locale)}
                  triggerClassName="mt-0 mb-0 h-11 w-auto rounded-full bg-foreground/8 px-4 gap-2"
                />
              </span>
              <button
                type="button"
                onClick={() => setMinPaymentOpen(true)}
                data-tip-anchor="debtMinPayment"
                aria-label={paymentVal ? t("minPaymentAria", { amount: formatEur(paymentVal) }) : t("setMinPayment")}
                title={t("minPayment")}
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  paymentVal ? "bg-foreground text-background" : "glass-icon-btn text-foreground",
                )}
              >
                <IconCoinEuro className="size-5" />
              </button>
              <button
                type="button"
                data-tip-anchor="debtOriginalAmount"
                onClick={() => setOriginalAmountOpen(true)}
                aria-label={originalVal ? t("originalAria", { amount: formatEur(originalVal) }) : t("setOriginal")}
                title={t("originalAmount")}
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  originalVal ? "bg-foreground text-background" : "glass-icon-btn text-foreground",
                )}
              >
                <IconReceipt2 className="size-5" />
              </button>
              <button
                type="button"
                data-tip-anchor="debtInterest"
                onClick={() => setInterestOpen(true)}
                aria-label={interestVal ? t("interestAria", { rate: interestVal }) : t("setInterest")}
                title={t("interestRate")}
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  interestVal ? "bg-foreground text-background" : "glass-icon-btn text-foreground",
                )}
              >
                <IconPercentage className="size-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (autoCreateBill) {
                    // Turn it back off and clear the chosen category.
                    setAutoCreateBill(false);
                    setRecurringCategoryId("");
                  } else {
                    // A category is mandatory — open the picker; only enable once one is chosen.
                    setRecurringCatOpen(true);
                  }
                }}
                data-tip-anchor="debtAutoBill"
                aria-label={autoCreateBill ? t("autoBillOn") : t("autoBillOff")}
                title={t("autoBillTitle")}
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  autoCreateBill ? "bg-foreground text-background" : "glass-icon-btn text-foreground",
                )}
              >
                <IconReload className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                data-tip-anchor="debtNote"
                aria-label={t("addNote")}
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  notes.trim() ? "bg-foreground text-background" : "glass-icon-btn text-foreground",
                )}
              >
                <IconNote className="size-5" />
              </button>
            </div>
          </div>

          {autoCreateBill && (
            <p className="px-1 -mt-1 mb-2 text-xs text-foreground/50 shrink-0">
              {recurringCategory
                ? t.rich("autoBillSummaryIn", {
                    name: name.trim() || "…",
                    amount: paymentVal ? formatEur(paymentVal) : t("minPaymentFallback"),
                    category: recurringCategory.name,
                    cat: (chunks) => (
                      <button type="button" onClick={() => setRecurringCatOpen(true)} className="underline underline-offset-2">
                        {chunks}
                      </button>
                    ),
                  })
                : t("autoBillSummary", { name: name.trim() || "…", amount: paymentVal ? formatEur(paymentVal) : t("minPaymentFallback") })}
            </p>
          )}

          {/* Keypad — 3-column digits, plus a 4th operator column when the calculator is on */}
          <div ref={keypadRef} className="flex gap-2 shrink-0">
            <div className="grid grid-cols-3 gap-2 flex-1">
              {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
                <button key={d} type="button" onClick={() => press(d)} className={digitKey}>
                  {d}
                </button>
              ))}
              <button type="button" onClick={() => press(",")} className={digitKey}>
                ,
              </button>
              <button type="button" onClick={() => press("0")} className={digitKey}>
                0
              </button>
              <button type="button" onClick={() => press("back")} aria-label={t("backspace")} className={digitKey}>
                <IconBackspace className="size-6" />
              </button>
            </div>

            {calcEnabled && (
              <div className="grid grid-cols-1 gap-2 w-16">
                <button type="button" onClick={() => press("÷")} aria-label={t("divide")} className={opKey}>
                  <IconDivide className="size-6" />
                </button>
                <button type="button" onClick={() => press("×")} aria-label={t("multiply")} className={opKey}>
                  <IconMultiply className="size-6" />
                </button>
                <button type="button" onClick={() => press("−")} aria-label={t("subtract")} className={opKey}>
                  <IconMinus className="size-6" />
                </button>
                <button type="button" onClick={() => press("+")} aria-label={t("add")} className={opKey}>
                  <IconPlus className="size-6" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Linked recurring bills + save */}
        <div className="flex items-center justify-between gap-3 px-5 pb-[calc(var(--sab)+1.25rem)] shrink-0">
          <button
            type="button"
            onClick={() => setRecurringOpen(true)}
            data-tip-anchor="debtLinkedBills"
            disabled={autoCreateBill}
            title={autoCreateBill ? t("linkedDisabled") : undefined}
            className="min-w-0 max-w-[60%] h-11 rounded-full bg-foreground/5 pl-3.5 pr-3 gap-2 text-sm font-medium flex items-center disabled:opacity-40 disabled:pointer-events-none"
          >
            {selectedBills.length === 0 ? (
              <span className="text-foreground/50 truncate">{t("linkedBills")}</span>
            ) : (
              <span className="truncate">
                {selectedBills.length === 1 ? selectedBills[0].name : t("recurringBillsCount", { count: selectedBills.length })}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={save}
            data-tip-anchor="debtSave"
            disabled={!canSave}
            className="h-11 px-7 rounded-full bg-foreground text-background text-sm font-semibold shadow-floating active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none shrink-0"
          >
            {loading ? t("saving") : t("save")}
          </button>
        </div>
      </m.div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("note")}</DialogTitle>
          </DialogHeader>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notePlaceholderAdd")}
            rows={4}
            autoFocus
            className="w-full rounded-tile bg-surface-2 p-3.5 text-sm text-foreground placeholder:text-foreground/40 outline-none resize-none"
          />
          <button
            type="button"
            onClick={() => setNoteOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold"
          >
            {t("done")}
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={minPaymentOpen} onOpenChange={setMinPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("minPayment")}</DialogTitle>
          </DialogHeader>
          <LinkedPaymentHint
            linkedMonthly={linkedMonthly}
            billCount={selectedBills.length}
            overridden={paymentOverridden}
            onUse={useLinkedPayment}
          />
          <AmountKeypad
            expr={paymentExpr}
            onChange={(next) => { setPaymentExpr(next); setPaymentOverridden(true); }}
            onEnter={() => setMinPaymentOpen(false)}
            calcEnabled={paymentCalcEnabled}
            onToggleCalc={() => setPaymentCalcEnabled((c) => !c)}
          />
          <button
            type="button"
            onClick={() => setMinPaymentOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold"
          >
            {t("done")}
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={originalAmountOpen} onOpenChange={setOriginalAmountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("originalAmount")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground/50 -mt-2">
            {t("originalHelpAdd")}
          </p>
          <AmountKeypad expr={originalExpr} onChange={setOriginalExpr} onEnter={() => setOriginalAmountOpen(false)} calcEnabled={originalCalcEnabled} onToggleCalc={() => setOriginalCalcEnabled((c) => !c)} />
          <button
            type="button"
            onClick={() => setOriginalAmountOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold"
          >
            {t("done")}
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={balanceDateOpen} onOpenChange={setBalanceDateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("balanceAsOf")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground/50 -mt-2">
            {t("balanceDateHelpAdd")}
          </p>
          <DatePicker
            granularity="day"
            value={balanceDate}
            onChange={(v) => { setBalanceDate(v); setBalanceDateOpen(false); }}
            triggerClassName="w-full justify-between rounded-xl px-4 h-12 bg-[var(--dialog-content-background)] mt-0 mb-0"
          />
          <button
            type="button"
            onClick={() => setBalanceDateOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold"
          >
            {t("done")}
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={interestOpen} onOpenChange={setInterestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("interestRate")}</DialogTitle>
          </DialogHeader>
          <InterestRateField
            value={interestRate}
            onChange={setInterestRate}
            balance={result}
            payment={paymentVal}
          />
          <button
            type="button"
            onClick={() => setInterestOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold"
          >
            {t("done")}
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={iconColorOpen} onOpenChange={setIconColorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("iconColor")}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <PickerField label={t("icon")}>
                <IconPicker value={icon} onChange={setIcon} previewColor={color} />
              </PickerField>
            </div>
            <div className="flex-1">
              <PickerField label={t("color")}>
                <ColorPicker value={color} onChange={setColor} previewIcon={icon} />
              </PickerField>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RecurringMultiPicker
        bills={bills}
        selected={recurringIds}
        open={recurringOpen}
        onOpenChange={setRecurringOpen}
        onApply={applyRecurringIds}
      />

      {/* Explains that linking a bill also sets the minimum payment — shown the first
          time the picker is opened, and exempt from "Don't show again" (see tips.ts). */}
      <ContextualTip id="debtLinkedPayment" active={recurringOpen} />

      {/* Every control on this page, once, in the order you meet them — and replayable
          from the overflow menu. Suppressed while any sub-dialog is open so a card
          never points at a button hidden behind a sheet. */}
      <TipWalkthrough
        id="debtFormTour"
        steps={DEBT_TOUR_STEPS}
        active={!minPaymentOpen && !originalAmountOpen && !interestOpen && !noteOpen && !iconColorOpen && !recurringOpen && !recurringCatOpen && !balanceDateOpen}
        replayToken={tourToken}
      />

      {/* Mandatory category for the auto-created recurring bill. Choosing one enables
          "also create a recurring bill"; cancelling leaves it off. The app's one
          category picker — same sheet as the transaction and recurrence editors. */}
      <CategoryPickerSheet
        categories={categories}
        current={recurringCategoryId || undefined}
        open={recurringCatOpen}
        onOpenChange={setRecurringCatOpen}
        onChange={(v) => {
          // "" is the picker's Uncategorized/cleared value — a category is mandatory
          // here, so that leaves the toggle off rather than enabling it with none.
          setRecurringCategoryId(v);
          setAutoCreateBill(!!v);
          if (v) setRecurringIds([]);
        }}
      />
    </div>
  );
}
