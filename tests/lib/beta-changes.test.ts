import { describe, expect, it } from "vitest";
import { parseChangesJson, parseGitLog } from "@/lib/beta-changes";

const US = "\x1f";
const RS = "\x1e";
const rec = (sha: string, date: string, parents: string, subject: string) => `${sha}${US}${date}${US}${parents}${US}${subject}${RS}\n`;

describe("parseGitLog", () => {
  it("reads hash, date and subject, newest first as git prints them", () => {
    const text =
      rec("d6799ab", "2026-10-22T15:41:26+02:00", "c49b981", "AI: a local server as a provider") +
      rec("c49b981", "2026-10-22T15:15:27+02:00", "99773d0", "Beta chip on dev and local builds");
    expect(parseGitLog(text)).toEqual([
      { sha: "d6799ab", date: "2026-10-22T15:41:26+02:00", subject: "AI: a local server as a provider" },
      { sha: "c49b981", date: "2026-10-22T15:15:27+02:00", subject: "Beta chip on dev and local builds" },
    ]);
  });

  it("gives nothing for empty output", () => {
    expect(parseGitLog("")).toEqual([]);
    expect(parseGitLog("\n")).toEqual([]);
  });

  it("leaves merge commits out", () => {
    const text =
      rec("aaaaaaa", "2026-10-22T12:00:00+02:00", "bbbbbbb ccccccc", "Merge branch 'feature' into dev") +
      rec("bbbbbbb", "2026-10-22T11:00:00+02:00", "ddddddd", "Plan › Budget: a fix");
    expect(parseGitLog(text).map((c) => c.sha)).toEqual(["bbbbbbb"]);
  });

  it("keeps the first commit of a history (no parent) and skips broken records", () => {
    const text = rec("eeeeeee", "2026-01-01T00:00:00Z", "", "First commit") + "garbage without separators" + RS;
    expect(parseGitLog(text)).toEqual([{ sha: "eeeeeee", date: "2026-01-01T00:00:00Z", subject: "First commit" }]);
  });
});

describe("parseChangesJson", () => {
  it("reads the file CI writes and drops the v from the tag", () => {
    const json = JSON.stringify({ since: "v1.6.1", commits: [{ sha: "d6799ab", date: "2026-10-22T15:41:26+02:00", subject: "A change" }] });
    expect(parseChangesJson(json)).toEqual({ since: "1.6.1", commits: [{ sha: "d6799ab", date: "2026-10-22T15:41:26+02:00", subject: "A change" }] });
  });

  it("treats a tag build's empty list and a missing tag as nothing", () => {
    expect(parseChangesJson(JSON.stringify({ since: "v1.6.1", commits: [] }))).toEqual({ since: "1.6.1", commits: [] });
    expect(parseChangesJson(JSON.stringify({ since: null, commits: [] }))).toEqual({ since: null, commits: [] });
  });

  it("tolerates malformed JSON and malformed entries", () => {
    expect(parseChangesJson("{not json")).toEqual({ since: null, commits: [] });
    expect(parseChangesJson("null")).toEqual({ since: null, commits: [] });
    expect(parseChangesJson(JSON.stringify({ since: 42, commits: [{ sha: 1 }, null, { sha: "a", date: "d", subject: "ok" }] }))).toEqual({
      since: null,
      commits: [{ sha: "a", date: "d", subject: "ok" }],
    });
  });
});
