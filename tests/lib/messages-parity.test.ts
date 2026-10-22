import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// messages/en.json and messages/nl.json must hold the same keys: a key missing in one
// language shows its raw path on screen.
function leaves(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

const read = (locale: string) => JSON.parse(fs.readFileSync(path.join("messages", `${locale}.json`), "utf8")) as unknown;

describe("translations", () => {
  it("have the same keys in English and Dutch", () => {
    const en = new Set(leaves(read("en")));
    const nl = new Set(leaves(read("nl")));
    expect([...en].filter((key) => !nl.has(key))).toEqual([]);
    expect([...nl].filter((key) => !en.has(key))).toEqual([]);
  });
});
