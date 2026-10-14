// Characterisation tests for the debt maths: debt-interest.ts (amortisation) and the
// pure helpers in app/debts/debt-shared.ts that debt-calculations.ts,
// debt-recurring-paid.ts and net-worth-forecast.ts all build on. The DB-backed
// entry points are covered in money-db.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  amortizationSchedule,
  applyPayments,
  monthlyRate,
  paymentCoversInterest,
  payoffMonths,
  totalInterest,
} from "@/lib/debt-interest";
import {
  amountToExpr,
  computeDebt,
  computeDebtBillEndDate,
  computeDebtPayoffSchedule,
  debtBalance,
  debtBalanceDate,
  debtPaidPct,
  firstOutstandingMonth,
  linkedBillsMonthlyTotal,
  monthsElapsed,
  scheduledPaymentMonths,
} from "@/app/debts/debt-shared";
import type { Debt, RecurringItem } from "@/db/schema";

function debt(overrides: Partial<Debt>): Debt {
  return {
    id: 1,
    name: "Loan",
    direction: "owe",
    startingBalance: 1000,
    originalAmount: null,
    minimumPayment: 100,
    interestRate: null,
    startMonth: "2026-01",
    startDate: "2026-01-15",
    balanceDate: null,
    endMonth: null,
    color: null,
    icon: null,
    notes: null,
    ...overrides,
  };
}

describe("debt-interest", () => {
  it("monthlyRate is annual/12 and 0 for absent or non-positive rates", () => {
    expect(monthlyRate(12)).toBeCloseTo(0.01, 10);
    expect(monthlyRate(null)).toBe(0);
    expect(monthlyRate(undefined)).toBe(0);
    expect(monthlyRate(-3)).toBe(0);
    expect(monthlyRate(Number.NaN)).toBe(0);
  });

  it("paymentCoversInterest", () => {
    expect(paymentCoversInterest(0, 0, 0.01)).toBe(true);
    expect(paymentCoversInterest(1000, 0, 0)).toBe(false);
    expect(paymentCoversInterest(1000, 10, 0.01)).toBe(false); // exactly the interest
    expect(paymentCoversInterest(1000, 10.01, 0.01)).toBe(true);
  });

  it("payoffMonths matches ceil(balance/payment) without interest", () => {
    expect(payoffMonths(1100, 300, 0)).toBe(4);
    expect(payoffMonths(0, 300, 0)).toBe(0);
    expect(payoffMonths(1000, 0, 0)).toBeNull();
    expect(payoffMonths(1000, 10, 0.01)).toBeNull();
  });

  it("payoffMonths with interest", () => {
    expect(payoffMonths(10_000, 200, monthlyRate(6))).toBe(58);
    expect(payoffMonths(1000, 100, monthlyRate(12))).toBe(11);
  });

  it("amortizationSchedule prorates the final payment", () => {
    expect(amortizationSchedule(1100, 300, 0).map((e) => e.amount)).toEqual([300, 300, 300, 200]);
    const withInterest = amortizationSchedule(1000, 100, monthlyRate(12));
    expect(withInterest[0]).toEqual({ amount: 100, interest: 10, principal: 90, balanceAfter: 910 });
    expect(withInterest.at(-1)!.balanceAfter).toBe(0);
    expect(withInterest.at(-1)).toMatchInlineSnapshot(`
      {
        "amount": 58.98,
        "balanceAfter": 0,
        "interest": 0.58,
        "principal": 58.4,
      }
    `);
    expect(amortizationSchedule(1000, 5, monthlyRate(12))).toEqual([]);
  });

  it("totalInterest is 0 without a rate", () => {
    expect(totalInterest(1000, 100, 0)).toBe(0);
    expect(totalInterest(1000, 100, monthlyRate(12))).toMatchInlineSnapshot(`58.98`);
  });

  it("applyPayments accrues interest every month including unpaid ones and never goes negative", () => {
    expect(applyPayments(1000, 0, [100, 0, 100])).toBe(800);
    expect(applyPayments(1000, 0.01, [0, 0])).toBe(1020.1);
    expect(applyPayments(100, 0, [500, 500])).toBe(0);
  });
});

describe("debt-shared date conventions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 4, 20, 12)); // 20 May 2026
  });
  afterEach(() => vi.useRealTimers());

  it("debtBalanceDate falls back from balanceDate to startDate to the 1st of startMonth", () => {
    expect(debtBalanceDate({ balanceDate: "2026-03-10", startDate: "2026-01-15", startMonth: "2026-01" })).toBe("2026-03-10");
    expect(debtBalanceDate({ startDate: "2026-01-15", startMonth: "2026-01" })).toBe("2026-01-15");
    expect(debtBalanceDate({ startMonth: "2026-01" })).toBe("2026-01-01");
  });

  it("scheduledPaymentMonths starts the month after fromDate and includes toDate's month", () => {
    expect(scheduledPaymentMonths("2026-01-15", "2026-05-20")).toEqual(["2026-02", "2026-03", "2026-04", "2026-05"]);
    expect(scheduledPaymentMonths("2026-05-01", "2026-05-31")).toEqual([]);
    expect(scheduledPaymentMonths("2025-11-30", "2026-01-01")).toEqual(["2025-12", "2026-01"]);
  });

  it("monthsElapsed counts whole calendar months, floored at 0", () => {
    expect(monthsElapsed("2026-01")).toBe(4);
    expect(monthsElapsed("2027-01")).toBe(0);
  });

  it("firstOutstandingMonth is the month after the later of the schedule and the last recorded month", () => {
    expect(firstOutstandingMonth({ startMonth: "2026-01", startDate: "2026-01-15" })).toBe("2026-06");
    expect(firstOutstandingMonth({ startMonth: "2026-01", startDate: "2026-01-15" }, "2026-07")).toBe("2026-08");
    expect(firstOutstandingMonth({ startMonth: "2026-01", balanceDate: "2026-09-01" })).toBe("2026-10");
  });

  it("linkedBillsMonthlyTotal normalises frequencies and amountToExpr formats for the keypad", () => {
    const bills = [
      { amount: 30, frequency: "quarterly" },
      { amount: 120, frequency: "yearly" },
      { amount: 50, frequency: "monthly" },
    ] as RecurringItem[];
    expect(linkedBillsMonthlyTotal(bills)).toBe(70);
    expect(amountToExpr(70.5)).toBe("70,5");
    expect(amountToExpr(0)).toBe("");
  });
});

describe("debtBalance and computeDebt", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 4, 20, 12)); // 20 May 2026
  });
  afterEach(() => vi.useRealTimers());

  it("unlinked, interest-free: assumes minimumPayment for every scheduled month since the balance date", () => {
    // Feb, Mar, Apr, May = 4 payments of 100.
    expect(debtBalance(debt({}), null)).toEqual({ amountPaid: 400, currentBalance: 600 });
  });

  it("a balance date of today assumes nothing has been repaid yet", () => {
    expect(debtBalance(debt({ balanceDate: "2026-05-20" }), null)).toEqual({ amountPaid: 0, currentBalance: 1000 });
  });

  it("linked, interest-free: uses the recorded total, capped at the starting balance", () => {
    expect(debtBalance(debt({}), { total: 250, byMonth: [] })).toEqual({ amountPaid: 250, currentBalance: 750 });
    expect(debtBalance(debt({}), { total: 5000, byMonth: [] })).toEqual({ amountPaid: 1000, currentBalance: 0 });
  });

  it("with interest: replays the monthly history, so cash paid exceeds principal retired", () => {
    const progress = {
      total: 300,
      byMonth: [
        { month: "2026-02", amount: 100 },
        { month: "2026-03", amount: 0 },
        { month: "2026-04", amount: 100 },
        { month: "2026-05", amount: 100 },
      ],
    };
    const result = debtBalance(debt({ interestRate: 12 }), progress);
    expect(result).toMatchInlineSnapshot(`
      {
        "amountPaid": 263.42999999999995,
        "currentBalance": 736.57,
      }
    `);
    expect(result.amountPaid).toBeLessThan(300);
  });

  it("computeDebt: payoff months, last payment date on the debt's own day, remaining interest", () => {
    const result = computeDebt(debt({}), null);
    expect(result.currentBalance).toBe(600);
    expect(result.monthsRemaining).toBe(6);
    expect(result.neverPaysOff).toBe(false);
    expect(result.remainingInterest).toBe(0);
    expect(result.lastRecordedMonth).toBeNull();
    // First outstanding month is June; 6 payments → the last is in November, on the 15th.
    expect(result.lastPaymentDate?.toDateString()).toBe(new Date(2026, 10, 15).toDateString());
  });

  it("computeDebt flags a payment that never covers the interest", () => {
    const result = computeDebt(debt({ balanceDate: "2026-05-20", interestRate: 24, minimumPayment: 10 }), null);
    expect(result).toMatchObject({ currentBalance: 1000, monthsRemaining: null, neverPaysOff: true, lastPaymentDate: null });
  });

  it("computeDebt for a settled debt", () => {
    const result = computeDebt(debt({ startDate: "2025-01-15", startMonth: "2025-01" }), null);
    expect(result).toMatchObject({ currentBalance: 0, monthsRemaining: 0, lastPaymentDate: null, neverPaysOff: false });
  });

  it("computeDebtPayoffSchedule starts at the first outstanding month", () => {
    const schedule = computeDebtPayoffSchedule(debt({ minimumPayment: 300 }), 1100);
    expect(schedule.map((s) => [s.date.getFullYear(), s.date.getMonth() + 1, s.amount])).toEqual([
      [2026, 6, 300],
      [2026, 7, 300],
      [2026, 8, 300],
      [2026, 9, 200],
    ]);
    expect(computeDebtPayoffSchedule(debt({ minimumPayment: 0 }), 1100)).toEqual([]);
  });

  it("computeDebtBillEndDate projects N payments from the start date", () => {
    // CURRENT BEHAVIOUR: a 31st start day overflows into the next month (Nov 31 → Dec 1),
    // while computeDebt's lastPaymentDate clamps the same day to Nov 30.
    expect(computeDebtBillEndDate("2026-01-31", 1000, 100)).toBe("2026-12-01");
    expect(computeDebtBillEndDate("2026-01-15", 1000, 100)).toBe("2026-11-15");
    expect(computeDebtBillEndDate("2026-01-15", 1000, 0)).toBeNull();
    expect(computeDebtBillEndDate("2026-01-15", 1000, 5, 12)).toBeNull();
  });

  it("debtPaidPct measures against originalAmount when it is larger than the starting balance", () => {
    expect(debtPaidPct(debt({}), 400, 600)).toBe(40);
    expect(debtPaidPct(debt({ originalAmount: 2000 }), 400, 600)).toBe(70);
    expect(debtPaidPct(debt({ originalAmount: 500 }), 400, 600)).toBe(40);
    expect(debtPaidPct(debt({ startingBalance: 0 }), 0, 0)).toBe(0);
  });
});
