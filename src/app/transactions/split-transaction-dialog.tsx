"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconChevronDownFilled as ChevronDown,
  IconPlusFilled as Plus,
  IconTrashFilled as Trash2
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Category } from "@/db/schema";
import { formatEur, currencySymbol } from "@/lib/format";
import {
  allocateByCounts,
  amountsMatch,
  roundToCents,
  type TransactionSplitRow,
} from "@/lib/transaction-splits";

type DraftSplit = {
  uid: string;
  categoryId: string;
  amount: string;
  count: string;
};

interface SplitTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: number;
  description: string;
  totalAmount: number;
  categories: Category[];
  initialSplits: TransactionSplitRow[];
}

function createEqualAmountDrafts(totalAmount: number, parts = 2): DraftSplit[] {
  const amounts = allocateByCounts(totalAmount, Array.from({ length: parts }, () => 1));
  return amounts.map((amount) => ({
    uid: crypto.randomUUID(),
    categoryId: "",
    amount: amount.toFixed(2),
    count: "1",
  }));
}

export function SplitTransactionDialog({
  open,
  onOpenChange,
  transactionId,
  description,
  totalAmount,
  categories,
  initialSplits,
}: SplitTransactionDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"amount" | "count">("amount");
  const [splits, setSplits] = useState<DraftSplit[]>(() =>
    initialSplits.length > 0
      ? initialSplits.map((split) => ({
          uid: String(split.id),
          categoryId: String(split.categoryId ?? ""),
          amount: split.amount.toFixed(2),
          count: "1",
        }))
      : createEqualAmountDrafts(totalAmount),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countValues = splits.map((split) => {
    const parsed = Number(split.count.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });

  const computedAmounts = mode === "count"
    ? allocateByCounts(totalAmount, countValues)
    : splits.map((split) => {
        const parsed = Number(split.amount.replace(",", "."));
        return Number.isFinite(parsed) ? roundToCents(parsed) : 0;
      });

  const enteredTotal = roundToCents(computedAmounts.reduce((sum, amount) => sum + amount, 0));
  const totalMatches = mode === "count" || amountsMatch(enteredTotal, totalAmount);

  function updateSplit(index: number, patch: Partial<DraftSplit>) {
    setSplits((current) => current.map((split, splitIndex) => (
      splitIndex === index ? { ...split, ...patch } : split
    )));
  }

  function addSplit() {
    setSplits((current) => [
      ...current,
      {
        uid: crypto.randomUUID(),
        categoryId: "",
        amount: "",
        count: "1",
      },
    ]);
  }

  function removeSplit(index: number) {
    setSplits((current) => current.filter((_, splitIndex) => splitIndex !== index));
  }

  async function saveSplits() {
    if (splits.length < 2) {
      setError("Add at least 2 shares for a split.");
      return;
    }

    const payload = splits.map((split, index) => {
      const categoryId = Number(split.categoryId);
      const amount = computedAmounts[index];
      return { categoryId, amount };
    });

    if (payload.some((split) => !Number.isInteger(split.categoryId) || split.categoryId <= 0)) {
      setError("Choose a category for each share.");
      return;
    }

    if (payload.some((split) => split.amount <= 0)) {
      setError(mode === "count" ? "Every split must have a count greater than 0." : "Every share must have an amount greater than 0.");
      return;
    }

    if (!amountsMatch(payload.reduce((sum, split) => sum + split.amount, 0), totalAmount)) {
      setError("The sum of all splits must equal the transaction total.");
      return;
    }

    setSaving(true);
    setError(null);

    const response = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: transactionId, splits: payload }),
    });

    setSaving(false);

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      setError(result?.error ?? "Could not save the split.");
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  async function removeAllSplits() {
    setSaving(true);
    setError(null);

    const response = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: transactionId, splits: [] }),
    });

    setSaving(false);

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      setError(result?.error ?? "The splits could not be removed.");
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Split transaction</DialogTitle>
          <DialogDescription>
            Split <span className="font-medium">{description}</span> across multiple categories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-muted px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Amount to split</p>
            <p className="font-semibold tabular-nums text-base">{formatEur(totalAmount)}</p>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium">Split based on</label>
            <div className="flex rounded-md border overflow-hidden text-xs">
              {([
                ["amount", "Amount"],
                ["count", "Count"],
              ] as const).map(([value, label], index) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`flex-1 px-3 py-2 transition-colors ${
                    mode === value
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  } ${index > 0 ? "border-l" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "amount"
                ? "Enter the exact amount for each share."
                : "Give each share a count. The amount will be split automatically."}
            </p>
          </div>

          <div className="space-y-3">
            {splits.map((split, index) => {
              const selectedCategory = categories.find((category) => String(category.id) === split.categoryId);
              const computedAmount = computedAmounts[index] ?? 0;

              return (
                <div key={split.uid} className="rounded-xl border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Deel {index + 1}</p>
                      <p className="text-xs text-muted-foreground">
                        {mode === "count" ? `${formatEur(computedAmount)} automatisch berekend` : "Choose category and amount"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSplit(index)}
                      disabled={splits.length <= 2}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                      title={splits.length <= 2 ? "A split has at least 2 shares" : `Delete share ${index + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_140px]">
                    <div className="space-y-1.5">
                      <label className="font-medium">Categorie</label>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="w-full border rounded-md px-3 py-2 bg-background flex items-center justify-between gap-2">
                          <span className={`flex items-center gap-2 min-w-0 ${selectedCategory ? "" : "text-muted-foreground"}`}>
                            {selectedCategory?.color && (
                              <span className="inline-block size-2 rounded-full shrink-0" style={{ backgroundColor: selectedCategory.color }} />
                            )}
                            <span className="truncate">{selectedCategory ? selectedCategory.name : "— Choose category —"}</span>
                          </span>
                          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="min-w-56 max-h-80 overflow-y-auto">
                          {categories.map((category) => (
                            <DropdownMenuItem
                              key={category.id}
                              onClick={() => updateSplit(index, { categoryId: String(category.id) })}
                              className={String(category.id) === split.categoryId ? "bg-muted" : ""}
                            >
                              {category.color && (
                                <span className="inline-block size-2 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
                              )}
                              {category.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-medium">{mode === "amount" ? "Amount" : "Count"}</label>
                      <div className="relative">
                        {mode === "amount" && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{currencySymbol()}</span>
                        )}
                        <Input
                          type="number"
                          step={mode === "amount" ? "0.01" : "1"}
                          min="0"
                          value={mode === "amount" ? split.amount : split.count}
                          onChange={(event) => updateSplit(index, mode === "amount" ? { amount: event.target.value } : { count: event.target.value })}
                          className={mode === "amount" ? "pl-7" : undefined}
                        />
                      </div>
                      {mode === "count" ? (
                        <p className="text-xs text-muted-foreground tabular-nums">{formatEur(computedAmount)}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={addSplit}>
              <Plus className="size-4 mr-2" />
              Deel toevoegen
            </Button>

            <div className="text-right">
              <p className={`text-sm font-medium tabular-nums ${totalMatches ? "text-foreground" : "text-destructive"}`}>
                Total: {formatEur(enteredTotal)} / {formatEur(totalAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {mode === "count" ? "Automatically balanced to add up exactly." : "All shares together must add up exactly."}
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
            <div>
              {initialSplits.length > 0 && (
                <Button type="button" variant="outline" onClick={removeAllSplits} disabled={saving}>
                  Splits verwijderen
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={saveSplits} disabled={saving || !totalMatches}>
                {saving ? "Saving..." : "Save split"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
