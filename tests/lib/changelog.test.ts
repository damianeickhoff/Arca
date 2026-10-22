import { describe, expect, it } from "vitest";
import { parseChangelog } from "@/lib/changelog";

const sample = `# Changelog

Some preamble that is not an entry.

## 1.6.0 — 2026-10-22
Net worth on Home, and free software under the AGPL

Arca 1.6.0 puts your net worth on Home.

### 🏠 Home
- A **Net worth** card takes the place of the Budget card.
- The Budget card is gone.

### 🐳 Installing and updating
Image: \`damianeickhoff/arca:latest\`.

As always: **back up \`/data\`.**

## 1.2.1 — 2026-07-30
Financial health and tips

# 🚀 Arca v1.2.1

### ✨ New Features

- **Financial Health**
  - Get insights.
  - Receive suggestions.

## 1.0.0
First release
`;

describe("parseChangelog", () => {
  const entries = parseChangelog(sample);

  it("finds every entry, newest first as written", () => {
    expect(entries.map((e) => e.version)).toEqual(["1.6.0", "1.2.1", "1.0.0"]);
    expect(entries[0].date).toBe("2026-10-22");
    expect(entries[2].date).toBe("");
  });

  it("splits title, intro and sections", () => {
    const e = entries[0];
    expect(e.title).toBe("Net worth on Home, and free software under the AGPL");
    expect(e.intro).toBe("Arca 1.6.0 puts your net worth on Home.");
    expect(e.sections.map((s) => s.heading)).toEqual(["🏠 Home", "🐳 Installing and updating"]);
    expect(e.sections[0].items).toEqual([
      { text: "A **Net worth** card takes the place of the Budget card.", level: 0, bullet: true },
      { text: "The Budget card is gone.", level: 0, bullet: true },
    ]);
    expect(e.sections[1].items.map((i) => i.bullet)).toEqual([false, false]);
  });

  it("keeps nested bullets and ignores a stray page title", () => {
    const e = entries[1];
    expect(e.title).toBe("Financial health and tips");
    expect(e.intro).toBe("");
    expect(e.sections[0].items).toEqual([
      { text: "**Financial Health**", level: 0, bullet: true },
      { text: "Get insights.", level: 1, bullet: true },
      { text: "Receive suggestions.", level: 1, bullet: true },
    ]);
  });

  it("handles an entry with a title only", () => {
    expect(entries[2]).toMatchObject({ version: "1.0.0", title: "First release", intro: "", sections: [] });
  });
});
