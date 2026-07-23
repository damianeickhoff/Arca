"use client";

import { useRouter } from "next/navigation";
import { DebtEditDialog } from "../../debt-edit-dialog";
import type { Debt, RecurringItem } from "@/db/schema";

// Thin wrapper so /debts/[id]/edit (a direct link target, e.g. from the desktop list)
// opens the same DebtEditDialog used as a nested sheet from the debt detail dialog —
// closing it navigates back to wherever the link was followed from.
export function EditDebtClient({
  debt,
  bills,
  currentRecurringIds,
}: {
  debt: Debt;
  bills: RecurringItem[];
  currentRecurringIds: number[];
}) {
  const router = useRouter();

  return (
    <DebtEditDialog
      debt={debt}
      bills={bills}
      currentRecurringIds={currentRecurringIds}
      open
      onOpenChange={(v) => { if (!v) router.back(); }}
    />
  );
}
