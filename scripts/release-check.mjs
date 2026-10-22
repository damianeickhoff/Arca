// The release gate (.claude/skills/release/SKILL.md step 6): every place that carries
// the version must agree before the version commit is made.
//   node scripts/release-check.mjs 1.6.0
// Exits 1 and lists every mismatch; exits 0 silently when all is well.
import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("usage: node scripts/release-check.mjs X.Y.Z");
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const problems = [];

// package.json
const pkg = JSON.parse(read("package.json"));
if (pkg.version !== version) problems.push(`package.json version is ${pkg.version}, not ${version}`);

// CHANGELOG.md: the newest entry is this version, with a title and at least one section.
const changelog = read("CHANGELOG.md");
const first = changelog.match(/^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})\n(.+)\n/m);
if (!first) problems.push("CHANGELOG.md has no '## X.Y.Z — YYYY-MM-DD' entry");
else {
  if (first[1] !== version) problems.push(`CHANGELOG.md newest entry is ${first[1]}, not ${version}`);
  if (!first[3].trim() || first[3].startsWith("#")) problems.push("CHANGELOG.md entry has no title line under the heading");
  const today = new Date().toISOString().slice(0, 10);
  if (first[2] !== today) problems.push(`CHANGELOG.md entry is dated ${first[2]}, today is ${today}`);
  const body = changelog.slice(first.index + first[0].length).split(/^## /m)[0];
  if (!/^### /m.test(body)) problems.push("CHANGELOG.md entry has no '### ' section");
}

// Roadmap: the Just shipped chip.
const roadmap = read("website/src/content/docs/roadmap.md");
if (!roadmap.includes(`Just shipped · ${version}`)) problems.push(`roadmap.md Just shipped chip is not ${version}`);
const shipped = roadmap.match(/<ul class="rm-shipped__items">([\s\S]*?)<\/ul>/)?.[1] ?? "";
const items = (shipped.match(/<li>/g) ?? []).length;
if (items < 1) problems.push("roadmap.md Just shipped list is empty");

// Brain: the survey line.
const brain = process.env.ARCA_BRAIN ?? "D:/Notes/Projects/Arca";
try {
  const readme = fs.readFileSync(path.join(brain, "README.md"), "utf8");
  if (!readme.includes(`Arca ${version}`)) problems.push(`brain README.md survey line does not say Arca ${version}`);
} catch {
  problems.push(`brain README.md not found at ${brain} (set ARCA_BRAIN)`);
}

// Tag not taken yet.
try {
  const tags = fs.readdirSync(path.join(root, ".git", "refs", "tags"));
  if (tags.includes(`v${version}`)) problems.push(`tag v${version} already exists`);
} catch {
  // packed refs or no .git: skip
}

if (problems.length) {
  console.error(`Release ${version} is not ready:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
