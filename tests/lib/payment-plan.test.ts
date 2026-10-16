// Payment plans: a cost paid in parts, stored as a recurrence (one part per occurrence,
// the end date on the last part). The schedule maths is pure; progress reads the
// transactions linked to the plan and the months marked paid by hand.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planPartAmount, planPartNumber, planSchedule } from "@/lib/payment-plan";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";

describe("plan schedule", () => {
  it("splits the total into parts rounded to cents", () => {
    expect(planPartAmount(450, 3)).toBe(150);
    expect(planPartAmount(500, 3)).toBe(166.67);
  });

  it("puts one part in each period from the start date, clamping to short months", () => {
    expect(planSchedule("2026-11-16", "monthly", 3)).toEqual(["2026-11-16", "2026-12-16", "2027-01-16"]);
    expect(planSchedule("2027-01-31", "monthly", 3)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(planSchedule("2026-11-02", "weekly", 2)).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("numbers the part due on a date, and nothing for other types or dates", () => {
    const plan = { type: "plan", frequency: "monthly", startDate: "2026-11-16", planParts: 3 };
    expect(planPartNumber(plan, "2026-12-16")).toBe(2);
    expect(planPartNumber(plan, "2027-02-16")).toBeNull();
    expect(planPartNumber({ ...plan, type: "bill" }, "2026-12-16")).toBeNull();
  });
});

describe("plan progress", () => {
  const config = { defaultStartDay: 1, overrides: {}, weekendRollback: false };

  beforeAll(async () => {
    migrateTestDb();
    await clearFixtures();
  });
  afterAll(removeTestDb);

  it("counts a linked payment and a manual mark once per month", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { getPlanProgress } = await import("@/lib/payment-plan-progress");

    const [plan] = await db
      .insert(s.recurringItems)
      .values({ name: "Dentist", type: "plan", amount: 150, frequency: "monthly", startDate: "2026-09-16", endDate: "2026-11-16", planTotal: 450, planParts: 3 })
      .returning();
    await db.insert(s.transactions).values([
      // September: paid and linked. October: linked and also marked by hand — still one part.
      { date: "2026-09-16", description: "Tandarts", amount: 150, direction: "expense", type: "rekening", recurringItemId: plan.id },
      { date: "2026-10-16", description: "Tandarts", amount: 150, direction: "expense", type: "rekening", recurringItemId: plan.id },
    ]);
    await db.insert(s.billPayments).values({ recurringItemId: plan.id, month: "2026-10", amount: 150 });

    const progress = (await getPlanProgress([plan], config)).get(plan.id);
    expect(progress).toEqual({ paidParts: 2, paidAmount: 300, remaining: 150 });

    // November marked by hand without a transaction: the plan is paid off.
    await db.insert(s.billPayments).values({ recurringItemId: plan.id, month: "2026-11", amount: null });
    expect((await getPlanProgress([plan], config)).get(plan.id)).toEqual({ paidParts: 3, paidAmount: 450, remaining: 0 });
  });
});
