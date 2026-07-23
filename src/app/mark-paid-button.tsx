"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck as Check } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Manual mark-as-paid/unpaid toggle for a single bill in a single month. Only rendered
// for bills that aren't already auto-marked paid via a matching transaction — those show
// the existing static "Paid" tag instead, since there's nothing to toggle.
export function MarkPaidButton({
  recurringItemId,
  month,
  paid,
}: {
  recurringItemId: number;
  month: string;
  paid: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticPaid, setOptimisticPaid] = useState(paid);

  async function toggle() {
    const next = !optimisticPaid;
    setOptimisticPaid(next);
    await fetch("/api/recurring/payments", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringItemId, month }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={optimisticPaid ? "Mark as unpaid" : "Mark as paid"}
      className={cn(
        "shrink-0 size-6 rounded-full border flex items-center justify-center transition-colors",
        optimisticPaid
          ? "bg-emerald-500 border-emerald-500 text-white"
          : "border-foreground/20 text-transparent hover:border-foreground/40",
      )}
    >
      <Check className="size-3.5" />
    </button>
  );
}
