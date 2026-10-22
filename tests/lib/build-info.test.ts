import { describe, expect, it } from "vitest";
import { buildInfoFromEnv } from "@/lib/build-info";

describe("buildInfoFromEnv", () => {
  it("is a release when built from a version tag", () => {
    const info = buildInfoFromEnv({ ARCA_BUILD_REF: "v1.6.1", ARCA_BUILD_SHA: "63c4ee4abcdef", ARCA_BUILD_DATE: "2026-10-22T11:50:00Z" }, "1.6.1");
    expect(info).toMatchObject({ channel: "release", prerelease: false, sha: "63c4ee4", ref: "v1.6.1" });
  });

  it("is a dev build when built from the dev branch", () => {
    const info = buildInfoFromEnv({ ARCA_BUILD_REF: "dev", ARCA_BUILD_SHA: "99773d0" }, "1.6.1");
    expect(info).toMatchObject({ channel: "dev", prerelease: true, sha: "99773d0", date: "" });
  });

  it("is a branch build for anything else from CI", () => {
    expect(buildInfoFromEnv({ ARCA_BUILD_REF: "feature-x", ARCA_BUILD_SHA: "abc" }).channel).toBe("branch");
  });

  it("is local without build metadata", () => {
    expect(buildInfoFromEnv({}, "1.6.1")).toMatchObject({ channel: "local", prerelease: true, ref: "", sha: "", date: "" });
    expect(buildInfoFromEnv({ ARCA_BUILD_REF: "  " }).channel).toBe("local");
  });
});
