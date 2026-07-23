"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconX,
  IconDots,
  IconCalculator,
  IconCheck,
  IconCoinEuro,
  IconWallet,
  IconCalendarEvent,
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
import { CategoryPicker } from "@/components/category-picker";
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
import { GOAL_COLORS, monthsUntil } from "./goal-shared";
import type { Category } from "@/db/schema";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// The savings-goal add form (behind /goals/add?type=savings) — full-screen calculator
// style, matching the add-transaction/debt-add pages. Editing an existing savings goal
// uses SavingsGoalEditDialog instead (see savings-goal-edit-dialog.tsx). Budget (expense)
// goals still use the older GoalForm — this component is savings-only.
export function SavingsGoalForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [expr, setExpr] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [monthlyExpr, setMonthlyExpr] = useState("");
  const [monthlyCalcEnabled, setMonthlyCalcEnabled] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [balanceExpr, setBalanceExpr] = useState("");
  const [balanceCalcEnabled, setBalanceCalcEnabled] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [iconColorOpen, setIconColorOpen] = useState(false);
  const [calcEnabled, setCalcEnabled] = useState(false);

  useEffect(() => acquireNavHidden(), []);

  const result = evaluateExpression(expr);
  const balanceVal = evaluateExpression(balanceExpr) ?? 0;
  const monthlyVal = evaluateExpression(monthlyExpr) ?? 0;
  const canSave = !loading && !!name.trim() && result !== null && result > 0;

  // When an end date is set, the monthly contribution is derived from it
  // (remaining amount ÷ months remaining) — takes priority over a manually entered value.
  const effectiveMonthlyContribution =
    endDate && result != null && result > 0
      ? Math.round((Math.max(0, result - balanceVal) / monthsUntil(endDate, startDate)) * 100) / 100
      : monthlyVal;

  const hasOps = expr.split("").some(isOperator);
  const bigDisplay = hasOps ? (result === null ? "0" : formatAmount(result)) : expr || "0";
  const isZeroDisplay = bigDisplay === "0";
  const amountChars = bigDisplay.split("");
  const press = (key: string) => setExpr((prev) => pressKey(prev, key));

  async function save() {
    if (!name.trim() || result === null || result <= 0) return;
    setLoading(true);
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalType: "savings",
        name: name.trim(),
        targetAmount: result,
        monthlyContribution: effectiveMonthlyContribution || null,
        currentAmount: balanceVal,
        categoryId: categoryId ? Number(categoryId) : null,
        recurrence: "none",
        startDate: startDate || null,
        endDate: endDate || null,
        color: color || null,
        icon: icon || null,
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
      {/* Header: close (left) + plain title (center) + overflow menu (right) */}
      <div className="flex items-center justify-between px-4 pt-[calc(var(--sat)+0.75rem)] pb-2 shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Close"
          className="glass-icon-btn size-11"
        >
          <IconX className="size-5 text-foreground" />
        </button>

        <h2 className="text-base font-semibold text-foreground">Savings goal</h2>

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
        {/* One card holding the icon/name, the target amount, the date/contribution/balance controls and the keypad */}
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
              placeholder="e.g. New car"
              className="w-full max-w-xs mx-auto text-center text-base font-medium text-foreground placeholder:text-foreground/30 bg-transparent outline-none"
            />
          </div>

          {/* Running target amount — fills the space between the name and the controls row */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            <LazyMotion features={domMax}>
              <m.div layout className="flex items-baseline justify-center">
                <m.span layout className="text-6xl font-bold text-foreground/40 shrink-0 mr-2">
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
                          isZeroDisplay ? "text-foreground/40" : "text-foreground",
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

          {/* Controls row: dates + monthly contribution (icon-only) on the left, starting balance (icon-only) on the right */}
          <div className="flex items-center justify-between gap-2 pb-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setDateOpen(true)}
                aria-label="Set start and end date"
                title="Start / end date"
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  endDate ? "bg-foreground text-background" : "bg-foreground/8 text-foreground active:bg-foreground/15",
                )}
              >
                <IconCalendarEvent className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setMonthlyOpen(true)}
                aria-label={effectiveMonthlyContribution ? `Monthly contribution ${formatEur(effectiveMonthlyContribution)}` : "Set monthly contribution"}
                title="Monthly contribution"
                className={cn(
                  "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                  effectiveMonthlyContribution ? "bg-foreground text-background" : "bg-foreground/8 text-foreground active:bg-foreground/15",
                )}
              >
                <IconCoinEuro className="size-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setBalanceOpen(true)}
              aria-label={balanceVal ? `Starting balance ${formatEur(balanceVal)}` : "Set starting balance"}
              title="Starting balance"
              className={cn(
                "size-11 rounded-full flex items-center justify-center transition-colors shrink-0",
                balanceVal ? "bg-foreground text-background" : "bg-foreground/8 text-foreground active:bg-foreground/15",
              )}
            >
              <IconWallet className="size-5" />
            </button>
          </div>

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

        {/* Category + save */}
        <div className="flex items-center justify-between gap-3 px-5 pb-[calc(var(--sab)+1.25rem)] shrink-0">
          <CategoryPicker
            categories={categories}
            current={categoryId}
            onChange={setCategoryId}
            placeholder="Category (optional)"
            showSelectedIcon
            triggerClassName="min-w-0 max-w-[60%] h-11 rounded-full bg-foreground/5 pl-3.5 pr-3 gap-2 text-sm font-medium"
          />
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

      <Dialog open={dateOpen} onOpenChange={setDateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground/60 mb-1.5">Start date</p>
              <DatePicker value={startDate} onChange={setStartDate} triggerClassName="w-full h-12 rounded-xl bg-foreground/5 px-3.5 mt-0 mb-0" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/60 mb-1.5">End date (optional)</p>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder="No end date"
                onClear={() => setEndDate("")}
                triggerClassName="w-full h-12 rounded-xl bg-foreground/5 px-3.5 mt-0 mb-0"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDateOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold mt-2"
          >
            Done
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={monthlyOpen} onOpenChange={setMonthlyOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Monthly contribution</DialogTitle>
          </DialogHeader>
          {endDate ? (
            <>
              <p className="text-sm text-foreground/50 -mt-2 mb-1">
                Auto-calculated from the end date ({formatEur(effectiveMonthlyContribution)}) — clear the end date to set this manually.
              </p>
              <p className="text-center text-3xl font-bold tabular-nums py-8 opacity-50">{formatEur(effectiveMonthlyContribution)}</p>
            </>
          ) : (
            <AmountKeypad expr={monthlyExpr} onChange={setMonthlyExpr} calcEnabled={monthlyCalcEnabled} onToggleCalc={() => setMonthlyCalcEnabled((c) => !c)} />
          )}
          <button
            type="button"
            onClick={() => setMonthlyOpen(false)}
            className="h-12 rounded-full bg-foreground text-background text-base font-semibold"
          >
            Done
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Starting balance</DialogTitle>
          </DialogHeader>
          <AmountKeypad expr={balanceExpr} onChange={setBalanceExpr} calcEnabled={balanceCalcEnabled} onToggleCalc={() => setBalanceCalcEnabled((c) => !c)} />
          <button
            type="button"
            onClick={() => setBalanceOpen(false)}
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
    </div>
  );
}
