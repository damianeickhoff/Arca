import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateTestDb, removeTestDb } from "../helpers/test-db";
import { checkForUpdate, getUpdateCheckState, isNewerVersion, maybeCheckForUpdate, parseVersion, setUpdateCheckEnabled } from "@/lib/update-check";

function fakeFetch(body: unknown, status = 200): typeof fetch & { calls: number } {
  const fn = (async () => {
    fn.calls++;
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch & { calls: number };
  fn.calls = 0;
  return fn;
}

describe("version comparison", () => {
  it("parses plain and v-prefixed versions", () => {
    expect(parseVersion("1.6.1")).toEqual([1, 6, 1]);
    expect(parseVersion("v1.10.0")).toEqual([1, 10, 0]);
    expect(parseVersion("2.0.0-beta.1")).toEqual([2, 0, 0]);
    expect(parseVersion("latest")).toBeNull();
  });

  it("compares numerically, not as text", () => {
    expect(isNewerVersion("1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("1.6.1", "1.6.1")).toBe(false);
    expect(isNewerVersion("1.6.0", "1.6.1")).toBe(false);
    expect(isNewerVersion("2.0.0", "1.99.99")).toBe(true);
    expect(isNewerVersion("nonsense", "1.6.1")).toBe(false);
  });
});

describe("update check", () => {
  beforeAll(migrateTestDb);
  afterAll(removeTestDb);

  it("is off by default and finds nothing", async () => {
    const state = await getUpdateCheckState("1.6.1");
    expect(state).toMatchObject({ enabled: false, latest: null, checkedAt: null, available: false });
  });

  it("does nothing while off", async () => {
    const f = fakeFetch({ tag_name: "v9.0.0" });
    await maybeCheckForUpdate({ fetchImpl: f });
    expect(f.calls).toBe(0);
  });

  it("stores the newest release and reports it as available", async () => {
    await setUpdateCheckEnabled(true);
    const result = await checkForUpdate({ current: "1.6.1", now: new Date("2026-10-23T08:00:00Z"), fetchImpl: fakeFetch({ tag_name: "v1.7.0", html_url: "https://github.com/damianeickhoff/Arca/releases/tag/v1.7.0" }) });
    expect(result.ok).toBe(true);
    const state = await getUpdateCheckState("1.6.1");
    expect(state.latest).toEqual({ version: "1.7.0", url: "https://github.com/damianeickhoff/Arca/releases/tag/v1.7.0", checkedAt: "2026-10-23T08:00:00.000Z" });
    expect(state.available).toBe(true);
    expect((await getUpdateCheckState("1.7.0")).available).toBe(false);
  });

  it("keeps the last good answer when the API fails, but records the attempt", async () => {
    const result = await checkForUpdate({ current: "1.6.1", now: new Date("2026-10-24T08:00:00Z"), fetchImpl: fakeFetch({ message: "rate limited" }, 403) });
    expect(result).toMatchObject({ ok: false, error: "unavailable" });
    const state = await getUpdateCheckState("1.6.1");
    expect(state.latest?.version).toBe("1.7.0");
    expect(state.checkedAt).toBe("2026-10-24T08:00:00.000Z");
  });

  it("checks at most once a day", async () => {
    const f = fakeFetch({ tag_name: "v1.7.1" });
    await maybeCheckForUpdate({ now: new Date("2026-10-24T20:00:00Z"), fetchImpl: f });
    expect(f.calls).toBe(0);
    await maybeCheckForUpdate({ now: new Date("2026-10-25T09:00:00Z"), fetchImpl: f });
    expect(f.calls).toBe(1);
    expect((await getUpdateCheckState("1.6.1")).latest?.version).toBe("1.7.1");
  });

  it("rejects an answer without a version", async () => {
    const result = await checkForUpdate({ current: "1.6.1", fetchImpl: fakeFetch({ tag_name: "nightly" }) });
    expect(result).toMatchObject({ ok: false, error: "unexpected" });
  });

  it("forgets everything when switched off", async () => {
    await setUpdateCheckEnabled(false);
    expect(await getUpdateCheckState("1.6.1")).toMatchObject({ enabled: false, latest: null, checkedAt: null, available: false });
  });
});
