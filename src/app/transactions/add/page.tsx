import { db } from "@/db";
import { categories, appSettings, banks, transactions } from "@/db/schema";
import { eq, asc, isNotNull, sql } from "drizzle-orm";
import { AddTransactionClient } from "./add-transaction-client";
import { backfillBankAccountNumbers } from "@/lib/bank-account-numbers";

export const dynamic = "force-dynamic";

// Persisted under this key via POST /api/settings; "1" = calculator keys shown.
const CALCULATOR_SETTING_KEY = "add_transaction_calculator";

export default async function AddTransactionPage() {
  // Awaited (not fire-and-forget like the root layout's copy) so a custom account added
  // moments ago is guaranteed to already have its synthetic accountNumber by the time the
  // query below runs — otherwise it could still be excluded by isNotNull() this one time.
  await backfillBankAccountNumbers();

  // Same running-balance definition the global-search overview uses: manually-set
  // opening balance plus the signed transaction sum. Display only.
  const signedAmount = sql<number>`COALESCE(${banks.startingBalance}, 0) + COALESCE(SUM(CASE WHEN ${transactions.direction} = 'income' THEN ${transactions.amount} ELSE -${transactions.amount} END), 0)`;

  const [cats, calcRow, accounts] = await Promise.all([
    db.select().from(categories).orderBy(categories.group, categories.name),
    db.select().from(appSettings).where(eq(appSettings.key, CALCULATOR_SETTING_KEY)).limit(1),
    db
      .select({
        accountNumber: banks.accountNumber,
        displayName: banks.displayName,
        cardType: banks.cardType,
        balance: signedAmount,
      })
      .from(banks)
      .leftJoin(transactions, eq(transactions.account, banks.accountNumber))
      .where(isNotNull(banks.accountNumber))
      .groupBy(banks.id)
      .orderBy(asc(banks.displayName), asc(banks.accountNumber)),
  ]);

  // Default off — the plain 3-column keypad — until the user turns the calculator on.
  const calculatorEnabled = calcRow[0]?.value === "1";
  return (
    <AddTransactionClient
      categories={cats}
      calculatorEnabled={calculatorEnabled}
      accounts={accounts.filter((a): a is typeof a & { accountNumber: string } => a.accountNumber !== null)}
    />
  );
}
