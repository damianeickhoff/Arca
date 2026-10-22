import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { getBuildInfo } from "@/lib/build-info";

/**
 * The commits since the last release, shown on Settings › About for prerelease builds
 * only, so a dev container answers "is my change in this build yet". CI writes them at
 * build time (publish.yml, scripts/beta-changes.mjs) to build/changes.json:
 *
 *   { "since": "v1.6.1", "commits": [{ "sha": "abc1234", "date": "<ISO>", "subject": "…" }] }
 *
 * newest first, no merge commits; a tag build gets an empty list. A local checkout has no
 * file, so the local channel asks its own git once. A release never shows any of this.
 */
export interface BetaCommit {
  /** Short hash. */
  sha: string;
  /** ISO commit time. */
  date: string;
  /** The first line of the message, as written. */
  subject: string;
}

export interface BetaChanges {
  /** The last release the list counts from ("1.6.1", no "v"), or null when unknown. */
  since: string | null;
  commits: BetaCommit[];
}

const EMPTY: BetaChanges = { since: null, commits: [] };

/** The `git log --format` the parser reads: hash, committer date, parents, subject. */
export const GIT_LOG_FORMAT = "%h%x1f%cI%x1f%P%x1f%s%x1e";

/** Turns `git log --format=GIT_LOG_FORMAT` output into commits, newest first as git
 *  prints them. Merge commits (more than one parent) and broken records are left out. */
export function parseGitLog(text: string): BetaCommit[] {
  const commits: BetaCommit[] = [];
  for (const record of text.split("\x1e")) {
    const fields = record.replace(/^\s+/, "").split("\x1f");
    if (fields.length !== 4) continue;
    const [sha, date, parents, subject] = fields.map((f) => f.trim());
    if (!sha || !subject) continue;
    if (parents.split(/\s+/).filter(Boolean).length > 1) continue;
    commits.push({ sha, date, subject });
  }
  return commits;
}

/** "v1.6.1" → "1.6.1"; anything that is not a version tag → null. */
function versionOf(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  const m = tag.trim().match(/^v?(\d+\.\d+\.\d+)$/);
  return m ? m[1] : null;
}

/** Reads build/changes.json; a missing or malformed file is an empty list. */
export function parseChangesJson(json: string): BetaChanges {
  try {
    const data = JSON.parse(json) as { since?: unknown; commits?: unknown };
    const commits = Array.isArray(data.commits)
      ? data.commits.filter(
          (c): c is BetaCommit =>
            !!c && typeof c === "object" && typeof c.sha === "string" && typeof c.date === "string" && typeof c.subject === "string" && c.subject.trim() !== "",
        )
      : [];
    return { since: versionOf(data.since), commits };
  } catch {
    return EMPTY;
  }
}

function git(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: process.cwd(), timeout: 3000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });
}

/** A local checkout: the commits since the last v* tag, from its own git. Silent on any failure. */
async function fromLocalGit(): Promise<BetaChanges> {
  try {
    const tag = (await git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"])).trim();
    if (!tag) return EMPTY;
    return { since: versionOf(tag), commits: parseGitLog(await git(["log", `--format=${GIT_LOG_FORMAT}`, `${tag}..HEAD`])) };
  } catch {
    return EMPTY;
  }
}

let cached: Promise<BetaChanges> | null = null;

/** The commits in this build since the last release, read once per process. Server only. */
export function loadBetaChanges(): Promise<BetaChanges> {
  if (cached) return cached;
  const build = getBuildInfo();
  if (!build.prerelease) {
    cached = Promise.resolve(EMPTY);
    return cached;
  }
  let json: string | null = null;
  try {
    json = fs.readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ process.cwd(), "build", "changes.json"), "utf8");
  } catch {
    json = null;
  }
  if (json !== null) cached = Promise.resolve(parseChangesJson(json));
  else if (build.channel === "local") cached = fromLocalGit();
  else cached = Promise.resolve(EMPTY);
  return cached;
}
