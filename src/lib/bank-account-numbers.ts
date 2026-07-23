import { db } from "@/db";
import { banks } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";

// Manually-added ("custom") bank accounts are created with accountNumber = null (see the
// comment on banks.accountNumber — CSV imports set a real one, "null = custom bank"). But
// every other part of the app links a transaction to a bank purely via
// transactions.account = banks.accountNumber — with no accountNumber, a custom account can
// never appear in the add-transaction account picker, and no transaction can ever be tied
// to it (so its balance never moves and the account picker/indicator has nothing to show).
// This backfills a stable synthetic identifier for any bank that still lacks one.
export async function backfillBankAccountNumbers() {
  try {
    const rows = await db.select({ id: banks.id }).from(banks).where(isNull(banks.accountNumber));
    for (const row of rows) {
      await db.update(banks).set({ accountNumber: `CUSTOM-${row.id}` }).where(eq(banks.id, row.id));
    }
  } catch {
    // Best-effort — never let this block a page render.
  }
}
