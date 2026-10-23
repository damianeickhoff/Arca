import { describe, expect, it } from "vitest";
import { HEAVY_PANELS, parseSettingsPanel, settingsSections } from "@/components/settings/settings-sections";

describe("settings panels", () => {
  it("resolves every listed row by its key, for admins and others", () => {
    for (const isAdmin of [true, false]) {
      for (const section of settingsSections({ isAdmin, withAccount: true })) {
        for (const row of section.rows) expect(parseSettingsPanel(row.key, isAdmin)).toBe(row.key);
      }
    }
  });

  it("knows the newer panels", () => {
    expect(parseSettingsPanel("notifications", false)).toBe("notifications");
    expect(parseSettingsPanel("about", false)).toBe("about");
    expect(parseSettingsPanel("import", false)).toBe("import");
    expect(parseSettingsPanel("users", false)).toBeNull();
    expect(parseSettingsPanel("nonsense", true)).toBeNull();
  });

  it("lists every heavy panel as a row somewhere", () => {
    const keys = new Set(settingsSections({ isAdmin: true, withAccount: true }).flatMap((s) => s.rows.map((r) => r.key)));
    for (const heavy of HEAVY_PANELS) expect(keys.has(heavy)).toBe(true);
  });
});
