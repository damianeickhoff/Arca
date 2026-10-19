import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { descriptionMatches, matchMerchantPattern, sortPatterns } from "@/lib/merchant-patterns";
import { migrateBrandRulesToMerchants } from "@/lib/brand-rules-migration";

describe("merchant patterns", () => {
  it("matches like a category rule", () => {
    expect(descriptionMatches("AH TO GO 4192 AMSTERDAM", "ah to go", "contains")).toBe(true);
    expect(descriptionMatches("STEAMGAMES.COM", "steam", "word")).toBe(false);
    expect(descriptionMatches("STEAM PURCHASE", "steam", "word")).toBe(true);
    expect(descriptionMatches("Netflix", "netflix", "exact")).toBe(true);
    expect(descriptionMatches("Netflix NL", "netflix", "exact")).toBe(false);
    expect(descriptionMatches("anything", "  ", "contains")).toBe(false);
  });

  it("prefers the most specific pattern and falls back to the raw description", () => {
    const patterns = sortPatterns([
      { merchantId: 1, pattern: "AH", matchType: "word" },
      { merchantId: 2, pattern: "AH TO GO", matchType: "contains" },
    ]);
    expect(matchMerchantPattern({ description: "AH TO GO 12" }, patterns)).toBe(2);
    expect(matchMerchantPattern({ description: "AH 1234 TIEL" }, patterns)).toBe(1);
    expect(matchMerchantPattern({ description: "Betaling", rawDescription: "AH TO GO" }, patterns)).toBe(2);
    expect(matchMerchantPattern({ description: "Jumbo" }, patterns)).toBeNull();
  });
});

function legacyDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE merchants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, normalized_key TEXT NOT NULL UNIQUE,
      icon TEXT, color TEXT, deleted INTEGER NOT NULL DEFAULT 0, default_category_id INTEGER);
    CREATE TABLE merchant_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, merchant_id INTEGER NOT NULL, pattern TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'contains', created_at TEXT, UNIQUE(merchant_id, pattern));
    CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, merchant_id INTEGER,
      brand_icon TEXT, brand_icon_color TEXT, brand_icon_bg_color TEXT, is_manual_transfer INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE brand_icon_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, name_pattern TEXT NOT NULL, name_wildcard INTEGER NOT NULL DEFAULT 1,
      name_whole_word INTEGER NOT NULL DEFAULT 0, brand_icon TEXT NOT NULL, icon_color TEXT, icon_bg_color TEXT);
  `);
  return db;
}

describe("brand rules → merchants migration", () => {
  it("turns a rule into a pattern and logo on the merchant its transactions belong to", () => {
    const db = legacyDb();
    db.exec(`
      INSERT INTO merchants (id, name, normalized_key) VALUES (1, 'Kiosk', 'kiosk');
      INSERT INTO brand_icon_rules (name_pattern, brand_icon, icon_color) VALUES ('kiosk 22', 'spotify', '#123456');
      INSERT INTO transactions (description, merchant_id, brand_icon) VALUES ('KIOSK 22 TIEL', 1, 'spotify'), ('KIOSK 22', NULL, 'spotify');
    `);
    migrateBrandRulesToMerchants(db);

    expect(db.prepare("SELECT icon, color FROM merchants WHERE id = 1").get()).toEqual({ icon: "spotify", color: "#123456" });
    expect(db.prepare("SELECT merchant_id AS m, pattern, match_type AS t FROM merchant_patterns").all()).toEqual([{ m: 1, pattern: "kiosk 22", t: "contains" }]);
    // Both transactions now belong to the merchant and lose the stamped-on icon.
    expect(db.prepare("SELECT merchant_id AS m, brand_icon AS b FROM transactions ORDER BY id").all()).toEqual([
      { m: 1, b: null },
      { m: 1, b: null },
    ]);
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'brand_icon_rules'").get()).toBeUndefined();
  });

  it("migrates the old default for Albert Heijn with its own logo, and skips unused defaults", () => {
    const db = legacyDb();
    db.exec(`INSERT INTO transactions (description, brand_icon) VALUES ('ALBERT HEIJN 1403 TIEL', 'paypal');`);
    migrateBrandRulesToMerchants(db);

    const merchants = db.prepare("SELECT name, icon FROM merchants").all() as { name: string; icon: string }[];
    expect(merchants).toHaveLength(1);
    expect(merchants[0].icon).toBe("albert-heijn");
    expect(db.prepare("SELECT brand_icon AS b, merchant_id AS m FROM transactions").get()).toEqual({ b: null, m: 1 });
  });

  it("does nothing once the table is gone", () => {
    const db = legacyDb();
    db.exec("DROP TABLE brand_icon_rules");
    expect(() => migrateBrandRulesToMerchants(db)).not.toThrow();
  });
});
