import { describe, expect, it } from "vitest";
import { findNameConflict, isNameConflictResponse } from "@/lib/category-name-conflict";

const rows = [
  { id: 1, name: "Housing", group: "", isGroup: true, parentCategoryId: null },
  { id: 2, name: "Rent", group: "", isGroup: false, parentCategoryId: 1 },
  { id: 3, name: "Income", group: "income", isGroup: true, parentCategoryId: null },
  { id: 4, name: "Salary", group: "income", isGroup: false, parentCategoryId: 3 },
  { id: 5, name: "Loose", group: "", isGroup: false, parentCategoryId: null },
];

describe("findNameConflict", () => {
  it("finds a category in the same kind, case-insensitively, with its group", () => {
    expect(findNameConflict(rows, { name: "  rENT ", kind: "" })).toEqual({ name: "Rent", isGroup: false, where: "Housing" });
  });

  it("finds a group, reporting its kind", () => {
    expect(findNameConflict(rows, { name: "housing", kind: "" })).toEqual({ name: "Housing", isGroup: true, where: "" });
    expect(findNameConflict(rows, { name: "Income", kind: "income" })).toEqual({ name: "Income", isGroup: true, where: "income" });
  });

  it("allows the same name in another kind", () => {
    expect(findNameConflict(rows, { name: "Rent", kind: "income" })).toBeNull();
    expect(findNameConflict(rows, { name: "Salary", kind: "" })).toBeNull();
  });

  it("ignores the row being renamed and empty names", () => {
    expect(findNameConflict(rows, { name: "rent", kind: "", excludeId: 2 })).toBeNull();
    expect(findNameConflict(rows, { name: "   ", kind: "" })).toBeNull();
  });

  it("reports no group for a category without one", () => {
    expect(findNameConflict(rows, { name: "loose", kind: "" })).toEqual({ name: "Loose", isGroup: false, where: null });
  });
});

describe("isNameConflictResponse", () => {
  it("recognises the API's 409 body only", () => {
    expect(isNameConflictResponse({ error: "exists", name: "Rent", isGroup: false, where: "Housing" })).toBe(true);
    expect(isNameConflictResponse({ error: "A name is required" })).toBe(false);
    expect(isNameConflictResponse(null)).toBe(false);
  });
});
