"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCheck as Check } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Manual mark-as-paid/unpaid toggle for a single bill in a single month. Only rendered
// for bills that aren't already auto-marked paid via a matching transaction — those show
// the existing static "Paid" tag instead, since there's nothing to toggle.
// Mustard style: a 28px circle, a line ring while open and filled positive once paid.
export function MarkPaidButton({
  recurringItemId,
  month,
  paid,
}: {
  recurringItemId: number;
  month: string;
  paid: boolean;
}) {
  const t = useTranslations("bills");
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
      aria-label={optimisticPaid ? t("markUnpaid") : t("markPaid")}
      aria-pressed={optimisticPaid}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        optimisticPaid
          ? "border-positive bg-positive text-white"
          : "border-line text-transparent hover:border-ink-3 hover:text-ink-3",
      )}
    >
      <Check className="size-3.5" stroke={2.4} />
    </button>
  );
}
