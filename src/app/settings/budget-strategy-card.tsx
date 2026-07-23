"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BudgetStrategySliders, type BudgetStrategy } from "@/components/budget-strategy-sliders";

export function BudgetStrategyCard({ initial }: { initial: BudgetStrategy }) {
  const router = useRouter();
  const [vals, setVals] = useState<BudgetStrategy>(initial);
  const [saving, setSaving] = useState(false);
  const total = vals.nodig + vals.willen + vals.sparen;

  async function save() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "budget_strategy", value: JSON.stringify(vals) }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-[var(--dialog-background)] p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-base">Budget strategy</h2>
        <p className="text-xs text-muted-foreground">How your income splits across Needs, Wants, and Savings & Debts.</p>
      </div>
      <BudgetStrategySliders value={vals} onChange={setVals} />
      <Button onClick={save} disabled={saving || total !== 100} className="w-full mt-4">
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
