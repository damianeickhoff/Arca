import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import indexFile from "@/lib/generated/tabler-icon-index.json";
import { PICKER_ICONS, PICKER_ICON_KEYWORDS } from "@/lib/icon-catalog";
import { resolveLegacyIconKey } from "@/lib/legacy-icon-map";
import {
  buildTablerIndex,
  isTablerKey,
  lineKeyOf,
  searchTablerIndex,
  tablerCategoryKey,
  tablerFileOf,
  tablerKeyFromName,
  type TablerIndexFile,
} from "@/lib/tabler-icons";

const file = indexFile as unknown as TablerIndexFile;
const index = buildTablerIndex(file, PICKER_ICON_KEYWORDS);
const ICONS_DIR = join(process.cwd(), "node_modules/@tabler/icons-react/dist/esm/icons");
const tabler = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@tabler/icons/icons.json"), "utf8")) as Record<
  string,
  { category: string; tags: (string | number)[]; styles: { filled?: unknown } }
>;

describe("tabler key conversion", () => {
  it("turns kebab names into stored keys", () => {
    expect(tablerKeyFromName("eyeglass")).toBe("IconEyeglass");
    expect(tablerKeyFromName("eyeglass-2")).toBe("IconEyeglass2");
    expect(tablerKeyFromName("a-b-2")).toBe("IconAB2");
    expect(tablerKeyFromName("heart", true)).toBe("IconHeartFilled");
    expect(lineKeyOf("IconHeartFilled")).toBe("IconHeart");
  });

  it("only accepts component names as files, resolving aliases", () => {
    expect(tablerFileOf("IconEyeglass")).toBe("IconEyeglass");
    expect(tablerFileOf("IconHandRock")).toBe("IconHandLoveYou");
    expect(tablerFileOf("Car")).toBeNull();
    expect(tablerFileOf("Icon../evil")).toBeNull();
    expect(tablerFileOf("img:/x.png")).toBeNull();
    expect(isTablerKey(null)).toBe(false);
  });

  it("maps legacy Lucide keys", () => {
    expect(resolveLegacyIconKey("Car")).toBe("IconCar");
    expect(resolveLegacyIconKey("filled:Pizza")).toBe("IconPizzaFilled");
    expect(resolveLegacyIconKey("Nope")).toBeNull();
  });

  it("gives categories a translation key", () => {
    expect(tablerCategoryKey("Version control")).toBe("versionControl");
    expect(tablerCategoryKey("E-commerce")).toBe("eCommerce");
    expect(tablerCategoryKey("Food")).toBe("food");
  });
});

describe("tabler index", () => {
  it("is current with the installed Tabler set", () => {
    // Fails after a Tabler upgrade until `npm run icons:index` runs.
    expect(file.icons.length).toBe(Object.keys(tabler).length);
    expect(file.icons.filter((i) => i[3] === 1).length).toBe(Object.values(tabler).filter((i) => i.styles.filled).length);
  });

  it("names a file for every icon and its filled style", () => {
    for (const entry of index.entries) {
      expect(existsSync(join(ICONS_DIR, `${entry.key}.mjs`)), entry.key).toBe(true);
      if (entry.filled) expect(existsSync(join(ICONS_DIR, `${entry.key}Filled.mjs`)), entry.key).toBe(true);
    }
  });

  it("holds every curated glyph", () => {
    for (const icon of PICKER_ICONS) expect(index.byKey.has(icon.key), icon.key).toBe(true);
  });
});

describe("tabler search", () => {
  const keys = (query: string, opts?: Parameters<typeof searchTablerIndex>[2]) =>
    searchTablerIndex(index, query, opts).map((e) => e.key);

  it("finds glasses: the eyeglass icons and every icon tagged glasses", () => {
    const hits = keys("glasses");
    expect(hits).toContain("IconEyeglass");
    expect(hits).toContain("IconEyeglass2");
    const tagged = Object.entries(tabler)
      .filter(([, i]) => i.tags.map(String).includes("glasses"))
      .map(([name]) => tablerKeyFromName(name));
    expect(tagged.length).toBeGreaterThan(0);
    for (const key of tagged) expect(hits).toContain(key);
  });

  it("finds curated glyphs by their Dutch keywords", () => {
    expect(keys("bril")).toContain("IconEyeglass");
    expect(keys("boodschappen")).toContain("IconShoppingCart");
  });

  it("puts the exact name first and needs every word", () => {
    expect(keys("pizza")[0]).toBe("IconPizza");
    expect(keys("credit card")[0]).toBe("IconCreditCard");
    expect(keys("pizza zebra")).toEqual([]);
  });

  it("browses a category and the filled style", () => {
    const food = keys("", { category: "Food" });
    expect(food).toContain("IconPizza");
    expect(food.every((k) => index.byKey.get(k)?.category === "Food")).toBe(true);
    const filled = keys("", { filledOnly: true });
    expect(filled.length).toBeGreaterThan(500);
    expect(filled.every((k) => index.byKey.get(k)?.filled)).toBe(true);
    expect(keys("").length).toBe(index.entries.length);
  });
});
