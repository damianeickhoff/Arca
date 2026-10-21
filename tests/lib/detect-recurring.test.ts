// The recurring detector (src/lib/recurring-detect/), pure: grouping, rhythm, amount
// and scoring, against the fixtures the plan names (docs/recurring-detection-plan.md).
import { describe, expect, it } from "vitest";
import { detectRecurring, evaluateSeries, shouldAutoAccept, confidenceLevel } from "@/lib/recurring-detect";
import { classifyRhythm, fixedMonthDay } from "@/lib/recurring-detect/rhythm";
import { classifyAmount } from "@/lib/recurring-detect/amount";
import { amountBands, derivePattern, groupByCounterparty } from "@/lib/recurring-detect/grouping";
import { scoreSeries } from "@/lib/recurring-detect/score";
import {
  TODAY,
  carInsurance,
  energy,
  groceries,
  priceRise,
  salary,
  series,
  shopWithSubscription,
  stoppedGym,
  tikkies,
  water,
} from "../helpers/recurring-fixtures";

const detect = (txns: Parameters<typeof detectRecurring>[0]) => detectRecurring(txns, { today: TODAY });

describe("detectRecurring: the plan's fixtures", () => {
  it("rejects groceries: 14 visits in three months is twice per period", () => {
    expect(detect(groceries())).toEqual([]);
  });

  it("finds a monthly salary due on the 25th", () => {
    const [found, ...rest] = detect(salary());
    expect(rest).toEqual([]);
    expect(found).toMatchObject({
      type: "income",
      frequency: "monthly",
      dueDay: 25,
      amount: 3200,
      matchAmount: 3200,
      budgetType: null,
      occurrences: 6,
    });
  });

  it("finds energy as a monthly variable bill with a range", () => {
    const [found] = detect(energy());
    expect(found).toMatchObject({ type: "bill", frequency: "monthly", amountMin: 92, amountMax: 138, matchAmount: null });
    // The match range reaches a little beyond what was seen.
    expect(found.matchAmountMin).toBeLessThan(92);
    expect(found.matchAmountMax).toBeGreaterThan(138);
  });

  it("finds water as quarterly, anchored to the first payment's month", () => {
    const [found] = detect(water());
    expect(found).toMatchObject({ frequency: "quarterly", startDate: "2025-11-08", firstDate: "2025-11-10", dueDay: 8, amount: 54.2 });
  });

  it("finds car insurance as yearly from two payments", () => {
    const [found] = detect(carInsurance());
    expect(found).toMatchObject({ frequency: "yearly", occurrences: 2, dueDay: 13 });
  });

  it("rejects Tikkies with amounts all over the place", () => {
    expect(detect(tikkies())).toEqual([]);
  });

  it("fixes a subscription at its new price after a price rise", () => {
    const [found] = detect(priceRise());
    expect(found).toMatchObject({ frequency: "monthly", amount: 10.99, matchAmount: 10.99, dueDay: 12, amountMin: null });
  });

  it("reads only recent history, so years of price rises still give a fixed amount", () => {
    const dates: string[] = [];
    const amounts: number[] = [];
    for (let i = 0; i < 36; i++) {
      const month = new Date(Date.UTC(2023, 10 + i, 7));
      dates.push(month.toISOString().slice(0, 10));
      amounts.push(i < 12 ? 7.99 : i < 24 ? 8.99 : 9.99);
    }
    const [found] = detect(series({ merchantId: 12, merchantName: "Cloudbox", description: "Cloudbox storage", dates, amounts }));
    expect(found).toMatchObject({ frequency: "monthly", amount: 9.99, matchAmount: 9.99, dueDay: 7 });
    expect(found.firstDate > "2025-09-01").toBe(true);
  });

  it("does not suggest a gym that stopped five months ago", () => {
    expect(detect(stoppedGym())).toEqual([]);
  });

  it("separates a subscription from the same merchant's ordinary orders", () => {
    const { membership, orders } = shopWithSubscription();
    const found = detect([...orders, ...membership]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ frequency: "monthly", matchAmount: 4.99, dueDay: 5 });
    expect(found[0].transactionIds.sort()).toEqual(membership.map((t) => t.id).sort());
    // A band's signature carries its amount bucket, so the orders can't reuse it.
    expect(found[0].signature).toMatch(/^r:m9:expense:-?\d+$/);
  });

  it("handles every fixture at once without cross-talk", () => {
    const { membership, orders } = shopWithSubscription();
    const all = [
      ...groceries(), ...salary(), ...energy(), ...water(), ...carInsurance(),
      ...tikkies(), ...priceRise(), ...stoppedGym(), ...membership, ...orders,
    ];
    const names = detect(all).map((c) => c.name).sort();
    expect(names).toEqual(["Acme BV", "Autoverzekering Plus", "Bol", "StreamFlix", "Stroomnet", "Waterbedrijf Noord"]);
  });
});

describe("grouping", () => {
  it("groups by merchant and direction, and falls back to the counter account", () => {
    const groups = groupByCounterparty([
      ...series({ merchantId: 1, description: "a", dates: ["2026-01-01"], amounts: 1 }),
      ...series({ merchantId: 1, description: "a", dates: ["2026-01-02"], amounts: 1, direction: "income" }),
      ...series({ merchantId: null, counterAccount: "nl01 bank 0123", description: "Huur", dates: ["2026-01-03"], amounts: 900 }),
      ...series({ merchantId: null, description: "Geldautomaat", dates: ["2026-01-04"], amounts: 50 }),
    ]);
    expect([...groups.keys()].sort()).toEqual(["aNL01BANK0123:expense", "m1:expense", "m1:income"]);
  });

  it("splits amounts into ±8% bands", () => {
    const bands = amountBands(series({ merchantId: 1, description: "x", dates: Array(5).fill("2026-01-01"), amounts: [12.5, 12.9, 240, 13.2, 250] }));
    expect(bands.map((b) => b.map((t) => t.amount))).toEqual([[12.5, 12.9, 13.2], [240, 250]]);
  });

  it("derives a pattern every description contains", () => {
    expect(derivePattern(["NETFLIX.COM AMSTERDAM", "NETFLIX.COM 0800"], ["netflix"])).toBe("netflix");
    expect(derivePattern(["Huur jan 2026 J. de Vries", "Huur feb 2026 J. de Vries"])).toBe("huur");
    expect(derivePattern(["ab 12", "cd 34"])).toBeNull();
  });
});

describe("rhythm", () => {
  it("tells four-weekly from monthly by the drifting day of the month", () => {
    const dates = ["2026-04-03", "2026-05-01", "2026-05-29", "2026-06-26", "2026-07-24", "2026-08-21", "2026-09-18"];
    expect(classifyRhythm(dates, TODAY)).toMatchObject({ ok: true, frequency: "four_weekly", dueDay: null });
  });

  it("recognises a weekly payment", () => {
    const dates = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06", "2026-10-13"];
    expect(classifyRhythm(dates, TODAY)).toMatchObject({ ok: true, frequency: "weekly" });
  });

  it("allows one missing period but not two", () => {
    expect(classifyRhythm(["2026-06-01", "2026-07-01", "2026-09-01", "2026-10-01"], TODAY)).toMatchObject({ ok: true, missed: 1 });
    expect(classifyRhythm(["2026-04-01", "2026-06-01", "2026-08-01", "2026-10-01"], TODAY)).toMatchObject({ ok: false });
  });

  it("needs three payments unless lowered for a curated merchant", () => {
    expect(classifyRhythm(["2026-09-01", "2026-10-01"], TODAY)).toMatchObject({ ok: false, reason: "tooFew" });
    expect(classifyRhythm(["2026-09-01", "2026-10-01"], TODAY, 2)).toMatchObject({ ok: true, frequency: "monthly" });
  });

  it("finds the fixed day of the month across the month end", () => {
    expect(fixedMonthDay([30, 1, 31, 2])).not.toBeNull();
    expect(fixedMonthDay([3, 12, 20])).toBeNull();
  });
});

describe("amount", () => {
  it("classifies fixed, price change, variable and erratic amounts", () => {
    expect(classifyAmount([10, 10, 10.2])).toMatchObject({ kind: "fixed", amount: 10, priceChanged: false });
    expect(classifyAmount([9.99, 9.99, 10.99, 10.99, 10.99])).toMatchObject({ kind: "fixed", amount: 10.99, priceChanged: true });
    expect(classifyAmount([92, 104, 118, 138, 121, 99])).toMatchObject({ kind: "variable", min: 92, max: 138 });
    expect(classifyAmount([12.5, 240, 8, 33.1])).toBeNull();
  });

  it("does not let a weekly payment have a variable amount", () => {
    const cleaner = series({
      merchantId: 10,
      description: "Schoonmaak",
      dates: ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"],
      amounts: [40, 52, 45, 38, 60, 44],
    });
    expect(evaluateSeries(cleaner, { today: TODAY, signature: "x" })).toMatchObject({ ok: false, reason: "amount" });
  });
});

describe("scoring and the curated list", () => {
  const netflix = (dates: string[]) =>
    series({ merchantId: 11, merchantName: "Netflix", description: "NETFLIX.COM", dates, amounts: 13.99 });

  it("uses the curated name and type, matches on the name only, and boosts confidence", () => {
    const [found] = detect(netflix(["2026-05-08", "2026-06-08", "2026-07-08", "2026-08-08", "2026-09-08", "2026-10-08"]));
    expect(found).toMatchObject({ name: "Netflix", type: "subscription", budgetType: "willen", curated: true, matchPattern: "netflix", matchAmount: null });
    expect(confidenceLevel(found.confidence)).toBe("high");
    expect(shouldAutoAccept(found)).toBe(true);
  });

  it("lets a curated merchant show after two payments, but not auto-accept", () => {
    const [found] = detect(netflix(["2026-09-08", "2026-10-08"]));
    expect(found).toMatchObject({ curated: true, occurrences: 2 });
    expect(shouldAutoAccept(found)).toBe(false);
  });

  it("never auto-accepts something off the curated list", () => {
    const [found] = detect(salary());
    expect(shouldAutoAccept(found)).toBe(false);
  });

  it("scores longer, tighter, steadier series higher", () => {
    const base = { frequency: "monthly" as const, spread: 0, missed: 0, curated: false };
    const fixed = { kind: "fixed" as const, amount: 10, priceChanged: false };
    const variable = { kind: "variable" as const, amount: 10, min: 8, max: 12, closeShare: 1 };
    expect(scoreSeries({ ...base, occurrences: 6, amount: fixed })).toBeGreaterThan(scoreSeries({ ...base, occurrences: 3, amount: fixed }));
    expect(scoreSeries({ ...base, occurrences: 6, amount: fixed })).toBeGreaterThan(scoreSeries({ ...base, occurrences: 6, amount: variable }));
    expect(scoreSeries({ ...base, occurrences: 6, amount: fixed, missed: 1 })).toBeLessThan(scoreSeries({ ...base, occurrences: 6, amount: fixed }));
  });
});
