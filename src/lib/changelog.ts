import fs from "fs";
import path from "path";

/**
 * The release notes, read from CHANGELOG.md (the one source: the GitHub release and
 * Settings › About both show it). Format, kept by the release skill:
 *
 *   ## 1.6.0 — 2026-10-22
 *   One line: the release title
 *
 *   An intro paragraph.
 *
 *   ### 🏠 Section
 *   - A bullet, with **bold**, `code` and [links](https://…) allowed.
 *
 * Anything else in a section (a plain paragraph) is kept as a line too.
 */
export interface ChangelogSection {
  heading: string;
  /** Bullets and plain lines, in order. Nested bullets keep their indent level. */
  items: Array<{ text: string; level: number; bullet: boolean }>;
}

export interface ChangelogEntry {
  version: string;
  /** YYYY-MM-DD, or "" when the heading has no date. */
  date: string;
  title: string;
  intro: string;
  sections: ChangelogSection[];
}

const ENTRY_HEADING = /^## (\d+\.\d+\.\d+)(?:\s+[—–-]\s+(\d{4}-\d{2}-\d{2}))?\s*$/;

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;
  let titleDone = false;

  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const heading = line.match(ENTRY_HEADING);
    if (heading) {
      entry = { version: heading[1], date: heading[2] ?? "", title: "", intro: "", sections: [] };
      entries.push(entry);
      section = null;
      titleDone = false;
      continue;
    }
    if (!entry) continue;

    if (line.startsWith("### ")) {
      section = { heading: line.slice(4).trim(), items: [] };
      entry.sections.push(section);
      continue;
    }
    if (line.trim() === "" ) {
      if (!titleDone && entry.title) titleDone = true;
      continue;
    }
    if (line.startsWith("# ")) continue; // a stray page title inside an old entry

    if (section) {
      const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
      if (bullet) section.items.push({ text: bullet[2].trim(), level: Math.min(2, Math.floor(bullet[1].length / 2)), bullet: true });
      else section.items.push({ text: line.trim(), level: 0, bullet: false });
      continue;
    }
    if (!titleDone) {
      entry.title = entry.title ? `${entry.title} ${line.trim()}` : line.trim();
    } else {
      entry.intro = entry.intro ? `${entry.intro} ${line.trim()}` : line.trim();
    }
  }
  return entries;
}

/** What the Home "Arca was updated" card says for the running version: its title
 *  when CHANGELOG.md has an entry for it, else an empty title. */
export function releaseNoteFor(version: string, entries: ChangelogEntry[] = loadChangelog()): { version: string; title: string } {
  return { version, title: entries.find((e) => e.version === version)?.title ?? "" };
}

let cached: ChangelogEntry[] | null = null;

/** Every entry, newest first, from CHANGELOG.md next to package.json (the Dockerfile
 *  copies it beside server.js). Read once per process; an unreadable file gives []. */
export function loadChangelog(): ChangelogEntry[] {
  if (cached) return cached;
  try {
    cached = parseChangelog(fs.readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ process.cwd(), "CHANGELOG.md"), "utf8"));
  } catch {
    cached = [];
  }
  return cached;
}
