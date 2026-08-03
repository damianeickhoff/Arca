/**
 * A scheduled item's contribution to a total: income adds, everything else subtracts.
 *
 * Upcoming lists mix bills, subscriptions, debt, savings transfers and income, and each
 * `amount` is stored unsigned — so without this a salary would be added to the rent and
 * the total would mean nothing.
 *
 * Deliberately its own (server-safe) module rather than living beside CalendarBill in
 * bills-calendar.tsx: that file is "use client", and a function exported from a client
 * module can't be called during server rendering, only rendered or passed as a prop.
 */
export function signedBillAmount(bill: { amount: number | null; isIncome?: boolean }): number {
  const amount = bill.amount ?? 0;
  return bill.isIncome ? amount : -amount;
}
