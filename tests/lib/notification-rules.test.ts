import { describe, expect, it } from "vitest";
import {
  billNotices,
  connectionNotices,
  daysBetween,
  dueNotices,
  forecastNotice,
  importNotice,
  localDateOf,
  paydayNotice,
  updateNotice,
  type BillInput,
  type ConnectionInput,
  type ForecastInput,
} from "@/lib/notification-rules";
import { deviceLabel } from "@/lib/push-device-label";
import { parseDisabledKinds } from "@/lib/notification-kinds";

const TODAY = "2026-10-15";

function bill(over: Partial<BillInput> = {}): BillInput {
  return { itemId: 1, name: "Rent", amount: 950, dueDate: "2026-10-18", paid: false, skipped: false, ...over };
}

describe("date helpers", () => {
  it("counts whole days either way", () => {
    expect(daysBetween("2026-10-15", "2026-10-18")).toBe(3);
    expect(daysBetween("2026-10-15", "2026-10-14")).toBe(-1);
    // Across the end of summer time (25 October in Europe/Amsterdam).
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("reads the local date of a timestamp", () => {
    expect(localDateOf("2026-10-15")).toBe("2026-10-15");
    // 23:30 UTC is already the next day in Amsterdam.
    expect(localDateOf("2026-10-15T23:30:00Z")).toBe("2026-10-16");
  });
});

describe("billDueSoon and billOverdue", () => {
  it("announces a bill one to three days before it is due", () => {
    expect(billNotices(TODAY, [bill({ dueDate: "2026-10-18" })])).toEqual([
      { kind: "billDueSoon", subject: "1:2026-10-18", params: { name: "Rent", amount: 950, date: "2026-10-18", days: 3 }, href: "/transactions/upcoming" },
    ]);
    expect(billNotices(TODAY, [bill({ dueDate: "2026-10-16" })])[0]?.kind).toBe("billDueSoon");
    expect(billNotices(TODAY, [bill({ dueDate: "2026-10-19" })])).toEqual([]);
    expect(billNotices(TODAY, [bill({ dueDate: TODAY })])).toEqual([]);
  });

  it("leaves paid and skipped bills alone, and announces a bill nobody can match too", () => {
    expect(billNotices(TODAY, [bill({ paid: true })])).toEqual([]);
    expect(billNotices(TODAY, [bill({ skipped: true })])).toEqual([]);
    expect(billNotices(TODAY, [bill({ paid: null })])[0]?.kind).toBe("billDueSoon");
  });

  it("calls a known-unpaid bill overdue from the day after, for a week", () => {
    expect(billNotices(TODAY, [bill({ dueDate: "2026-10-14" })])).toEqual([
      { kind: "billOverdue", subject: "1:2026-10-14", params: { name: "Rent", amount: 950, date: "2026-10-14" }, href: "/transactions/upcoming" },
    ]);
    expect(billNotices(TODAY, [bill({ dueDate: "2026-10-08" })])[0]?.kind).toBe("billOverdue");
    expect(billNotices(TODAY, [bill({ dueDate: "2026-10-07" })])).toEqual([]);
    // Unknown (nothing to match by) is never called late.
    expect(billNotices(TODAY, [bill({ dueDate: "2026-10-14", paid: null })])).toEqual([]);
  });
});

describe("forecastShortfall", () => {
  const dip: ForecastInput = { month: "2026-10", dipped: true, lowest: { amount: -120, date: "2026-10-27" }, threshold: 100 };
  const fine: ForecastInput = { ...dip, dipped: false };

  it("announces the first dip of the month", () => {
    const { notice, state } = forecastNotice(dip, null);
    expect(notice).toEqual({ kind: "forecastShortfall", subject: "2026-10#1", params: { threshold: 100, amount: -120, date: "2026-10-27" }, href: "/forecast" });
    expect(state).toEqual({ month: "2026-10", episode: 1, dipped: true });
  });

  it("stays quiet while it stays under, and speaks again after a recovery", () => {
    const first = forecastNotice(dip, null);
    expect(forecastNotice(dip, first.state).notice).toBeNull();
    const recovered = forecastNotice(fine, first.state);
    expect(recovered.notice).toBeNull();
    expect(recovered.state).toEqual({ month: "2026-10", episode: 1, dipped: false });
    expect(forecastNotice(dip, recovered.state).notice?.subject).toBe("2026-10#2");
  });

  it("starts counting again in a new month", () => {
    const old = { month: "2026-09", episode: 3, dipped: true };
    expect(forecastNotice(dip, old).notice?.subject).toBe("2026-10#1");
    expect(forecastNotice(null, old)).toEqual({ notice: null, state: old });
  });
});

describe("paydayCheckIn", () => {
  it("checks in once the main income landed, with safe to spend", () => {
    expect(paydayNotice(TODAY, { month: "2026-10", landedOn: TODAY, safeToSpend: 812.5 })).toEqual({
      kind: "paydayCheckIn",
      subject: "2026-10",
      params: { amount: 812.5 },
      href: "/",
    });
  });

  it("allows a late sync two days, and needs a budget", () => {
    expect(paydayNotice(TODAY, { month: "2026-10", landedOn: "2026-10-13", safeToSpend: 1 })).not.toBeNull();
    expect(paydayNotice(TODAY, { month: "2026-10", landedOn: "2026-10-12", safeToSpend: 1 })).toBeNull();
    expect(paydayNotice(TODAY, { month: "2026-10", landedOn: TODAY, safeToSpend: null })).toBeNull();
    expect(paydayNotice(TODAY, { month: "2026-10", landedOn: null, safeToSpend: 5 })).toBeNull();
  });
});

describe("bankConsentExpiring and bankSyncFailed", () => {
  const conn = (over: Partial<ConnectionInput> = {}): ConnectionInput => ({
    id: 4,
    name: "ING",
    validUntil: "2026-10-22T10:00:00Z",
    expired: false,
    lastError: null,
    lastAt: null,
    ...over,
  });

  it("announces a consent ending within seven days", () => {
    expect(connectionNotices(TODAY, [conn()])).toEqual([
      { kind: "bankConsentExpiring", subject: "4:2026-10-22", params: { bank: "ING", date: "2026-10-22", days: 7 }, href: "/settings?panel=import" },
    ]);
    expect(connectionNotices(TODAY, [conn({ validUntil: "2026-10-23T10:00:00Z" })])).toEqual([]);
    expect(connectionNotices(TODAY, [conn({ expired: true })])).toEqual([]);
  });

  it("announces a failed sync once per connection per day, never a busy one", () => {
    const failed = conn({ validUntil: "2027-01-01T00:00:00Z", lastError: "unavailable", lastAt: "2026-10-15T08:00:00Z" });
    expect(connectionNotices(TODAY, [failed])).toEqual([
      { kind: "bankSyncFailed", subject: "4:2026-10-15", params: { bank: "ING" }, href: "/settings?panel=import" },
    ]);
    expect(connectionNotices(TODAY, [{ ...failed, lastError: "busy" }])).toEqual([]);
    expect(connectionNotices(TODAY, [{ ...failed, lastAt: "2026-10-14T08:00:00Z" }])).toEqual([]);
  });
});

describe("importDone", () => {
  it("groups the day's imports into one notice that it may rewrite", () => {
    expect(importNotice(TODAY, { count: 12, waiting: 3 })).toEqual({
      kind: "importDone",
      subject: TODAY,
      params: { count: 12, waiting: 3 },
      href: "/transactions/needs-review",
      replace: true,
    });
    expect(importNotice(TODAY, { count: 2, waiting: 0 })?.href).toBe("/transactions");
    expect(importNotice(TODAY, { count: 0, waiting: 0 })).toBeNull();
    expect(importNotice(TODAY, null)).toBeNull();
  });
});

describe("updateAvailable", () => {
  it("announces each newer version once, only with the check on", () => {
    expect(updateNotice({ enabled: true, available: true, version: "1.7.0" })).toEqual({
      kind: "updateAvailable",
      subject: "1.7.0",
      params: { version: "1.7.0" },
      href: "/settings?panel=about",
    });
    expect(updateNotice({ enabled: false, available: true, version: "1.7.0" })).toBeNull();
    expect(updateNotice({ enabled: true, available: false, version: "1.6.1" })).toBeNull();
  });
});

describe("dueNotices", () => {
  it("collects every kind and hands back the forecast state", () => {
    const { notices, forecastState } = dueNotices({
      today: TODAY,
      bills: [bill()],
      forecast: { month: "2026-10", dipped: true, lowest: null, threshold: 100 },
      forecastState: null,
      payday: { month: "2026-10", landedOn: TODAY, safeToSpend: 300 },
      connections: [],
      imports: { count: 1, waiting: 1 },
      update: { enabled: true, available: true, version: "1.7.0" },
    });
    expect(notices.map((n) => n.kind)).toEqual(["billDueSoon", "forecastShortfall", "paydayCheckIn", "importDone", "updateAvailable"]);
    expect(forecastState?.episode).toBe(1);
  });
});

describe("deviceLabel", () => {
  it("names the device and the browser", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")).toBe("Windows · Chrome");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0")).toBe("Windows · Edge");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe("Mac · Firefox");
    expect(deviceLabel("")).toBeNull();
    expect(deviceLabel(null)).toBeNull();
  });
});

describe("parseDisabledKinds", () => {
  it("keeps only known kinds", () => {
    expect(parseDisabledKinds('["billDueSoon","nope","billDueSoon"]')).toEqual(["billDueSoon"]);
    expect(parseDisabledKinds("not json")).toEqual([]);
    expect(parseDisabledKinds(null)).toEqual([]);
  });
});
