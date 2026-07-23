"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconLinkFilled as Link2
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatEur, formatDate, currencySymbol } from "@/lib/format";

interface Suggestion {
  id: number;
  date: string;
  amount: number;
  expectedReimbursement: number | null;
  description: string;
  categoryName: string | null;
  categoryColor: string | null;
  alreadyLinked: number;
}

interface Props {
  tikkie: {
    id: number;
    amount: number;
    description: string;
    date: string;
    allocatedAmount: number;
  };
}

export function LinkDialog({ tikkie }: Props) {
  const router = useRouter();
  const remainingBalance = tikkie.amount - tikkie.allocatedAmount;

  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<Suggestion | null>(null);
  // How much of THIS TIKKIE goes to the selected expense
  const [tikkiePortion, setTikkiePortion] = useState("");
  // Total expected back from the expense (may differ if multiple Tikkies cover it)
  const [expectedBack, setExpectedBack] = useState("");
  const [linking, setLinking] = useState(false);

  async function handleOpen() {
    setOpen(true);
    setConfirming(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/reimbursements/suggestions?transactionId=${tikkie.id}`);
      setSuggestions(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function selectExpense(s: Suggestion) {
    setConfirming(s);
    // Default expected back = remaining expected on this expense
    const expenseRemaining = s.expectedReimbursement != null
      ? s.expectedReimbursement - s.alreadyLinked
      : s.amount;
    // Tikkie portion = min(remaining tikkie balance, expense remaining)
    const portion = Math.min(remainingBalance, expenseRemaining);
    setTikkiePortion(portion.toFixed(2));
    setExpectedBack((s.alreadyLinked + portion).toFixed(2));
  }

  async function confirmLink() {
    if (!confirming) return;
    const portion = parseFloat(tikkiePortion.replace(",", "."));
    const expected = parseFloat(expectedBack.replace(",", "."));
    if (isNaN(portion) || portion <= 0) return;
    if (isNaN(expected) || expected <= 0) return;

    setLinking(true);
    await fetch("/api/reimbursements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reimbursementTransactionId: tikkie.id,
        originalTransactionId: confirming.id,
        amount: portion,
        expectedReimbursement: expected,
      }),
    });
    setLinking(false);
    setOpen(false);
    setConfirming(null);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
      >
        <Link2 className="size-3.5" />
        Koppelen
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirming(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {confirming ? "Confirm link" : "Koppel Tikkie aan uitgave"}
            </DialogTitle>
          </DialogHeader>

          {/* Tikkie info */}
          <div className="rounded-xl bg-muted px-4 py-3 text-sm">
            <p className="font-semibold">{tikkie.description}</p>
            <p className="text-muted-foreground mt-0.5">
              {formatDate(tikkie.date)} · <span className="tabular-nums text-green-600 font-semibold">+{formatEur(tikkie.amount)}</span>
              {tikkie.allocatedAmount > 0 && (
                <> · <span className="tabular-nums text-amber-600 font-semibold">nog {formatEur(remainingBalance)} over</span></>
              )}
            </p>
          </div>

          {confirming ? (
            /* Confirmation step */
            <div className="space-y-4">
              <div className="rounded-xl border bg-card px-4 py-3 text-sm">
                <p className="font-medium">{confirming.description}</p>
                <p className="text-muted-foreground mt-0.5">
                  {formatDate(confirming.date)} · <span className="tabular-nums text-red-500 font-semibold">-{formatEur(confirming.amount)}</span>
                  {confirming.categoryName && (
                    <> · <span style={{ color: confirming.categoryColor ?? undefined }}>{confirming.categoryName}</span></>
                  )}
                </p>
              </div>

              {/* Amount of Tikkie allocated to this expense */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Hoeveel van deze Tikkie gaat naar deze uitgave?
                </label>
                <p className="text-xs text-muted-foreground">
                  Nog <span className="tabular-nums">{formatEur(remainingBalance)}</span> beschikbaar van de Tikkie
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol()}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    max={remainingBalance}
                    step={0.01}
                    value={tikkiePortion}
                    onChange={(e) => setTikkiePortion(e.target.value)}
                    className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm bg-background"
                    autoFocus
                  />
                </div>
              </div>

              {/* Total expected back from this expense */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Hoeveel verwacht je totaal terug van deze uitgave?
                </label>
                <p className="text-xs text-muted-foreground">
                  Jouw deel: <span className="tabular-nums">{formatEur(confirming.amount - parseFloat(expectedBack.replace(",", ".") || "0"))}</span> of <span className="tabular-nums">{formatEur(confirming.amount)}</span>
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol()}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    max={confirming.amount}
                    step={0.01}
                    value={expectedBack}
                    onChange={(e) => setExpectedBack(e.target.value)}
                    className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm bg-background"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(null)}
                  className="flex-1 px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={confirmLink}
                  disabled={linking}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {linking ? "Koppelen…" : "Confirm link"}
                </button>
              </div>
            </div>
          ) : (
            /* Expense selection step */
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {loading && (
                <p className="text-sm text-muted-foreground text-center py-4">Search expenses…</p>
              )}
              {!loading && suggestions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No suggestions found binnen 14 dagen.
                </p>
              )}
              {!loading && suggestions.map((s) => {
                const target = s.expectedReimbursement ?? s.amount;
                const remaining = target - s.alreadyLinked;
                const pct = s.alreadyLinked > 0 ? Math.round((s.alreadyLinked / target) * 100) : 0;
                return (
                  <button
                    key={s.id}
                    onClick={() => selectExpense(s)}
                    className="w-full text-left rounded-xl border bg-card px-4 py-3 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(s.date)}
                          {s.categoryName && (
                            <> · <span style={{ color: s.categoryColor ?? undefined }}>{s.categoryName}</span></>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-red-500">-{formatEur(s.amount)}</p>
                        {s.alreadyLinked > 0 && (
                          <p className="text-[10px] tabular-nums text-muted-foreground">
                            {pct}% gedekt · nog {formatEur(remaining)}
                          </p>
                        )}
                      </div>
                    </div>
                    {s.alreadyLinked > 0 && (
                      <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
