import { describe, expect, it } from "vitest";
import { maskedMoney } from "@/components/clear/money";

// Privacy mode swaps every amount for fixed dots, so the length must not depend on the value.
describe("maskedMoney", () => {
  it("keeps the symbol and sign, and hides the number behind a fixed run of dots", () => {
    expect(maskedMoney("€1.234,56")).toBe("€•••,••");
    expect(maskedMoney("€7,00")).toBe("€•••,••");
    expect(maskedMoney("€-20,00")).toBe("€-•••,••");
    expect(maskedMoney("−€40")).toBe("−€•••");
    expect(maskedMoney("€12.500")).toBe("€•••");
  });

  it("hides the K/M of compact labels too", () => {
    expect(maskedMoney("€5K")).toBe("€•••");
    expect(maskedMoney("-€1.2M")).toBe("-€•••");
  });
});
