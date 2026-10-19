import { describe, expect, it } from "vitest";
import {
  PICKER_COLOURS,
  PICKER_ICONS,
  autoColourFor,
  autoPastelFor,
  colourNameOf,
  matchesQuery,
  suggestBrands,
  suggestIcons,
} from "@/lib/icon-catalog";

const label = (key: string) => key.replace(/^Icon/, "");

describe("icon catalog", () => {
  it("lists every glyph once", () => {
    const keys = PICKER_ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("suggests icons from the name in either language", () => {
    expect(suggestIcons("Gym", label)).toContain("IconBarbell");
    expect(suggestIcons("Sportschool", label)).toContain("IconBarbell");
    expect(suggestIcons("Boodschappen", label)).toContain("IconShoppingCart");
    expect(suggestIcons("", label)).toEqual([]);
  });

  it("suggests the detected brand first", () => {
    expect(suggestBrands("Spotify")[0]).toBe("spotify");
    expect(suggestBrands("Albert Heijn")[0]).toBe("albert-heijn");
  });

  it("gives a stable pastel per name", () => {
    expect(autoPastelFor("Gym")).toBe(autoPastelFor(" gym "));
    expect(Object.values(PICKER_COLOURS)).toContain(autoPastelFor("Gym"));
  });

  it("uses the brand colour for a logo on Auto", () => {
    expect(autoColourFor("spotify?s=1.2", "Spotify")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(autoColourFor("IconBarbell", "Gym")).toBe(autoPastelFor("Gym"));
  });

  it("maps stored colours back to swatches", () => {
    expect(colourNameOf(PICKER_COLOURS.mint.toLowerCase())).toBe("mint");
    expect(colourNameOf("#123456")).toBeNull();
    expect(colourNameOf(null)).toBeNull();
  });

  it("matches queries on any haystack", () => {
    expect(matchesQuery("cart", "IconShoppingCart", "Groceries")).toBe(true);
    expect(matchesQuery("", "x")).toBe(true);
    expect(matchesQuery("zzz", "IconShoppingCart", null)).toBe(false);
  });
});
