import { sql } from "drizzle-orm";
import { recurringItems, reimbursements, transactions } from "@/db/schema";

// How much of an expense comes back to you, per transaction. Two sources, in priority order:
//
//  1. Actually received money — `reimbursements` rows linked to this expense in the
//     Voorschotten tab. Precise, but manual.
//  2. The expected share of a shared recurring bill — `recurringItems.sharedReimbursedAmount`
//     on the item this transaction matched. Zero upkeep: a €103 storage bill split with three
//     housemates nets to your €25,75 every month without linking anything.
//
// COALESCE picks the first non-NULL, and `sum()` over zero rows *is* NULL, so a month you
// linked by hand uses the real amount and a month you didn't falls back to the estimate —
// never both. Un-shared, un-linked transactions get 0 and are reported gross as always.
//
// This is only ever *subtracted from spend*, and only when shared_cost_mode is "net"
// (see getSharedCostMode + buildSplitAllocations). It never touches income, cash flow or
// the bill tracker — the full amount really does leave the account.
export const reimbursedAmountExpr = sql<number>`COALESCE(
  (
    select sum(${reimbursements.amount})
    from ${reimbursements}
    where ${reimbursements.originalTransactionId} = ${transactions.id}
  ),
  (
    select ${recurringItems.sharedReimbursedAmount}
    from ${recurringItems}
    where ${recurringItems.id} = ${transactions.recurringItemId}
      and ${recurringItems.sharedReimbursedAmount} is not null
  ),
  0
)`;
