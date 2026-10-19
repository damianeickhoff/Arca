import { describe, expect, it } from "vitest";
import { summarizeBankSync } from "@/lib/bank-sync-status";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const valid = "2027-01-01T00:00:00Z";

describe("summarizeBankSync", () => {
  it("is null without any connection", () => {
    expect(summarizeBankSync([], NOW)).toBeNull();
  });

  it("says never synced until a sync finished", () => {
    expect(summarizeBankSync([{ status: "active", validUntil: valid, lastSyncedAt: null }], NOW)).toEqual({ state: "never" });
  });

  it("takes the newest finished sync", () => {
    expect(
      summarizeBankSync(
        [
          { status: "active", validUntil: valid, lastSyncedAt: "2026-10-18T06:00:00.000Z" },
          { status: "active", validUntil: valid, lastSyncedAt: "2026-10-19T06:00:00.000Z" },
          { status: "active", validUntil: valid, lastSyncedAt: null },
        ],
        NOW,
      ),
    ).toEqual({ state: "synced", at: "2026-10-19T06:00:00.000Z" });
  });

  it("flags an expired consent, by status or by date", () => {
    expect(summarizeBankSync([{ status: "expired", validUntil: valid, lastSyncedAt: "2026-10-19T06:00:00.000Z" }], NOW)).toEqual({ state: "expired" });
    expect(summarizeBankSync([{ status: "active", validUntil: "2026-10-01T00:00:00Z", lastSyncedAt: null }], NOW)).toEqual({ state: "expired" });
  });
});
