// The whole Tabler set for the icon picker: the stored key format, the lazily loaded
// search index (src/lib/generated/tabler-icon-index.json, written by
// scripts/build-icon-index.mjs) and the search over it. React-free, so it is unit tested.

/** The index as generated: categories by name, icons as [name, categoryIndex, tags, filled]. */
export interface TablerIndexFile {
  categories: string[];
  icons: [name: string, category: number, tags: string, filled: 0 | 1][];
}

/** One searchable icon. `key` is the stored key of its line style. */
export interface TablerEntry {
  key: string;
  name: string;
  category: string;
  /** Name words, tags and extra keywords, lowercased, one string to search in. */
  text: string;
  filled: boolean;
}

export interface TablerIndex {
  categories: string[];
  entries: TablerEntry[];
  byKey: Map<string, TablerEntry>;
}

/** Old component names Tabler still exports under another file. */
export const TABLER_ALIASES: Record<string, string> = {
  IconCodeAsterix: "IconCodeAsterisk",
  IconHandRock: "IconHandLoveYou",
  IconMessageCircle2: "IconMessageCircle",
};

/** Kebab-case Tabler name to the stored key: "eyeglass" → "IconEyeglass", "a-b-2" → "IconAB2". */
export function tablerKeyFromName(name: string, filled = false): string {
  const pascal = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `Icon${pascal}${filled ? "Filled" : ""}`;
}

/** The line style's key of a stored key: "IconHeartFilled" → "IconHeart". */
export function lineKeyOf(key: string): string {
  return key.replace(/Filled$/, "");
}

/** A Tabler category's translation key: "Version control" → "versionControl", "E-commerce" → "eCommerce". */
export function tablerCategoryKey(category: string): string {
  const [first = "", ...rest] = category.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return first + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

/** True for a string that can be a Tabler component name (and so a safe import path). */
export function isTablerKey(key: string | null | undefined): key is string {
  return !!key && /^Icon[A-Z0-9][A-Za-z0-9]*$/.test(key);
}

/** The file a stored key loads from (aliases resolved), or null when it is not a Tabler key. */
export function tablerFileOf(key: string | null | undefined): string | null {
  if (!isTablerKey(key)) return null;
  return TABLER_ALIASES[key] ?? key;
}

/**
 * Builds the searchable index. `extra` adds keywords per stored key (the curated
 * icons' Dutch keywords and translated labels), so those words find them too.
 */
export function buildTablerIndex(file: TablerIndexFile, extra: Record<string, string> = {}): TablerIndex {
  const entries = file.icons.map(([name, category, tags, filled]): TablerEntry => {
    const key = tablerKeyFromName(name);
    const words = [name.replace(/-/g, " "), name, tags, extra[key] ?? ""].join(" ").toLowerCase();
    return { key, name, category: file.categories[category] ?? "", text: ` ${words} `, filled: filled === 1 };
  });
  return { categories: file.categories, entries, byKey: new Map(entries.map((e) => [e.key, e])) };
}

/** A query word and its singular forms ("glasses" → glasses, glasse, glass). */
function variants(word: string): string[] {
  const out = [word];
  if (word.length > 3 && word.endsWith("s")) out.push(word.slice(0, -1));
  if (word.length > 4 && word.endsWith("es")) out.push(word.slice(0, -2));
  return out;
}

/** Lowercase query words. */
export function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/** How well an entry matches (higher is better), or 0 when some query word is missing. */
export function tablerMatchScore(entry: TablerEntry, words: string[]): number {
  if (words.length === 0) return 1;
  const joined = words.join("-");
  if (entry.name === joined) return 100;
  let score = entry.name.startsWith(joined) ? 50 : 0;
  for (const word of words) {
    const forms = variants(word);
    if (forms.some((f) => entry.name.includes(f))) score += 10;
    else if (forms.some((f) => entry.text.includes(` ${f}`))) score += 3;
    else if (forms.some((f) => entry.text.includes(f))) score += 1;
    else return 0;
  }
  return score;
}

/**
 * The icons for a query and category, best first (ties keep the index's alphabetical
 * order). `filledOnly` keeps icons that have a filled style. An empty query lists the
 * category (or everything).
 */
export function searchTablerIndex(
  index: TablerIndex,
  query: string,
  { category = null, filledOnly = false }: { category?: string | null; filledOnly?: boolean } = {},
): TablerEntry[] {
  const words = queryWords(query);
  const hits: { entry: TablerEntry; score: number; order: number }[] = [];
  index.entries.forEach((entry, order) => {
    if (category && entry.category !== category) return;
    if (filledOnly && !entry.filled) return;
    const score = tablerMatchScore(entry, words);
    if (score > 0) hits.push({ entry, score, order });
  });
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return hits.map((h) => h.entry);
}
