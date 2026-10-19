// The Debts page's payoff timeline and "What if I pay extra?" simulator.
import { describe, expect, it } from "vitest";
import { payoffMonths, monthlyRate, totalInterest } from "@/lib/debt-interest";
import { payoffMonthsById, payoffOrder, simulatePayoff } from "@/lib/debt-simulate";

const duo = { id: 1, balance: 6900, payment: 212, annualRate: 0.46 };
const car = { id: 2, balance: 1520, payment: 160, annualRate: 5.9 };

describe("debt-simulate: simulatePayoff", () => {
  it("with no extra, matches each debt's own payoffMonths and interest", () => {
    const sim = simulatePayoff([duo, car]);
    const duoMonths = payoffMonths(duo.balance, duo.payment, monthlyRate(duo.annualRate))!;
    const carMonths = payoffMonths(car.balance, car.payment, monthlyRate(car.annualRate))!;
    expect(sim.months).toBe(Math.max(duoMonths, carMonths));
    expect(sim.totals[0]).toBe(8420);
    expect(sim.totals.at(-1)).toBe(0);
    expect(sim.interest).toBeCloseTo(
      totalInterest(duo.balance, duo.payment, monthlyRate(duo.annualRate)) +
        totalInterest(car.balance, car.payment, monthlyRate(car.annualRate)),
      1,
    );
  });

  it("puts the extra on the highest rate first and finishes sooner with less interest", () => {
    expect(payoffOrder([duo, car])).toEqual([2, 1]);
    const base = simulatePayoff([duo, car]);
    const extra = simulatePayoff([duo, car], 100);
    expect(extra.months!).toBeLessThan(base.months!);
    expect(extra.interest).toBeLessThan(base.interest);
    // The total balance never goes up and ends at zero.
    for (let i = 1; i < extra.totals.length; i++) expect(extra.totals[i]).toBeLessThanOrEqual(extra.totals[i - 1]);
    expect(extra.totals.at(-1)).toBe(0);
  });

  it("follows a preferred order for the extra and tracks each debt's own balance", () => {
    const avalanche = simulatePayoff([duo, car], 100);
    const duoFirst = simulatePayoff([duo, car], 100, 600, [1]);
    expect(duoFirst.order).toEqual([1, 2]);
    // Duo gets the extra, so it clears sooner than when Car got it first.
    const duoMonths = (s: typeof avalanche) => s.byDebt.find((d) => d.id === 1)!.months!;
    expect(duoMonths(duoFirst)).toBeLessThan(duoMonths(avalanche));
    // The per-debt series add up to the totals, month by month, and end at zero.
    for (let i = 0; i < duoFirst.totals.length; i++) {
      expect(duoFirst.byDebt.reduce((s, d) => s + d.balances[i], 0)).toBeCloseTo(duoFirst.totals[i], 2);
    }
    expect(Math.max(...duoFirst.byDebt.map((d) => d.months!))).toBe(duoFirst.months);
    // Unknown ids are ignored; missing open debts follow in the avalanche order.
    expect(simulatePayoff([duo, car], 0, 600, [99]).order).toEqual([2, 1]);
  });

  it("interest-free debts reduce to balance ÷ payment", () => {
    const sim = simulatePayoff([{ id: 1, balance: 1100, payment: 300, annualRate: null }]);
    expect(sim.months).toBe(4);
    expect(sim.totals).toEqual([1100, 800, 500, 200, 0]);
    expect(sim.interest).toBe(0);
  });

  it("returns null months when a payment never covers the interest", () => {
    const sim = simulatePayoff([{ id: 1, balance: 10000, payment: 10, annualRate: 12 }], 0, 120);
    expect(sim.months).toBeNull();
    expect(sim.totals).toHaveLength(121);
  });

  it("ignores debts already paid off", () => {
    const sim = simulatePayoff([{ id: 1, balance: 0, payment: 50, annualRate: null }]);
    expect(sim).toMatchObject({ months: 0, totals: [0], order: [] });
  });
});

describe("debt-simulate: payoffMonthsById", () => {
  it("at no extra, each debt's month matches its own payoffMonths", () => {
    const months = payoffMonthsById(simulatePayoff([duo, car]));
    expect(months.get(1)).toBe(payoffMonths(duo.balance, duo.payment, monthlyRate(duo.annualRate)));
    expect(months.get(2)).toBe(payoffMonths(car.balance, car.payment, monthlyRate(car.annualRate)));
  });

  it("moves the debt first in the order forward most, and never later", () => {
    const base = payoffMonthsById(simulatePayoff([duo, car]));
    // Avalanche: the car (5.9%) gets the extra first.
    const avalanche = payoffMonthsById(simulatePayoff([duo, car], 100));
    expect(avalanche.get(2)!).toBeLessThan(base.get(2)!);
    expect(avalanche.get(1)!).toBeLessThan(base.get(1)!);
    // The duo first instead: the car only gets the extra once the duo is cleared.
    const duoFirst = payoffMonthsById(simulatePayoff([duo, car], 100, 600, [1, 2]));
    expect(duoFirst.get(1)!).toBeLessThan(avalanche.get(1)!);
    expect(duoFirst.get(2)!).toBeGreaterThan(avalanche.get(2)!);
    expect(duoFirst.get(2)!).toBeLessThanOrEqual(base.get(2)!);
  });

  it("is null for a debt that never reaches zero, even when the others do", () => {
    const stuck = { id: 3, balance: 10000, payment: 10, annualRate: 12 };
    const months = payoffMonthsById(simulatePayoff([car, stuck], 0, 120));
    expect(months.get(2)).toBe(payoffMonths(car.balance, car.payment, monthlyRate(car.annualRate)));
    expect(months.get(3)).toBeNull();
    // An extra large enough rescues it once it reaches the stuck debt.
    expect(payoffMonthsById(simulatePayoff([car, stuck], 500, 120)).get(3)).not.toBeNull();
  });
});
