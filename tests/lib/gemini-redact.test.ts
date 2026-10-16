// What may leave the app for Gemini: merchant text, never an account or card number.
import { describe, expect, it } from "vitest";
import { readQuotaError, redactForAi } from "@/lib/gemini";

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

describe("readQuotaError", () => {
  const body = (message: string, details: unknown[]) => ({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message, details } });

  it("spots a model without free quota (limit 0), so another model can be tried", () => {
    const paidOnly = body("Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-x-pro", [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "0" }],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "31s" },
    ]);
    expect(readQuotaError(paidOnly)).toEqual({ error: "noFreeTier", retryAfter: null });
  });

  it("tells a used-up day from a busy minute", () => {
    const daily = body("Quota exceeded, limit: 250", [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "250" }] },
    ]);
    expect(readQuotaError(daily).error).toBe("dailyLimit");

    const minute = body("Quota exceeded, limit: 10. Please retry in 7.4s.", [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quotaValue: "10" }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "7.4s" },
    ]);
    expect(readQuotaError(minute)).toEqual({ error: "rateLimited", retryAfter: 8 });
  });

  it("falls back to a plain rate limit for a body it doesn't know", () => {
    expect(readQuotaError(null)).toEqual({ error: "rateLimited", retryAfter: null });
  });
});
