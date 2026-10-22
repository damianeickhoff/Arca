import { describe, expect, it } from "vitest";
import { parseJsonAnswer, toJsonSchema, validateAgainstSchema, type AiSchema } from "@/lib/ai-schema";

// The two schemas the AI features use today (lib/ai-features.ts).
const categories: AiSchema = {
  type: "ARRAY",
  items: { type: "OBJECT", properties: { id: { type: "INTEGER" }, categoryId: { type: "INTEGER" } }, required: ["id", "categoryId"] },
};
const summary: AiSchema = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    facts: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
    tip: { type: "STRING" },
  },
  required: ["headline", "facts", "tip"],
};

describe("toJsonSchema", () => {
  it("lower-cases types, closes objects and keeps item counts", () => {
    expect(toJsonSchema(summary)).toEqual({
      type: "object",
      properties: {
        headline: { type: "string" },
        facts: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
        tip: { type: "string" },
      },
      required: ["headline", "facts", "tip"],
      additionalProperties: false,
    });
  });

  it("turns nullable into a null type and keeps enums", () => {
    expect(toJsonSchema({ type: "STRING", nullable: true, enum: ["a", "b"] })).toEqual({ type: ["string", "null"], enum: ["a", "b"] });
  });
});

describe("validateAgainstSchema", () => {
  it("accepts answers that fit", () => {
    expect(validateAgainstSchema(categories, [{ id: 1, categoryId: 4 }, { id: 2, categoryId: 9 }])).toBeNull();
    expect(validateAgainstSchema(categories, [])).toBeNull();
    expect(validateAgainstSchema(summary, { headline: "h", facts: ["a", "b", "c"], tip: "t", extra: 1 })).toBeNull();
  });

  it("names the first problem and where it is", () => {
    expect(validateAgainstSchema(categories, { id: 1 })).toBe("$: expected an array, got object");
    expect(validateAgainstSchema(categories, [{ id: 1 }])).toBe('$[0]: missing "categoryId"');
    expect(validateAgainstSchema(categories, [{ id: 1.5, categoryId: 2 }])).toBe("$[0].id: expected a whole number, got number");
    expect(validateAgainstSchema(summary, { headline: "h", facts: ["a"], tip: "t" })).toBe("$.facts: expected at least 3 items, got 1");
    expect(validateAgainstSchema(summary, { headline: "h", facts: ["a", "b", "c", "d"], tip: "t" })).toBe("$.facts: expected at most 3 items, got 4");
    expect(validateAgainstSchema(summary, { headline: 3, facts: ["a", "b", "c"], tip: "t" })).toBe("$.headline: expected a string, got number");
  });

  it("checks booleans, numbers, enums and nullable values", () => {
    expect(validateAgainstSchema({ type: "BOOLEAN" }, true)).toBeNull();
    expect(validateAgainstSchema({ type: "BOOLEAN" }, "true")).toMatch(/expected a boolean/);
    expect(validateAgainstSchema({ type: "NUMBER" }, 2.5)).toBeNull();
    expect(validateAgainstSchema({ type: "NUMBER" }, Number.NaN)).toMatch(/expected a number/);
    expect(validateAgainstSchema({ type: "STRING", enum: ["in", "out"] }, "out")).toBeNull();
    expect(validateAgainstSchema({ type: "STRING", enum: ["in", "out"] }, "up")).toBe('$: must be one of "in", "out"');
    expect(validateAgainstSchema({ type: "STRING", nullable: true }, null)).toBeNull();
    expect(validateAgainstSchema({ type: "STRING" }, null)).toBe("$: expected a string, got null");
  });
});

describe("parseJsonAnswer", () => {
  it("parses plain JSON", () => {
    expect(parseJsonAnswer('{"ok": true}')).toEqual({ ok: true, value: { ok: true } });
  });

  it("takes off code fences, prose and think blocks", () => {
    expect(parseJsonAnswer('```json\n[{"id": 1}]\n```')).toEqual({ ok: true, value: [{ id: 1 }] });
    expect(parseJsonAnswer('```\n{"a": 1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonAnswer('Here you go: {"a": 1}. Hope that helps!')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonAnswer('<think>The user wants {json}.</think>\n{"a": 2}')).toEqual({ ok: true, value: { a: 2 } });
  });

  it("says when there is no JSON", () => {
    expect(parseJsonAnswer("Sorry, I can't help with that.")).toEqual({ ok: false, error: "the answer is not valid JSON" });
    expect(parseJsonAnswer("   ")).toEqual({ ok: false, error: "the answer was empty" });
  });
});
