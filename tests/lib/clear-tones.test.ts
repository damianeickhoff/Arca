// The pastel a category group gets on Insights › Overview's block map.
import { describe, expect, it } from "vitest";
import { pastelToneForColor, pastelTones } from "@/components/clear/tones";

describe("pastelToneForColor", () => {
  it("picks the pastel by hue", () => {
    expect(pastelToneForColor("#E5484D")).toBe("peach"); // red
    expect(pastelToneForColor("#F76B15")).toBe("peach"); // orange
    expect(pastelToneForColor("#FFC53D")).toBe("butter");
    expect(pastelToneForColor("#30A46C")).toBe("mint");
    expect(pastelToneForColor("#0090FF")).toBe("sky");
    expect(pastelToneForColor("#6E56CF")).toBe("lilac");
    expect(pastelToneForColor("#D6409F")).toBe("rose");
  });

  it("makes greys stone and ignores what isn't a hex colour", () => {
    expect(pastelToneForColor("#8B8D98")).toBe("stone");
    expect(pastelToneForColor("var(--clr-ink)")).toBeNull();
    expect(pastelToneForColor(null)).toBeNull();
  });
});

describe("pastelTones", () => {
  it("keeps each item's own tone and hands out the pastel order to the rest", () => {
    expect(pastelTones(["#30A46C", null, "#30A46C", "#0090FF", null])).toEqual(["mint", "peach", "butter", "sky", "lilac"]);
  });

  it("starts over once all seven are used", () => {
    expect(pastelTones(Array.from({ length: 9 }, () => null))).toEqual(["mint", "peach", "butter", "lilac", "sky", "rose", "stone", "mint", "peach"]);
  });
});
