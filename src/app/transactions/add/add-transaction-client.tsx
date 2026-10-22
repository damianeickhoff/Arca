"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAlertTriangle,
  IconArrowsRightLeft,
  IconBackspace,
  IconBuildingStore,
  IconCalculator,
  IconCamera,
  IconCheck,
  IconChevronDown,
  IconDivide,
  IconMinus,
  IconNote,
  IconPlus,
  IconTag,
  IconWallet,
  IconX,
} from "@tabler/icons-react";
import { refreshLayoutAction } from "@/app/actions/refresh-layout";
import { CategoryPickerSheet } from "@/components/category-picker";
import { DatePicker } from "@/components/date-picker";
import { Icon } from "@/components/icon";
import { AnchoredTip } from "@/components/anchored-tip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { Segmented } from "@/components/clear/segmented";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { TONE_FILL, type ClearTone } from "@/components/clear/tones";
import { ReceiptScanDialog, type ScannedReceipt } from "./receipt-scan-dialog";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useKeypadKeyboard } from "@/lib/use-keypad-keyboard";
import { isOperator, evaluateExpression, formatAmount, pressKey } from "@/lib/amount-expression";
import { financialMonthForDate, financialMonthRangeByMonth, type FinancialMonthConfig } from "@/lib/date-range";
import { currencySymbol, formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";
import type { ActivityContext } from "../_activity/context";
import { MoneyText } from "@/components/clear/money";

// Add transaction. Desktop: a centred dialog with the amount in a big input (it takes
// arithmetic too: "12,50+3"), the fields in a two-column grid and a receipt scan box.
// Phone: a full-screen page with the amount on top, the fields as chips and a keypad —
// with the calculator setting on, a column of ÷ × − + turns the amount into a live
// expression. Both save the same way; "Save and add another" keeps the form open.

type Mode = "expense" | "income" | "transfer";

export interface AccountOption {
  accountNumber: string;
  displayName: string | null;
  cardType: string | null;
  balance: number;
}

function accountLabel(a: AccountOption): string {
  return a.displayName ?? a.accountNumber;
}

/** A balance for the account list, e.g. "€492" or "−€12". */
function formatBalance(n: number): string {
  return `${n < 0 ? "−" : ""}${currencySymbol()}${formatAmount(Math.abs(Math.round(n)))}`;
}

// A stable pastel per account, so each account keeps its colour.
const AVATAR_TONES: ClearTone[] = ["peach", "sky", "mint", "lilac", "butter", "rose"];
function avatarTone(key: string): ClearTone {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function AccountAvatar({ account, className }: { account: AccountOption; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold", TONE_FILL[avatarTone(account.accountNumber)], className)}
    >
      {accountLabel(account).charAt(0).toUpperCase()}
    </span>
  );
}

/** Desktop amount typing → the keypad's characters (comma decimal, ÷ × − +). */
function normalizeTyped(value: string): string {
  return value
    .replace(/\*/g, "×")
    .replace(/\//g, "÷")
    .replace(/-/g, "−")
    .replace(/\./g, ",")
    .replace(/[^0-9,×÷−+]/g, "");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AddTransactionClient({
  categories,
  calculatorEnabled: initialCalculatorEnabled,
  accounts,
  financialMonth,
  budgets,
  budgetPeriod,
  receiptScan,
  openScanner = false,
}: {
  categories: Category[];
  calculatorEnabled: boolean;
  accounts: AccountOption[];
  financialMonth: FinancialMonthConfig;
  budgets: ActivityContext["budgets"];
  budgetPeriod?: ActivityContext["budgetPeriod"];
  /** The local AI server has a vision model (Settings › AI); without one there is no scan button. */
  receiptScan: boolean;
  /** Open the receipt scanner straight away — Home's "Scan receipt" quick action. */
  openScanner?: boolean;
}) {
  const t = useTranslations("transactions.add");
  const locale = useLocale();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const ids = useId();
  const amountRef = useRef<HTMLInputElement>(null);

  const [expr, setExpr] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO);
  // "transfer" = between two of the user's own accounts; it has no category.
  const [mode, setMode] = useState<Mode>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [accountNumber, setAccountNumber] = useState<string | null>(accounts[0]?.accountNumber ?? null);
  const [transferFrom, setTransferFrom] = useState<string | null>(accounts[0]?.accountNumber ?? null);
  const [transferTo, setTransferTo] = useState<string | null>(accounts[1]?.accountNumber ?? accounts[0]?.accountNumber ?? null);
  // Which account the shared account list is choosing.
  const [pickerFor, setPickerFor] = useState<"single" | "from" | "to" | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const [calcEnabled, setCalcEnabled] = useState(initialCalculatorEnabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [savedOne, setSavedOne] = useState(false);
  const [scanOpen, setScanOpen] = useState(openScanner);

  // The phone page is full screen: hide the tab bar while it is open.
  useEffect(() => {
    if (isDesktop) return;
    return acquireNavHidden();
  }, [isDesktop]);

  const direction: "expense" | "income" = mode === "income" ? "income" : "expense";
  const selectedAccount = accounts.find((a) => a.accountNumber === accountNumber);
  const fromAccount = accounts.find((a) => a.accountNumber === transferFrom);
  const toAccount = accounts.find((a) => a.accountNumber === transferTo);
  const modes: Mode[] = accounts.length > 1 ? ["expense", "income", "transfer"] : ["expense", "income"];

  const hasOps = expr.split("").some(isOperator);
  const result = evaluateExpression(expr);

  const relevantCats = categories.filter((c) => (direction === "income" ? c.group === "income" : c.group !== "income"));
  const selectedCategory = categories.find((c) => String(c.id) === categoryId);

  const canSave =
    !loading && result !== null && result > 0 &&
    (mode !== "transfer" || (!!transferFrom && !!transferTo && transferFrom !== transferTo));

  // ── What the amount does to the category's budget (expenses in the current period)
  const budget = mode === "expense" && selectedCategory ? budgets[selectedCategory.id] : undefined;
  const inPeriod = !!budgetPeriod && date >= budgetPeriod.from && date <= budgetPeriod.to;
  let budgetHint: { text: string; warn: boolean } | null = null;
  if (budget?.budget != null && budget.budget > 0 && inPeriod && selectedCategory) {
    const amount = result != null && result > 0 ? result : 0;
    const before = budget.spent;
    const after = before + amount;
    if (before > budget.budget) {
      budgetHint = {
        warn: true,
        text: t("budget.alreadyOver", { category: selectedCategory.name, over: formatEur(before - budget.budget), after: formatEur(after - budget.budget) }),
      };
    } else if (after > budget.budget) {
      budgetHint = { warn: true, text: t("budget.becomesOver", { category: selectedCategory.name, over: formatEur(after - budget.budget) }) };
    } else {
      budgetHint = { warn: false, text: t("budget.left", { category: selectedCategory.name, left: formatEur(budget.budget - after) }) };
    }
  }

  // ── Which financial month the date counts towards
  const month = financialMonthForDate(date, financialMonth);
  const monthRange = financialMonthRangeByMonth(month, financialMonth);
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, opts);
  const countsTowards = t("countsTowards", {
    month: fmt(`${month}-01`, { month: "long" }),
    from: fmt(monthRange.from, { day: "numeric", month: "short" }),
    to: fmt(monthRange.to, { day: "numeric", month: "short" }),
  });

  // "Today" / "Yesterday" / "Tomorrow", else "16 Jul" (with the year outside this one).
  function relativeDay(iso: string): string | null {
    const diff = Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${todayISO()}T12:00:00`).getTime()) / 86_400_000);
    return diff === 0 ? t("today") : diff === -1 ? t("yesterday") : diff === 1 ? t("tomorrow") : null;
  }
  const sameYear = date.slice(0, 4) === todayISO().slice(0, 4);
  const shortDate = fmt(date, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  const rel = relativeDay(date);
  const dateChipLabel = rel ?? shortDate;
  const dateFieldLabel = rel ? `${rel}, ${shortDate}` : fmt(date, sameYear ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });

  function close() {
    if (window.history.length > 1) router.back();
    else router.replace("/transactions");
  }

  function press(key: string) {
    setExpr((prev) => pressKey(prev, key));
  }

  function applyScan(fields: ScannedReceipt) {
    if (fields.name) setDescription(fields.name);
    if (fields.amount != null && fields.amount > 0) setExpr(String(fields.amount).replace(".", ","));
    if (fields.date) setDate(fields.date);
    if (fields.categoryId != null) setCategoryId(String(fields.categoryId));
  }

  // Income and expenses draw from different categories, and transfers have none.
  function selectMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setCategoryId("");
  }

  async function toggleCalculator() {
    const next = !calcEnabled;
    setCalcEnabled(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "add_transaction_calculator", value: next ? "1" : "0" }),
    });
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async function save(another = false) {
    if (!canSave || result === null) return;
    setLoading(true);
    setError(false);
    let ok: boolean;
    if (mode === "transfer") {
      // A transfer needs a row on each side to keep both balances right — the same
      // shape as imported transfers, where each bank reports its own side.
      const desc =
        description.trim() ||
        `${fromAccount ? accountLabel(fromAccount) : t("fallbackAccount")} → ${toAccount ? accountLabel(toAccount) : t("fallbackAccount")}`;
      const base = { date, amount: result, type: "variabel", categoryId: null, notes: notes.trim() || null, isManualTransfer: true, source: "manual" };
      const sides = await Promise.all([
        post({ ...base, description: desc, direction: "expense", account: transferFrom, counterAccount: transferTo }),
        post({ ...base, description: desc, direction: "income", account: transferTo, counterAccount: transferFrom }),
      ]);
      ok = sides.every(Boolean);
    } else {
      ok = await post({
        date,
        description: description.trim() || selectedCategory?.name || t("fallbackDescription"),
        amount: result,
        direction,
        type: direction === "income" ? "inkomen" : "variabel",
        categoryId: categoryId ? parseInt(categoryId) : null,
        notes: notes.trim() || null,
        account: accountNumber,
        source: "manual",
      });
    }
    // Balances changed: refresh the layout (the sidebar's accounts) too.
    await refreshLayoutAction();
    setLoading(false);
    if (!ok) {
      setError(true);
      return;
    }
    if (another) {
      // Keep the type, account and date — the next one is usually from the same day.
      setExpr("");
      setDescription("");
      setNotes("");
      setCategoryId("");
      setSavedOne(true);
      router.refresh();
      amountRef.current?.focus();
      return;
    }
    close();
    router.refresh();
  }

  // ── shared pieces ───────────────────────────────────────────────────────────

  const typeSwitch = (
    <Segmented
      label={t("type")}
      surface={isDesktop ? "tile" : "card"}
      value={mode}
      onChange={selectMode}
      items={modes.map((m) => ({ value: m, label: t(m) }))}
      className="flex w-full shrink-0 [&>button]:flex-1"
    />
  );

  const status = (error || savedOne) && (
    <p role="status" className={cn("m-0 text-[13px] font-semibold", error ? "text-clear-negative" : "text-clear-positive")}>
      {error ? t("saveFailed") : t("savedAnother")}
    </p>
  );

  const categoryIconTile = (c: Category | undefined, size: "sm" | "xs") =>
    c ? (
      <span aria-hidden className={cn("inline-flex shrink-0", size === "sm" ? "[&>*]:size-8!" : "[&>*]:size-7! [&>*]:rounded-full!")}>
        <Icon iconKey={c.icon} color={c.color} size="sm" glyphSize={size === "sm" ? 16 : 14} soft round={size === "xs"} />
      </span>
    ) : (
      <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center bg-clear-ground text-clear-muted", size === "sm" ? "size-8 rounded-clear-icon" : "size-7 rounded-full")}>
        <IconTag className="size-4" stroke={1.9} />
      </span>
    );

  // The sub-pickers. Inside the desktop dialog they open as nested dialogs.
  const pickers = (
    <>
      <CategoryPickerSheet
        categories={relevantCats}
        current={categoryId}
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        onChange={(v) => {
          setCategoryId(v === "none" ? "" : v);
          setCategoryOpen(false);
        }}
      />

      <Dialog open={pickerFor !== null} onOpenChange={(o) => !o && setPickerFor(null)}>
        <DialogContent hideHeaderRow title={pickerFor === "from" ? t("fromAccount") : pickerFor === "to" ? t("toAccount") : t("account")} className="gap-4 pt-7">
          <ClearDialogHeader
            title={pickerFor === "from" ? t("fromAccount") : pickerFor === "to" ? t("toAccount") : t("account")}
            onClose={() => setPickerFor(null)}
            closeLabel={t("close")}
          />
          <div role="listbox" aria-label={t("account")} className="flex flex-col gap-1">
            {accounts.map((a) => {
              const active =
                pickerFor === "from" ? a.accountNumber === transferFrom : pickerFor === "to" ? a.accountNumber === transferTo : a.accountNumber === accountNumber;
              return (
                <button
                  key={a.accountNumber}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    if (pickerFor === "from") setTransferFrom(a.accountNumber);
                    else if (pickerFor === "to") setTransferTo(a.accountNumber);
                    else setAccountNumber(a.accountNumber);
                    setPickerFor(null);
                  }}
                  className={cn(
                    "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-clear-row px-3 text-left transition-colors",
                    active ? "bg-clear-tile ring-2 ring-clear-ink ring-inset" : "hover:bg-clear-tile",
                  )}
                >
                  <AccountAvatar account={a} className="size-10 text-sm" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-bold">{accountLabel(a)}</span>
                    <span className="text-[13px] tabular-nums text-clear-muted"><MoneyText>{formatBalance(a.balance)}</MoneyText></span>
                  </span>
                  {active && (
                    <span aria-hidden className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink">
                      <IconCheck className="size-4" stroke={2.6} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ReceiptScanDialog open={scanOpen} onOpenChange={setScanOpen} onApply={applyScan} />
    </>
  );

  // ── desktop ─────────────────────────────────────────────────────────────────

  if (isDesktop) {
    const fieldButton =
      "flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-3.5 pl-2 text-left text-[15px] font-semibold text-clear-ink outline-none transition-colors focus-visible:border-clear-ink";
    const accountButton = (which: "single" | "from" | "to", account: AccountOption | undefined, id: string) => (
      <button id={id} type="button" onClick={() => setPickerFor(which)} className={fieldButton}>
        {account ? <AccountAvatar account={account} /> : <IconWallet className="ml-1.5 size-5 text-clear-muted" aria-hidden />}
        <span className={cn("min-w-0 flex-1 truncate", !account && "text-clear-placeholder")}>{account ? accountLabel(account) : t("chooseAccount")}</span>
        <IconChevronDown className="size-4 shrink-0 text-clear-muted" stroke={2.2} aria-hidden />
      </button>
    );

    return (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent
          hideHeaderRow
          title={t("title")}
          className="gap-5 pt-7 font-clear text-clear-ink"
          footer={
            <ClearDialogFooter destructive={status}>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={!canSave}
                data-tip-anchor="addTransactionAnother"
                className={clearButtonVariants({ variant: "secondary" })}
              >
                {t("saveAnother")}
              </button>
              <button type="submit" form={`${ids}-form`} disabled={!canSave} className={clearButtonVariants()}>
                {loading ? t("saving") : t("save")}
              </button>
            </ClearDialogFooter>
          }
        >
          <ClearDialogHeader title={t("title")} subtitle={countsTowards} onClose={close} closeLabel={t("close")} />

          <form
            id={`${ids}-form`}
            onSubmit={(e) => {
              e.preventDefault();
              save(false);
            }}
            className="flex flex-col gap-5"
          >
            {typeSwitch}

            {/* Amount: the big input, with the budget effect under it */}
            <div className="flex flex-col gap-1.5 rounded-clear-tile border-2 border-transparent bg-clear-tile px-[18px] py-4 transition-colors focus-within:border-clear-ember">
              <label htmlFor={`${ids}-amount`} className="text-[13px] font-bold text-clear-ink-2">
                {t("amount")}
              </label>
              <div className="flex items-center gap-1">
                <span aria-hidden className="clear-amount text-[48px] leading-none tracking-[-0.035em] text-clear-muted">
                  {currencySymbol()}
                </span>
                <input
                  ref={amountRef}
                  id={`${ids}-amount`}
                  inputMode="decimal"
                  autoComplete="off"
                  autoFocus
                  value={expr}
                  placeholder="0"
                  onChange={(e) => setExpr(normalizeTyped(e.target.value))}
                  className="clear-amount h-[60px] min-w-0 flex-1 bg-transparent p-0 text-[48px] leading-none tracking-[-0.035em] text-clear-ink outline-none placeholder:text-clear-placeholder"
                />
              </div>
              {hasOps && (
                <span className="text-[13px] font-semibold tabular-nums text-clear-ink-2">
                  <MoneyText>{result != null ? t("amountResult", { amount: formatEur(result) }) : t("amountInvalid")}</MoneyText>
                </span>
              )}
              {budgetHint && (
                <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold", budgetHint.warn ? "text-clear-warning" : "text-clear-muted")}>
                  {budgetHint.warn && <IconAlertTriangle className="size-4 shrink-0" stroke={2} aria-hidden />}
                  <MoneyText>{budgetHint.text}</MoneyText>
                </span>
              )}
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
              {mode === "transfer" ? (
                <>
                  <ClearField label={t("from")} htmlFor={`${ids}-from`} className="min-w-0">
                    {accountButton("from", fromAccount, `${ids}-from`)}
                  </ClearField>
                  <div className="relative min-w-0">
                    <ClearField label={t("to")} htmlFor={`${ids}-to`}>
                      {accountButton("to", toAccount, `${ids}-to`)}
                    </ClearField>
                    <button
                      type="button"
                      onClick={() => {
                        setTransferFrom(transferTo);
                        setTransferTo(transferFrom);
                      }}
                      aria-label={t("swap")}
                      title={t("swap")}
                      disabled={!transferFrom || !transferTo}
                      className="absolute bottom-2 -left-[22px] inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-clear-line bg-clear-card text-clear-ink transition-colors hover:bg-clear-tile disabled:opacity-40"
                    >
                      <IconArrowsRightLeft className="size-4" stroke={2} aria-hidden />
                    </button>
                  </div>
                  <ClearField label={t("description")} htmlFor={`${ids}-desc`} className="min-w-0">
                    <ClearInput id={`${ids}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} />
                  </ClearField>
                </>
              ) : (
                <>
                  <ClearField label={t("category")} htmlFor={`${ids}-category`} className="min-w-0">
                    <button id={`${ids}-category`} type="button" onClick={() => setCategoryOpen(true)} className={fieldButton}>
                      {categoryIconTile(selectedCategory, "sm")}
                      <span className={cn("min-w-0 flex-1 truncate", !selectedCategory && "text-clear-placeholder")}>
                        {selectedCategory?.name ?? t("chooseCategory")}
                      </span>
                      <IconChevronDown className="size-4 shrink-0 text-clear-muted" stroke={2.2} aria-hidden />
                    </button>
                  </ClearField>
                  <ClearField label={t("merchant")} htmlFor={`${ids}-merchant`} className="min-w-0">
                    <ClearInput
                      id={`${ids}-merchant`}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t("merchantPlaceholder")}
                      className="font-semibold"
                    />
                  </ClearField>
                  {selectedAccount && (
                    <ClearField label={t("account")} htmlFor={`${ids}-account`} className="min-w-0">
                      {accountButton("single", selectedAccount, `${ids}-account`)}
                    </ClearField>
                  )}
                </>
              )}
              <ClearField label={t("date")} htmlFor={`${ids}-date`} className={cn("min-w-0", mode !== "transfer" && !selectedAccount && "col-span-2")}>
                <DatePicker
                  value={date}
                  onChange={setDate}
                  label={dateFieldLabel}
                  triggerClassName="m-0 h-12 rounded-clear-row bg-clear-tile px-4 text-[15px] font-semibold text-clear-ink"
                />
              </ClearField>
              <ClearField label={t("note")} htmlFor={`${ids}-note`} className="col-span-2">
                <ClearInput id={`${ids}-note`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notePlaceholder")} />
              </ClearField>
            </div>

            {receiptScan && mode !== "transfer" && (
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="flex w-full cursor-pointer items-center gap-3.5 rounded-clear-tile border-2 border-dashed border-clear-line px-4 py-3.5 text-left transition-colors hover:bg-clear-tile"
              >
                <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-clear-tile text-clear-ink">
                  <IconCamera className="size-5" stroke={1.9} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-bold">{t("scanTitle")}</span>
                  <span className="text-[13px] text-clear-muted">{t("scanBody")}</span>
                </span>
              </button>
            )}
          </form>

          {pickers}
          <AnchoredTip id="addTransactionAnother" anchor="addTransactionAnother" />
        </DialogContent>
      </Dialog>
    );
  }

  // ── phone ───────────────────────────────────────────────────────────────────

  // The big figure: what was typed (or the expression's result), cents at half size.
  const shown = hasOps ? (result != null ? formatAmount(result) : "0") : expr || "0";
  const comma = shown.indexOf(",");
  const whole = comma === -1 ? shown : shown.slice(0, comma);
  const cents = comma === -1 ? "" : shown.slice(comma);
  const empty = !expr;

  const chip =
    "inline-flex h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-clear-card px-3 text-[13px] font-bold text-clear-ink transition-colors active:bg-clear-line [&_svg]:size-4 [&_svg]:shrink-0";

  return (
    <div className="fixed inset-0 z-40 flex flex-col gap-3 overflow-y-auto bg-clear-ground px-4 pt-[calc(var(--sat)+16px)] pb-[calc(var(--sab)+16px)] font-clear text-clear-ink lg:hidden">
      <header className="flex h-12 shrink-0 items-center justify-between">
        <button type="button" onClick={close} aria-label={t("close")} className="inline-flex size-12 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink">
          <IconX className="size-5" stroke={2} />
        </button>
        <h1 className="m-0 text-[17px] font-extrabold tracking-[-0.01em]">{t("phoneTitle")}</h1>
        <button
          type="button"
          onClick={toggleCalculator}
          aria-pressed={calcEnabled}
          aria-label={t("calculator")}
          title={t("calculator")}
          className={cn(
            "inline-flex size-12 cursor-pointer items-center justify-center rounded-full transition-colors",
            calcEnabled ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-card text-clear-ink",
          )}
        >
          <IconCalculator className="size-5" stroke={1.9} />
        </button>
      </header>

      {typeSwitch}

      <div className="flex shrink-0 flex-col items-center gap-1.5 pt-2.5 pb-1">
        <span className="text-[13px] font-bold text-clear-ink-2">{t("amount")}</span>
        <output aria-live="polite" className="clear-amount inline-flex items-center gap-1 text-[56px] leading-none tracking-[-0.035em]">
          <span className={cn(empty && "text-clear-placeholder", direction === "income" && !empty && "text-clear-positive")}>
            {currencySymbol()}
            {whole}
            {cents && <span className="text-[28px] text-clear-muted">{cents}</span>}
          </span>
          <span aria-hidden className="ml-0.5 h-[50px] w-[3px] animate-pulse rounded-full bg-clear-ember" />
        </output>
        {hasOps && <span className="text-[15px] font-semibold tabular-nums text-clear-muted">{expr}</span>}
        {budgetHint && (
          <span className={cn("inline-flex items-center gap-1.5 px-2 text-center text-[13px] font-semibold", budgetHint.warn ? "text-clear-warning" : "text-clear-muted")}>
            {budgetHint.warn && <IconAlertTriangle className="size-4 shrink-0" stroke={2} aria-hidden />}
            <MoneyText>{budgetHint.text}</MoneyText>
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap justify-center gap-2">
        {mode === "transfer" ? (
          <>
            <button type="button" onClick={() => setPickerFor("from")} className={chip}>
              {fromAccount ? <AccountAvatar account={fromAccount} className="-ml-1 size-7 text-xs" /> : <IconWallet aria-hidden />}
              <span className="truncate">{fromAccount ? t("fromChip", { name: accountLabel(fromAccount) }) : t("fromAccount")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTransferFrom(transferTo);
                setTransferTo(transferFrom);
              }}
              aria-label={t("swap")}
              disabled={!transferFrom || !transferTo}
              className={cn(chip, "w-11 justify-center px-0 disabled:opacity-40")}
            >
              <IconArrowsRightLeft aria-hidden />
            </button>
            <button type="button" onClick={() => setPickerFor("to")} className={chip}>
              {toAccount ? <AccountAvatar account={toAccount} className="-ml-1 size-7 text-xs" /> : <IconWallet aria-hidden />}
              <span className="truncate">{toAccount ? t("toChip", { name: accountLabel(toAccount) }) : t("toAccount")}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setCategoryOpen(true)}
              aria-label={t("categoryChip", { name: selectedCategory?.name ?? t("chooseCategory") })}
              className={cn(chip, "pl-2")}
            >
              {categoryIconTile(selectedCategory, "xs")}
              <span className={cn("truncate", !selectedCategory && "text-clear-ink-2")}>{selectedCategory?.name ?? t("category")}</span>
            </button>
            {selectedAccount && (
              <button type="button" onClick={() => setPickerFor("single")} aria-label={t("accountChip", { name: accountLabel(selectedAccount) })} className={chip}>
                <IconWallet aria-hidden />
                <span className="truncate">{accountLabel(selectedAccount)}</span>
              </button>
            )}
          </>
        )}
        <DatePicker
          value={date}
          onChange={setDate}
          label={dateChipLabel}
          triggerClassName={cn(chip, "m-0 w-auto gap-1.5")}
        />
        <button
          type="button"
          onClick={() => setMerchantOpen(true)}
          aria-label={mode === "transfer" ? t("description") : t("merchantChip", { name: description.trim() || t("merchant") })}
          className={chip}
        >
          {mode === "transfer" ? <IconNote aria-hidden /> : <IconBuildingStore aria-hidden />}
          <span className={cn("truncate", !description.trim() && "text-clear-ink-2")}>
            {description.trim() || (mode === "transfer" ? t("description") : t("merchant"))}
          </span>
        </button>
        <button type="button" onClick={() => setNoteOpen(true)} aria-label={notes.trim() ? t("editNote") : t("addNote")} className={cn(chip, "px-3.5", !notes.trim() && "text-clear-ink-2")}>
          {notes.trim() ? (
            <>
              <IconNote aria-hidden />
              <span className="max-w-32 truncate">{notes.trim()}</span>
            </>
          ) : (
            <>
              <IconPlus aria-hidden />
              {t("note")}
            </>
          )}
        </button>
        {receiptScan && mode !== "transfer" && (
          <button type="button" onClick={() => setScanOpen(true)} className={chip}>
            <IconCamera aria-hidden />
            {t("scanReceipt")}
          </button>
        )}
      </div>

      <div className="mt-auto shrink-0 pt-2">
        <Keypad
          onKey={press}
          onEnter={() => save(false)}
          calcEnabled={calcEnabled}
          labels={{
            keypad: t("keypad"),
            backspace: t("backspace"),
            divide: t("divide"),
            multiply: t("multiply"),
            subtract: t("subtract"),
            add: t("add"),
          }}
        />
      </div>

      <div className="flex shrink-0 flex-col gap-0.5">
        {status && <div className="pb-1 text-center">{status}</div>}
        <button type="button" onClick={() => save(false)} disabled={!canSave} className={cn(clearButtonVariants(), "h-14 w-full text-base")}>
          {loading ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          onClick={() => save(true)}
          disabled={!canSave}
          data-tip-anchor="addTransactionAnother"
          className={cn(clearButtonVariants({ variant: "ghost" }), "w-full")}
        >
          {t("saveAnother")}
        </button>
      </div>

      {pickers}

      <TextDialog
        open={merchantOpen}
        onOpenChange={setMerchantOpen}
        title={mode === "transfer" ? t("description") : t("merchant")}
        placeholder={mode === "transfer" ? t("descriptionPlaceholder") : t("merchantPlaceholder")}
        value={description}
        onSave={setDescription}
        doneLabel={t("done")}
        closeLabel={t("close")}
      />
      <TextDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title={t("note")}
        placeholder={t("notePlaceholder")}
        value={notes}
        onSave={setNotes}
        doneLabel={t("done")}
        closeLabel={t("close")}
        multiline
      />
      <AnchoredTip id="addTransactionAnother" anchor="addTransactionAnother" />
    </div>
  );
}

// ── the phone's keypad ─────────────────────────────────────────────────────────

const KEY =
  "inline-flex h-14 cursor-pointer items-center justify-center rounded-clear-tile bg-clear-card text-[26px] font-bold tabular-nums text-clear-ink transition-colors select-none active:bg-clear-line [@media(min-height:780px)]:h-16";

/** Phone-order digits (1 2 3 on top), comma, 0 and backspace; with the calculator on,
 *  a column of ÷ × − +. A hardware keyboard works too (useKeypadKeyboard). */
function Keypad({
  onKey,
  onEnter,
  calcEnabled,
  labels,
}: {
  onKey: (key: string) => void;
  onEnter: () => void;
  calcEnabled: boolean;
  labels: { keypad: string; backspace: string; divide: string; multiply: string; subtract: string; add: string };
}) {
  const rootRef = useKeypadKeyboard({ calcEnabled, onKey, onEnter });
  const ops: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "÷", label: labels.divide, icon: <IconDivide className="size-6" /> },
    { key: "×", label: labels.multiply, icon: <IconX className="size-6" /> },
    { key: "−", label: labels.subtract, icon: <IconMinus className="size-6" /> },
    { key: "+", label: labels.add, icon: <IconPlus className="size-6" /> },
  ];
  return (
    <div ref={rootRef} role="group" aria-label={labels.keypad} className="flex gap-2">
      <div className="grid flex-1 grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0"].map((k) => (
          <button key={k} type="button" onClick={() => onKey(k)} className={KEY}>
            {k}
          </button>
        ))}
        <button type="button" onClick={() => onKey("back")} aria-label={labels.backspace} className={KEY}>
          <IconBackspace className="size-6" stroke={1.9} />
        </button>
      </div>
      {calcEnabled && (
        <div className="grid w-16 grid-cols-1 gap-2">
          {ops.map((op) => (
            <button key={op.key} type="button" onClick={() => onKey(op.key)} aria-label={op.label} className={cn(KEY, "bg-clear-tile")}>
              {op.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A one-field sheet (merchant, note) for the phone page; Enter saves. */
function TextDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  value,
  onSave,
  doneLabel,
  closeLabel,
  multiline = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder: string;
  value: string;
  onSave: (value: string) => void;
  doneLabel: string;
  closeLabel: string;
  multiline?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideHeaderRow title={title} className="gap-5 pt-7">
        <ClearDialogHeader title={title} onClose={() => onOpenChange(false)} closeLabel={closeLabel} />
        {open && (
          <TextDialogBody
            initial={value}
            placeholder={placeholder}
            multiline={multiline}
            doneLabel={doneLabel}
            onDone={(v) => {
              onSave(v);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TextDialogBody({
  initial,
  placeholder,
  multiline,
  doneLabel,
  onDone,
}: {
  initial: string;
  placeholder: string;
  multiline: boolean;
  doneLabel: string;
  onDone: (value: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(draft);
      }}
      className="flex flex-col gap-5"
    >
      {multiline ? (
        <textarea
          rows={4}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter saves; Shift+Enter starts a new line.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onDone(draft);
            }
          }}
          placeholder={placeholder}
          className="w-full resize-none rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 py-3 font-clear text-[15px] text-clear-ink outline-none transition-colors placeholder:text-clear-placeholder focus:border-clear-ink"
        />
      ) : (
        <ClearInput autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
      )}
      <button type="submit" className={cn(clearButtonVariants(), "w-full")}>
        {doneLabel}
      </button>
    </form>
  );
}
