import { describe, expect, it } from "vitest";
import { EMPTY_GUIDE, applyGuideChange, isGuideChange, parseGuideState } from "@/lib/guide";

// Tips and page tours live on the account (users.guide_state); the browser and the
// server apply the same changes to it.
describe("parseGuideState", () => {
  it("starts with both switches on and nothing seen", () => {
    expect(parseGuideState(null)).toEqual(EMPTY_GUIDE);
    expect(parseGuideState("not json")).toEqual(EMPTY_GUIDE);
  });

  it("drops tips and tours that no longer exist", () => {
    const state = parseGuideState(JSON.stringify({ tipsSeen: ["receiptScan", "homeMoneyFlow"], toursSeen: ["home", "nowhere"], tipsOn: false }));
    expect(state.tipsSeen).toEqual(["receiptScan"]);
    expect(state.toursSeen).toEqual(["home"]);
    expect(state.tipsOn).toBe(false);
    expect(state.toursOn).toBe(true);
  });
});

describe("applyGuideChange", () => {
  it("records a tip and a tour once", () => {
    let state = applyGuideChange(EMPTY_GUIDE, { kind: "tipSeen", id: "csvImport" });
    state = applyGuideChange(state, { kind: "tipSeen", id: "csvImport" });
    state = applyGuideChange(state, { kind: "tourSeen", id: "debts" });
    expect(state.tipsSeen).toEqual(["csvImport"]);
    expect(state.toursSeen).toEqual(["debts"]);
  });

  it("turns tips or tours off, and the reset forgets everything and turns both on", () => {
    let state = applyGuideChange(EMPTY_GUIDE, { kind: "switch", which: "tips", on: false });
    state = applyGuideChange(state, { kind: "switch", which: "tours", on: false });
    state = applyGuideChange(state, { kind: "tourSeen", id: "home" });
    state = applyGuideChange(state, { kind: "version", which: "whatsNew", version: "1.9.0" });
    expect([state.tipsOn, state.toursOn]).toEqual([false, false]);
    const reset = applyGuideChange(state, { kind: "reset" });
    expect(reset).toEqual({ ...EMPTY_GUIDE, whatsNewVersion: "1.9.0" });
  });

  it("merges what a browser remembered, keeping the account's own versions", () => {
    const state = applyGuideChange(
      { ...EMPTY_GUIDE, tipsSeen: ["receiptScan"], whatsNewVersion: "1.9.0" },
      { kind: "legacy", tipsSeen: ["csvImport", "homeMoneyFlow", "receiptScan"], tipsOff: true, whatsNewVersion: "1.8.0", updateAvailableVersion: "2.0.0" },
    );
    expect(state.tipsSeen).toEqual(["receiptScan", "csvImport"]);
    expect(state.tipsOn).toBe(false);
    expect(state.whatsNewVersion).toBe("1.9.0");
    expect(state.updateAvailableVersion).toBe("2.0.0");
  });
});

describe("isGuideChange", () => {
  it("accepts known changes and refuses anything else", () => {
    expect(isGuideChange({ kind: "tipSeen", id: "receiptScan" })).toBe(true);
    expect(isGuideChange({ kind: "tipSeen", id: "nope" })).toBe(false);
    expect(isGuideChange({ kind: "tourSeen", id: "insights" })).toBe(true);
    expect(isGuideChange({ kind: "switch", which: "tips", on: "yes" })).toBe(false);
    expect(isGuideChange({ kind: "version", which: "whatsNew", version: "" })).toBe(false);
    expect(isGuideChange({ kind: "drop tables" })).toBe(false);
    expect(isGuideChange(null)).toBe(false);
  });
});
