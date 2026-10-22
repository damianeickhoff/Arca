// Prints one version's release notes from CHANGELOG.md, for the GitHub release
// (.claude/skills/release/SKILL.md step 8):
//   node scripts/release-notes.mjs 1.6.1 > notes.md      # the body, with the attribution line
//   node scripts/release-notes.mjs 1.6.1 --title          # just the title line
// The entry's heading and title line are left out of the body; the GitHub release carries
// the title itself.
import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];
const titleOnly = process.argv.includes("--title");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("usage: node scripts/release-notes.mjs X.Y.Z [--title]");
  process.exit(2);
}

const file = path.join(path.resolve(import.meta.dirname, ".."), "CHANGELOG.md");
const lines = fs.readFileSync(file, "utf8").replace(/\r/g, "").split("\n");
const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
if (start < 0) {
  console.error(`CHANGELOG.md has no entry for ${version}`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
if (end < 0) end = lines.length;

const title = (lines[start + 1] ?? "").trim();
if (titleOnly) {
  process.stdout.write(title + "\n");
} else {
  const body = lines.slice(start + 2, end).join("\n").trim();
  process.stdout.write(body + "\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n");
}
