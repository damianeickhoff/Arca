"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  IconRepeat,
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
import { formatEur, currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecurringItem } from "@/db/schema";

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// The debt add form (behind /debts/add) — full-screen calculator style, matching the
// add-transaction page. Editing an existing debt uses DebtEditDialog instead (see
// debt-edit-dialog.tsx), which matches the recurring-item edit dialog's row-list style.
export function DebtForm({ bills }: { bills: RecurringItem[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [direction, setDirection] = useState<"owe" | "owed">("owe");
  const [name, setName] = useState("");
  const [expr, setExpr] = useState("");
  const [startMonth, setStartMonth] = useState(currentYearMonth());
  const [paymentExpr, setPaymentExpr] = useState("");
  const [paymentCalcEnabled, setPaymentCalcEnabled] = useState(false);
  const [minPaymentOpen, setMinPaymentOpen] = useState(false);
  // Optional true original amount, when it's larger than the balance above because
  // tracking started after some of the debt was already paid off.
  const [originalExpr, setOriginalExpr] = useState("");
  const [originalCalcEnabled, setOriginalCalcEnabled] = useState(false);
  const [originalAmountOpen, setOriginalAmountOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState("#ef4444");
  const [iconColorOpen, setIconColorOpen] = useState(false);
  const [recurringIds, setRecurringIds] = useState<number[]>([]);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [calcEnabled, setCalcEnabled] = useState(false);
  // When on, saving also creates a monthly recurring bill from this debt's own name +
  // minimum payment + start month, and links it — so you don't have to fill it in twice.
  const [autoCreateBill, setAutoCreateBill] = useState(false);

  useEffect(() => acquireNavHidden(), []);

  const result = evaluateExpression(expr);
  const paymentVal = evaluateExpression(paymentExpr);
  const originalVal = evaluateExpression(originalExpr);
  const canSave = !loading && !!name.trim() && result !== null && result > 0;
  const selectedBills = recurringIds.map((id) => bills.find((b) => b.id === id)).filter((b): b is RecurringItem => !!b);

  const hasOps = expr.split("").some(isOperator);
  const bigDisplay = hasOps ? (result === null ? "0" : formatAmount(result)) : expr || "0";
  const isZeroDisplay = bigDisplay === "0";
  const amountChars = bigDisplay.split("");
  const press = (key: string) => setExpr((prev) => pressKey(prev, key));

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
        startMonth,
        color: color || null,
        icon: icon || null,
        notes: notes.trim() || null,
        recurringIds,
        createRecurringBill: autoCreateBill,
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
      {/* Header: close (left) + direction toggle (center) + overflow menu (right) */}
      <div className="flex items-center justify-between px-4 pt-[calc(var(--sat)+0.75rem)] pb-2 shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Close"
          className="glass-icon-btn size-11"
        >
          <IconX className="size-5 text-foreground" />
        </button>

        {/* Direction — same segmented-pill style as the Weekly/Monthly toggle on the
            budget page: the active option expands to show its label, the inactive one
            collapses down to just its badge. */}
        <div className="inline-flex items-center gap-1 rounded-full bg-foreground/8 p-1">
          {(
            [
              { key: "owe", label: "I owe", Icon: IconTrendingDown },
              { key: "owed", label: "I am owed", Icon: IconTrendingUp },
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
            aria-label="More options"
            className="glass-icon-btn size-11"
          >
            <IconDots className="size-5 text-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="min-w-56 w-auto p-1.5">
            <DropdownMenuItem closeOnClick={false} onClick={() => setCalcEnabled((c) => !c)} className="gap-2.5 py-2.5">
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
        {/* One card holding the icon/name, the amount, the date/payment/note controls and the keypad */}
        <div className="relative overflow-hidden flex-1 flex flex-col min-h-0 mx-4 mb-3 rounded-3xl bg-foreground/[0.03] p-4">
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
              aria-label="Choose icon and color"
              className="size-14 rounded-full flex items-center justify-center active:scale-[0.96] transition-transform"
              style={{ backgroundColor: icon ? undefined : "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
            >
              <Icon iconKey={icon} color={color} size="xl" round />
            </button>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={direction === "owe" ? "e.g. Credit card" : "e.g. Loan to Alex"}
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
          </div>

          {/* Controls row: start month + minimum payment (icon-only) on the left, note on the right */}
          <div className="flex items-center justify-between gap-2 pb-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <DatePicker
                value={startMonth}
                onChange={setStartMonth}
                granularity="month"
                label={formatMonthLabel(startMonth)}
                triggerClassName="mt-0 mb-0 h-11 w-auto rounded-full bg-foreground/8 px-4 gap-2"
              />
              <button
                type="button"
                onClick={() => setMinPaymentOpen(true)}
                aria-label={paymentVal ? `Minimum payment ${formatEur(paymentVal)}` : "Set minimum monthly payment"}
                title="Minimum monthly payment"
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  paymentVal ? "bg-foreground text-background" : "glass-icon-btn text-foreground",
                )}
              >
                <IconCoinEuro className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setOriginalAmountOpen(true)}
                aria-label={originalVal ? `Original amount ${formatEur(originalVal)}` : "Set original debt amount"}
                title="Original debt amount"
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  originalVal ? "bg-foreground text-background" : "glass-icon-btn text-foreground",
                )}
              >
                <IconReceipt2 className="size-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoCreateBill((v) => {
                  const next = !v;
                  if (next) setRecurringIds([]);
                  return next;
                })}
                aria-label={autoCreateBill ? "Recurring bill will be created" : "Also create a recurring bill"}
                title="Also create a recurring bill from this debt"
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  autoCreateBill ? "bg-foreground text-background" : "glass-icon-btn text-foreground",
                )}
              >
                <IconRepeat className="size-5" />
              </button>
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
          </div>

          {autoCreateBill && (
            <p className="px-1 -mt-1 mb-2 text-xs text-foreground/50 shrink-0">
              Will also create a monthly recurring bill named &quot;{name.trim() || "…"}&quot; for {paymentVal ? formatEur(paymentVal) : "the minimum payment"}.
            </p>
          )}

          {/* Keypad — 3-column digits, plus a 4th operator column when the calculator is on */}
          <div className="flex gap-2 shrink-0">
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
              <button type="button" onClick={() => press("back")} aria-label="Backspace" className={digitKey}>
                <IconBackspace className="size-6" />
              </button>
            </div>

            {calcEnabled && (
              <div className="grid grid-cols-1 gap-2 w-16">
                <button type="button" onClick={() => press("÷")} aria-label="Divide" className={opKey}>
                  <IconDivide className="size-6" />
                </button>
                <button type="button" onClick={() => press("×")} aria-label="Multiply" className={opKey}>
                  <IconMultiply className="size-6" />
                </button>
                <button type="button" onClick={() => press("−")} aria-label="Subtract" className={opKey}>
                  <IconMinus className="size-6" />
                </button>
                <button type="button" onClick={() => press("+")} aria-label="Add" className={opKey}>
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
            disabled={autoCreateBill}
            title={autoCreateBill ? "Turn off \"Also create a recurring bill\" to link an existing one instead" : undefined}
            className="min-w-0 max-w-[60%] h-11 rounded-full bg-foreground/5 pl-3.5 pr-3 gap-2 text-sm font-medium flex items-center disabled:opacity-40 disabled:pointer-events-none"
          >
            {selectedBills.length === 0 ? (
              <span className="text-foreground/50 truncate">Linked recurring bills</span>
            ) : (
              <span className="truncate">
                {selectedBills.length === 1 ? selectedBills[0].name : `${selectedBills.length} recurring bills`}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="h-11 px-7 rounded-full bg-foreground text-background text-sm font-semibold shadow-floating active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none shrink-0"
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
            placeholder="Add a note for this debt"
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

      <Dialog open={minPaymentOpen} onOpenChange={setMinPaymentOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Minimum monthly payment</DialogTitle>
          </DialogHeader>
          <AmountKeypad expr={paymentExpr} onChange={setPaymentExpr} calcEnabled={paymentCalcEnabled} onToggleCalc={() => setPaymentCalcEnabled((c) => !c)} />
          <button
            type="button"
            onClick={() => setMinPaymentOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold"
          >
            Done
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={originalAmountOpen} onOpenChange={setOriginalAmountOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Original debt amount</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground/50 -mt-2">
            Optional — only needed if you started tracking this debt after already paying some of it off. Leave blank to use the balance above as the total.
          </p>
          <AmountKeypad expr={originalExpr} onChange={setOriginalExpr} calcEnabled={originalCalcEnabled} onToggleCalc={() => setOriginalCalcEnabled((c) => !c)} />
          <button
            type="button"
            onClick={() => setOriginalAmountOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold"
          >
            Done
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={iconColorOpen} onOpenChange={setIconColorOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Icon &amp; color</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <PickerField label="Icon">
                <IconPicker value={icon} onChange={setIcon} previewColor={color} />
              </PickerField>
            </div>
            <div className="flex-1">
              <PickerField label="Color">
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
        onApply={setRecurringIds}
      />
    </div>
  );
}
