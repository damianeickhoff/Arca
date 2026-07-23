"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconX,
  IconDots,
  IconCalculator,
  IconNote,
  IconArrowUpRight,
  IconArrowDownLeft,
  IconArrowsRightLeft,
  IconCheck,
  IconCamera,
} from "@tabler/icons-react";
import { CategoryPicker } from "@/components/category-picker";
import { DatePicker } from "@/components/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { NumericKeypad } from "@/components/numeric-keypad";
import { ReceiptScanDialog, type ScannedReceipt } from "./receipt-scan-dialog";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { m, AnimatePresence, LazyMotion, domMax, easeOutQuart } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { isOperator, evaluateExpression, formatAmount, pressKey } from "@/lib/amount-expression";
import { currencySymbol } from "@/lib/format";
import type { Category } from "@/db/schema";

// The add-transaction page, rebuilt as a calculator-style keypad instead of the
// stacked-field form. A description input + big running amount sit up top; a custom
// numeric keypad drives the amount and — when the calculator is toggled on (a
// persisted app setting) — a column of ÷ × − + operators lets the amount be a live
// arithmetic expression. Date + expense/income live above the keypad, a note dialog
// hangs off its right edge, and category + save sit along the bottom.

// A euro balance for the account pill/list, e.g. "€492" or "−€12".
function formatBalance(n: number): string {
  return `${n < 0 ? "−" : ""}${currencySymbol()}${formatAmount(Math.abs(Math.round(n)))}`;
}

export interface AccountOption {
  accountNumber: string;
  displayName: string | null;
  cardType: string | null;
  balance: number;
}

function accountLabel(a: AccountOption): string {
  return a.displayName ?? a.accountNumber;
}

// Deterministic avatar tint from the account key, so each account keeps a stable color.
const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
function avatarColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function AccountAvatar({ account, className }: { account: AccountOption; className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full text-white font-semibold shrink-0",
        avatarColor(account.accountNumber),
        className,
      )}
    >
      {accountLabel(account).charAt(0).toUpperCase()}
    </span>
  );
}

// Relative label for the date pill: "Today"/"Yesterday"/"Tomorrow", otherwise
// "16 Jul" — and only appends the year when it isn't the current one.
function formatDateLabel(dateStr: string): string {
  const [y, mo, da] = dateStr.split("-").map(Number);
  const d = new Date(y, (mo || 1) - 1, da || 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString("en-GB", sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
}

export function AddTransactionClient({
  categories,
  calculatorEnabled: initialCalculatorEnabled,
  accounts,
}: {
  categories: Category[];
  calculatorEnabled: boolean;
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const now = new Date().toISOString().split("T")[0];

  const [expr, setExpr] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(now);
  // "transfer" = an internal (own-account to own-account) transaction — see the
  // transfer-specific block below; it has no direction/category of its own.
  const [mode, setMode] = useState<"expense" | "income" | "transfer">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState<string | null>(accounts[0]?.accountNumber ?? null);
  const [transferFrom, setTransferFrom] = useState<string | null>(accounts[0]?.accountNumber ?? null);
  const [transferTo, setTransferTo] = useState<string | null>(accounts[1]?.accountNumber ?? accounts[0]?.accountNumber ?? null);
  // Which account picker the shared "Account" dialog below is currently serving.
  const [pickerFor, setPickerFor] = useState<"single" | "from" | "to" | null>(null);
  const [calcEnabled, setCalcEnabled] = useState(initialCalculatorEnabled);
  const [loading, setLoading] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const direction: "expense" | "income" = mode === "income" ? "income" : "expense";
  const selectedAccount = accounts.find((a) => a.accountNumber === accountNumber);
  const fromAccount = accounts.find((a) => a.accountNumber === transferFrom);
  const toAccount = accounts.find((a) => a.accountNumber === transferTo);

  // Hide the bottom nav while this full-screen page is open.
  useEffect(() => acquireNavHidden(), []);

  const hasOps = expr.split("").some(isOperator);
  const result = evaluateExpression(expr);
  const bigDisplay = hasOps ? (result === null ? "0" : formatAmount(result)) : expr || "0";
  const isZeroDisplay = bigDisplay === "0";
  const amountChars = bigDisplay.split("");

  const expenseCats = categories.filter((c) => c.group !== "income");
  const incomeCats = categories.filter((c) => c.group === "income");
  const relevantCats = direction === "income" ? incomeCats : expenseCats;
  const selectedCategory = categories.find((c) => String(c.id) === categoryId);

  const canSave =
    !loading && result !== null && result > 0 &&
    (mode !== "transfer" || (!!transferFrom && !!transferTo && transferFrom !== transferTo));

  function press(key: string) {
    setExpr((prev) => pressKey(prev, key));
  }

  function applyScan(fields: ScannedReceipt) {
    if (fields.name) setDescription(fields.name);
    if (fields.amount != null && fields.amount > 0) setExpr(String(fields.amount).replace(".", ","));
    if (fields.date) setDate(fields.date);
    if (fields.categoryId != null) setCategoryId(String(fields.categoryId));
  }

  // Switching mode clears the picked category — income/expense draw from different
  // category sets, and transfers have no category at all.
  function selectMode(next: "expense" | "income" | "transfer") {
    if (next === mode) return;
    setMode(next);
    setCategoryId("");
  }

  function swapTransferAccounts() {
    setTransferFrom(transferTo);
    setTransferTo(transferFrom);
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

  async function save() {
    if (result === null || result <= 0) return;
    if (mode === "transfer" && (!transferFrom || !transferTo || transferFrom === transferTo)) return;
    setLoading(true);
    if (mode === "transfer") {
      // A transfer moves money between two of the user's own accounts, so it needs
      // a row on each side to keep both account balances correct — mirroring what
      // CSV-imported transfers look like (each bank reports its own side).
      const desc = description.trim() || `${fromAccount ? accountLabel(fromAccount) : "Account"} → ${toAccount ? accountLabel(toAccount) : "Account"}`;
      const base = { date, amount: result, type: "variabel", categoryId: null, notes: notes.trim() || null, isManualTransfer: true, source: "manual" };
      await Promise.all([
        fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, description: desc, direction: "expense", account: transferFrom, counterAccount: transferTo }),
        }),
        fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, description: desc, direction: "income", account: transferTo, counterAccount: transferFrom }),
        }),
      ]);
      setLoading(false);
      router.back();
      router.refresh();
      return;
    }
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        description: description.trim() || selectedCategory?.name || "Transaction",
        amount: result,
        direction,
        type: direction === "income" ? "inkomen" : "variabel",
        categoryId: categoryId ? parseInt(categoryId) : null,
        notes: notes.trim() || null,
        account: accountNumber,
        source: "manual",
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
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header: close (left) + overflow menu (right). Currency button intentionally omitted. */}
      <div className="flex items-center justify-between px-4 pt-[calc(var(--sat)+0.75rem)] pb-2 shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Close"
          className="glass-icon-btn size-11"
        >
          <IconX className="size-5 text-foreground" />
        </button>

        {/* Expense / income / transfer segmented toggle — same pill styling as the
            Weekly/Monthly period toggle in the budget dialog (see PeriodToggle in
            budget-portal.tsx): active side shows an icon + label in a raised pill,
            the other sides just a muted icon badge. */}
        <div className="inline-flex items-center gap-1 rounded-full bg-card p-1">
          {(accounts.length > 1 ? (["expense", "income", "transfer"] as const) : (["expense", "income"] as const)).map((m) => {
            const active = mode === m;
            const Icon = m === "expense" ? IconArrowUpRight : m === "income" ? IconArrowDownLeft : IconArrowsRightLeft;
            const label = m === "expense" ? "Expense" : m === "income" ? "Income" : "Transfer";
            return (
              <button
                key={m}
                type="button"
                onClick={() => selectMode(m)}
                aria-label={label}
                className={cn(
                  "flex items-center gap-2 rounded-full transition-all duration-200",
                  active ? "bg-foreground/10 py-1 pl-1 pr-3.5" : "py-1 px-1",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center size-8 rounded-full shrink-0 transition-colors",
                    active ? "bg-foreground text-background" : "bg-foreground/8 text-foreground/45",
                  )}
                >
                  <Icon className="size-4.5" />
                </span>
                {active && (
                  <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                    {label}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More options"
            className="glass-icon-btn size-11"
          >
            <IconDots className="size-5 text-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="min-w-56 w-auto p-1.5">
            <DropdownMenuItem closeOnClick={false} onClick={toggleCalculator} className="gap-2.5 py-2.5">
              <IconCalculator className="size-4.5" />
              <span className="flex-1">Calculator</span>
              {calcEnabled && <IconCheck className="size-4 text-foreground/60" />}
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
        {/* One card holding the amount, the date/direction/note controls and the keypad */}
        <div className="flex-1 flex flex-col min-h-0 mx-4 mb-3 rounded-3xl bg-foreground/[0.03] p-4">
          {/* Account pill in the top-left corner of the card (only when accounts exist) */}
          {mode !== "transfer" && selectedAccount && (
            <button
              type="button"
              onClick={() => setPickerFor("single")}
              className="self-start shrink-0 flex items-center gap-2.5 rounded-full bg-foreground/8 pl-1.5 pr-3.5 py-1.5 active:bg-foreground/12 transition-colors"
            >
              <AccountAvatar account={selectedAccount} className="size-9 text-sm" />
              <span className="text-left leading-tight">
                <span className="block text-sm font-semibold text-foreground">{accountLabel(selectedAccount)}</span>
                <span className="block text-xs text-foreground/50 tabular-nums">{formatBalance(selectedAccount.balance)}</span>
              </span>
            </button>
          )}

          {/* Transfer mode: From/To account pills stacked with a swap button between them */}
          {mode === "transfer" && (
            <div className="relative shrink-0 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setPickerFor("from")}
                className="flex items-center gap-2.5 rounded-2xl bg-foreground/8 pl-1.5 pr-3.5 py-1.5 active:bg-foreground/12 transition-colors"
              >
                {fromAccount ? (
                  <>
                    <AccountAvatar account={fromAccount} className="size-9 text-sm" />
                    <span className="text-left leading-tight">
                      <span className="block text-xs text-foreground/50">From</span>
                      <span className="block text-sm font-semibold text-foreground">{accountLabel(fromAccount)}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-foreground/50 px-2 py-1">Select account</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPickerFor("to")}
                className="flex items-center gap-2.5 rounded-2xl bg-foreground/8 pl-1.5 pr-3.5 py-1.5 active:bg-foreground/12 transition-colors"
              >
                {toAccount ? (
                  <>
                    <AccountAvatar account={toAccount} className="size-9 text-sm" />
                    <span className="text-left leading-tight">
                      <span className="block text-xs text-foreground/50">To</span>
                      <span className="block text-sm font-semibold text-foreground">{accountLabel(toAccount)}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-foreground/50 px-2 py-1">Select account</span>
                )}
              </button>
              <button
                type="button"
                onClick={swapTransferAccounts}
                aria-label="Swap accounts"
                disabled={!transferFrom || !transferTo}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-8 rounded-full bg-background border border-foreground/10 flex items-center justify-center shadow-floating active:scale-[0.94] transition-transform disabled:opacity-40"
              >
                <IconArrowsRightLeft className="size-4 rotate-90" />
              </button>
            </div>
          )}

          {/* Description near the top; the amount fills — and stays centered in — the space below it.
              When the account pill is present it sits above the description, pushing it lower. */}
          <div className="flex-1 flex flex-col min-h-0 px-2">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              className="w-full max-w-xs mx-auto shrink-0 pt-6 text-center text-base text-foreground placeholder:text-foreground/30 bg-transparent outline-none"
            />
            <div className="flex-1 flex flex-col items-center justify-center min-h-0">
              {/* Layout + popLayout need domMax, which the app-wide provider doesn't load —
                  so scope it to this subtree. The euro sign sits in the same layout flow
                  as the digits, so it glides sideways as the number's width changes; each
                  digit blurs in from above and, when deleted, falls away blurred. */}
              <LazyMotion features={domMax}>
                <m.div layout className="flex items-baseline justify-center">
                  <m.span
                    layout
                    className={cn(
                      "text-6xl shrink-0 font-medium mr-2",
                      direction === "income" ? "text-emerald-400/40" : "text-foreground/40",
                    )}
                  >
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
                            "inline-block text-6xl font-medium tabular-nums",
                            direction === "income"
                              ? isZeroDisplay ? "text-emerald-400" : "text-emerald-400"
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
              {hasOps && (
                <div className="mt-3 text-base text-foreground/40 tabular-nums">{expr}</div>
              )}
            </div>
          </div>

          {/* Controls row: date (left), note (right) — direction now lives in the header */}
          <div className="flex items-center justify-between gap-2 pb-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <DatePicker
                value={date}
                onChange={setDate}
                label={formatDateLabel(date)}
                triggerClassName="mt-0 mb-0 h-11 w-auto rounded-full bg-foreground/8 px-4 gap-2"
              />
              {mode !== "transfer" && (
                <button
                  type="button"
                  onClick={() => setScanOpen(true)}
                  aria-label="Scan receipt"
                  title="Scan receipt"
                  className="glass-icon-btn size-11 text-foreground shrink-0"
                >
                  <IconCamera className="size-5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              aria-label="Add note"
              className={cn(
                "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                notes.trim() ? "bg-foreground text-background" : "glass-icon-btn text-foreground",
              )}
            >
              <IconNote className="size-5" />
            </button>
          </div>

          {/* Keypad — 3-column digits, plus a 4th operator column when the calculator is on */}
          <div className="shrink-0">
            <NumericKeypad onKey={press} calcEnabled={calcEnabled} digitClassName={digitKey} opClassName={opKey} />
          </div>
        </div>

        {/* Category + save (transfers have no category, so Save spans the full width) */}
        <div className="flex items-center justify-between gap-3 px-5 pb-[calc(var(--sab)+1.25rem)] shrink-0">
          {mode !== "transfer" && (
            <CategoryPicker
              categories={relevantCats}
              current={categoryId}
              onChange={setCategoryId}
              placeholder="Select category"
              showSelectedIcon
              triggerClassName="min-w-0 max-w-[60%] h-11 rounded-full bg-foreground/5 pl-3.5 pr-3 gap-2 text-sm font-medium"
            />
          )}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={cn(
              "h-11 px-7 rounded-full bg-foreground text-background text-sm font-semibold shadow-floating active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none shrink-0",
              mode === "transfer" && "flex-1",
            )}
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </m.div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Note</DialogTitle>
          </DialogHeader>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note for this transaction"
            rows={4}
            autoFocus
            className="w-full rounded-xl bg-foreground/5 p-3.5 text-sm text-foreground placeholder:text-foreground/40 outline-none resize-none"
          />
          <button
            type="button"
            onClick={() => setNoteOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold"
          >
            Done
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={pickerFor !== null} onOpenChange={(o) => !o && setPickerFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{pickerFor === "from" ? "From account" : pickerFor === "to" ? "To account" : "Account"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            {accounts.map((a) => {
              const active = pickerFor === "from" ? a.accountNumber === transferFrom
                : pickerFor === "to" ? a.accountNumber === transferTo
                : a.accountNumber === accountNumber;
              return (
                <button
                  key={a.accountNumber}
                  type="button"
                  onClick={() => {
                    if (pickerFor === "from") setTransferFrom(a.accountNumber);
                    else if (pickerFor === "to") setTransferTo(a.accountNumber);
                    else setAccountNumber(a.accountNumber);
                    setPickerFor(null);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    active ? "bg-foreground/8" : "hover:bg-foreground/5",
                  )}
                >
                  <AccountAvatar account={a} className="size-10 text-base" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-foreground truncate">{accountLabel(a)}</span>
                    <span className="block text-xs text-foreground/50 tabular-nums">{formatBalance(a.balance)}</span>
                  </span>
                  {active && <IconCheck className="size-5 text-foreground/60 shrink-0" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ReceiptScanDialog open={scanOpen} onOpenChange={setScanOpen} onApply={applyScan} />
    </div>
  );
}
