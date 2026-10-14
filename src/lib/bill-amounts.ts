/**
 * What an "upcoming" list still costs you: expenses only.
 *
 * Upcoming lists mix bills, subscriptions, debt, savings transfers and income. Income
 * belongs on the calendar — you want to see the salary land — but it is not money you
 * have to pay, so it must stay out of the total. Netting it in made the figure read as a
 * cash-flow delta instead of an amount due, and turned it negative whenever the month's
 * income outweighed the bills still outstanding.
 *
 * Returns an unsigned "still to pay" figure; `amount` is stored unsigned on every
 * recurring item, income or not.
 *
 * Deliberately its own (server-safe) module rather than living beside CalendarBill in
 * bills-calendar.tsx: that file is "use client", and a function exported from a client
 * module can't be called during server rendering, only rendered or passed as a prop.
 */
export function billsDueTotal(
  bills: readonly { amount: number | null; isIncome?: boolean }[],
): number {
  return bills.reduce((sum, b) => (b.isIncome ? sum : sum + (b.amount ?? 0)), 0);
}

/** Whether a list has anything payable in it at all — lets callers hide a subtotal that
 *  would otherwise read €0,00 on a day holding nothing but income. */
export function hasPayableBill(bills: readonly { isIncome?: boolean }[]): boolean {
  return bills.some((b) => !b.isIncome);
}
