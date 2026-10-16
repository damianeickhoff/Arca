// The Debts page's payoff timeline and "What if I pay extra?" simulator.
import { describe, expect, it } from "vitest";
import { payoffMonths, monthlyRate, totalInterest } from "@/lib/debt-interest";
import { payoffOrder, simulatePayoff } from "@/lib/debt-simulate";

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
