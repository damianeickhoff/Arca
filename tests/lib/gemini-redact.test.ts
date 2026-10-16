// What may leave the app for Gemini: merchant text, never an account or card number.
import { describe, expect, it } from "vitest";
import { redactForAi } from "@/lib/gemini";

describe("redactForAi", () => {
  it("removes IBANs, with or without spaces", () => {
    expect(redactForAi("Overboeking NL91 ABNA 0417 1643 00 J. Jansen")).toBe("Overboeking … J. Jansen");
    expect(redactForAi("NL91ABNA0417164300 huur")).toBe("… huur");
  });

  it("removes card numbers and long references but keeps the merchant", () => {
    expect(redactForAi("ALBERT HEIJN 1403 AMSTERDAM pas 5355 1234 5678 9012")).toBe("ALBERT HEIJN 1403 AMSTERDAM pas …");
    expect(redactForAi("Tandarts kenmerk 2026001234567")).toBe("Tandarts kenmerk …");
  });

  it("keeps it short", () => {
    expect(redactForAi("x".repeat(500))).toHaveLength(140);
  });
});
