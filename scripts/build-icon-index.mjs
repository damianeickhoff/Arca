// Writes src/lib/generated/tabler-icon-index.json, the icon picker's search index,
// from @tabler/icons/icons.json. Run `npm run icons:index` after upgrading Tabler;
// tests/lib/tabler-icons.test.ts fails while the index is behind the installed set.
//
// Shape: { categories: string[], icons: [name, categoryIndex, tags, filled][] } with
// name in kebab case ("eyeglass"), tags one space-separated string without the words
// the name already has, and filled 1 when the icon has a filled style. Everything the
// picker does not use (unicode, versions) is left out.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(readFileSync(join(root, "node_modules/@tabler/icons/icons.json"), "utf8"));
const out = join(root, "src/lib/generated/tabler-icon-index.json");

const categories = [];
const icons = [];
for (const [name, icon] of Object.entries(source).sort(([a], [b]) => a.localeCompare(b))) {
  const category = icon.category || "";
  if (!categories.includes(category)) categories.push(category);
  const own = new Set(name.split("-"));
  const tags = [
    ...new Set(
      (icon.tags ?? [])
        .map((t) => String(t).toLowerCase().trim())
        .filter((t) => t && !own.has(t) && !/^\d+$/.test(t)),
    ),
  ].join(" ");
  icons.push([name, -1, tags, icon.styles?.filled ? 1 : 0, category]);
}
categories.sort((a, b) => a.localeCompare(b));
const index = {
  categories,
  icons: icons.map(([name, , tags, filled, category]) => [name, categories.indexOf(category), tags, filled]),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(index) + "\n");
console.log(`${index.icons.length} icons, ${categories.length} categories → ${out}`);
