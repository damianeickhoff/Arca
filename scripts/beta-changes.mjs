// Writes build/changes.json for the image (publish.yml runs it before the Docker build):
// the commits since the last vX.Y.Z tag reachable from HEAD, newest first, no merges.
// Settings › About shows them on prerelease builds (src/lib/beta-changes.ts reads the file
// and parses the same format). A tag build lists nothing: HEAD is the tag.
//
//   node scripts/beta-changes.mjs [out-file]   (default build/changes.json)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const out = process.argv[2] ?? "build/changes.json";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

let since = null;
try {
  since = git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*", "HEAD").trim() || null;
} catch {
  since = null; // no release tag in the history yet
}

const commits = [];
if (since) {
  const log = git("log", "--no-merges", "--format=%h%x1f%cI%x1f%s%x1e", `${since}..HEAD`);
  for (const record of log.split("\x1e")) {
    const [sha, date, subject] = record.trim().split("\x1f");
    if (sha && subject) commits.push({ sha, date: date ?? "", subject: subject.trim() });
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ since, commits }, null, 2)}\n`);
console.log(`${out}: ${commits.length} commit(s) since ${since ?? "(no release tag)"}`);
