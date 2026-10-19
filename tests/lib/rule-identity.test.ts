import { describe, expect, it } from "vitest";
import { findRuleInOtherCategory, sameRuleConditions, type RuleConditions } from "@/lib/rule-identity";

const base: RuleConditions = {
  namePattern: "AH",
  nameWildcard: true,
  nameWholeWord: false,
  amount: null,
  amountMin: null,
  amountMax: null,
  direction: null,
  bankId: null,
};
const rule = (patch: Partial<RuleConditions>): RuleConditions => ({ ...base, ...patch });

describe("sameRuleConditions", () => {
  it("is true for the same conditions", () => {
    expect(sameRuleConditions(base, rule({}))).toBe(true);
  });

  it("reads patterns trimmed and case-insensitively, as matching does", () => {
    expect(sameRuleConditions(base, rule({ namePattern: " ah " }))).toBe(true);
  });

  it("treats a different amount condition as a different rule", () => {
    expect(sameRuleConditions(base, rule({ amountMax: 15 }))).toBe(false);
    expect(sameRuleConditions(rule({ amountMax: 15 }), rule({ amountMax: 20 }))).toBe(false);
    expect(sameRuleConditions(rule({ amount: 12.5 }), rule({ amountMin: 12.5 }))).toBe(false);
  });

  it("compares amounts by magnitude in whole cents", () => {
    expect(sameRuleConditions(rule({ amount: 12.5 }), rule({ amount: -12.5 }))).toBe(true);
    expect(sameRuleConditions(rule({ amountMin: 0.1 + 0.2 }), rule({ amountMin: 0.3 }))).toBe(true);
  });

  it("treats a different match type, direction or account as a different rule", () => {
    expect(sameRuleConditions(base, rule({ nameWholeWord: true }))).toBe(false);
    expect(sameRuleConditions(base, rule({ nameWildcard: false }))).toBe(false);
    expect(sameRuleConditions(base, rule({ direction: "expense" }))).toBe(false);
    expect(sameRuleConditions(base, rule({ bankId: 3 }))).toBe(false);
  });

  it("reads whole word as winning over the wildcard flag", () => {
    expect(sameRuleConditions(rule({ nameWholeWord: true, nameWildcard: true }), rule({ nameWholeWord: true, nameWildcard: false }))).toBe(true);
  });

  it("ignores the match type when there is no pattern", () => {
    expect(sameRuleConditions(rule({ namePattern: null, bankId: 1 }), rule({ namePattern: "", nameWildcard: false, bankId: 1 }))).toBe(true);
  });

  it("reads an empty direction as both directions", () => {
    expect(sameRuleConditions(base, rule({ direction: "" }))).toBe(true);
  });
});

describe("findRuleInOtherCategory", () => {
  const rules = [
    { ...base, id: 1, categoryId: 10 },
    { ...rule({ amountMax: 15 }), id: 2, categoryId: 11 },
  ];

  it("finds the identical rule in another category", () => {
    expect(findRuleInOtherCategory(rules, base, 12)?.id).toBe(1);
  });

  it("ignores rules in the same category and the rule being edited", () => {
    expect(findRuleInOtherCategory(rules, base, 10)).toBeNull();
    expect(findRuleInOtherCategory(rules, base, 12, 1)).toBeNull();
  });

  it("leaves a rule with other conditions alone", () => {
    expect(findRuleInOtherCategory(rules, rule({ amountMax: 20 }), 12)).toBeNull();
  });
});
