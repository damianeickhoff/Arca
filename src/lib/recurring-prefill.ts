import type { Category } from "@/db/schema";
import { isValidISODate } from "@/lib/date-valid";
import { resolveDisplayName } from "@/lib/friendly-names";
import type { RecurringPrefill } from "@/components/settings/recurring/recurring-client";
import type { TransactionDetail } from "@/app/transactions/transaction-types";

// Moved here from the old transaction detail dialog, which the detail panel replaced.

// Extract the likely merchant/brand name from a raw transaction description.
// Stops at the first token that contains a digit (store numbers, postal codes, etc.)
// so "ALDI CUL009 TIEL TIEL NLD" → "ALDI", "Albert Heijn 1177 DOORN NLD" → "Albert Heijn".
export function guessMerchant(description: string): string {
  const tokens = description.trim().split(/\s+/);
  const brand: string[] = [];
  for (const t of tokens) {
    if (/\d/.test(t)) break;
    brand.push(t);
    if (brand.length >= 3) break;
  }
  return brand.join(" ") || description;
}

// Everything a recurring item can inherit from a single transaction: name, amount, the
// date it starts from, match pattern and category. Anything not derivable (frequency,
// notes) keeps the editor's own defaults.
export function buildRecurringPrefill(row: TransactionDetail, categories: Category[]): RecurringPrefill {
  const category = categories.find((c) => c.id === row.categoryId);
  const amount = row.correctedAmount ?? row.amount;
  const budgetType = row.budgetTypeOverride ?? category?.budgetType ?? null;

  return {
    name: resolveDisplayName(row),
    type: row.direction === "income" ? "income" : "bill",
    amount: amount != null ? String(Math.abs(amount)) : undefined,
    budgetType: budgetType && ["nodig", "willen", "sparen"].includes(budgetType) ? budgetType : undefined,
    // The editor turns this into dueDay on save. A transaction whose date never parsed
    // (a mis-mapped CSV import) is left out, so the form falls back to today.
    startDate: isValidISODate(row.date) ? row.date : undefined,
    matchPattern: guessMerchant(row.description) || undefined,
    categoryId: row.categoryId != null ? String(row.categoryId) : undefined,
  };
}
