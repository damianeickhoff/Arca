// Merchant names from bank descriptions (lib/merchant-name.ts, lib/parse-transaction-location.ts)
// and the one-time pass that removes the town-named merchants the old extractor made
// (lib/merchant-cleanup-migration.ts).
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { deriveMerchantName } from "@/lib/merchant-name";
import { extractMerchantName } from "@/lib/parse-transaction-location";
import { cleanUpCityMerchants } from "@/lib/merchant-cleanup-migration";

describe("extractMerchantName", () => {
  it("takes the brand before the code and the town", () => {
    expect(extractMerchantName("ALDI CUL009 TIEL TIEL NLD")).toBe("Aldi");
    expect(extractMerchantName("Action 1140 Ede NLD")).toBe("Action");
    expect(extractMerchantName("Kruidvat 6148 LIENDEN NLD")).toBe("Kruidvat");
  });

  it("finds no merchant in a store number and a town", () => {
    expect(extractMerchantName("1451 Lienden Lienden NLD")).toBeNull();
    expect(extractMerchantName("1020186            ROMA ITA")).toBeNull();
    expect(extractMerchantName("JD1601GammaTiel TIEL NLD")).toBeNull();
    expect(extractMerchantName("JD1601GammaTiel TIEL NLD Pasvolgnr: 906 22-09-2025 15:41")).toBeNull();
  });

  it("keeps brands that start with a digit", () => {
    expect(extractMerchantName("2Switch Tiel TIEL NLD")).toBe("2Switch");
    expect(extractMerchantName("2theloo Hoog Cathrijne")).toBe("2Theloo Hoog Cathrijne");
  });

  it("still finds a brand after a leading code", () => {
    expect(extractMerchantName("5045 Nettorama")).toBe("Nettorama");
    expect(extractMerchantName("748 Kentucky Fried Chi")).toBe("Kentucky Fried Chi");
    expect(extractMerchantName("O2T Holding B.V.")).toBe("Holding");
  });
});

describe("deriveMerchantName", () => {
  it("never names a merchant after the town on the card line", () => {
    expect(deriveMerchantName({ description: "14166 Kerkrade", rawDescription: "14166 Kerkrade KERKRADE NLD Pasvolgnr: 906 27-09-2025" })).toBeNull();
    expect(deriveMerchantName({ description: "5045 Nettorama", rawDescription: "5045 Nettorama EDE NLD Pasvolgnr: 906" })).toBe("Nettorama");
  });

  it("knows Action's Lienden store", () => {
    expect(deriveMerchantName({ description: "1451 Lienden Lienden NLD" })).toBe("Action");
    expect(deriveMerchantName({ description: "1451 Lienden" })).toBe("Action");
  });
});

function legacyDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE merchants (id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_key TEXT NOT NULL UNIQUE, icon TEXT, color TEXT, deleted INTEGER NOT NULL DEFAULT 0, default_category_id INTEGER);
    CREATE TABLE merchant_patterns (id INTEGER PRIMARY KEY, merchant_id INTEGER NOT NULL, pattern TEXT NOT NULL, match_type TEXT NOT NULL DEFAULT 'contains');
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, description TEXT NOT NULL, raw_description TEXT, merchant_id INTEGER);
    INSERT INTO merchants (id, name, normalized_key, icon) VALUES
      (1, 'Tiel Tiel Nld', 'tieltielnld', NULL),
      (2, 'Tiel Nld', 'tielnld', NULL),
      (3, 'Kerkrade', 'kerkrade', NULL),
      (4, 'Nettorama', 'nettorama', NULL),
      (5, 'Roma Ita', 'romaita', 'map-pin'),
      (6, 'Kerkrade Winkels', 'kerkradewinkels', NULL);
    INSERT INTO transactions (id, description, raw_description, merchant_id) VALUES
      (1, '2Switch Tiel TIEL NLD', 'Kaartnr: 4556 18** **** 2885', 1),
      (2, 'JD1601GammaTiel', 'JD1601GammaTiel TIEL NLD Pasvolgnr: 906 17-08-2025', 2),
      (3, 'JD1601GammaTiel TIEL NLD', NULL, 2),
      (4, '14166 Kerkrade', '14166 Kerkrade KERKRADE NLD Pasvolgnr: 906', 3),
      (5, '5045 Nettorama', '5045 Nettorama EDE NLD Pasvolgnr: 906', 4),
      (6, '1020186 ROMA ITA', NULL, 5),
      (7, 'Overboeking', NULL, 6);
  `);
  return db;
}

const merchantIds = (db: Database.Database) => (db.prepare("SELECT id FROM merchants ORDER BY id").all() as { id: number }[]).map((r) => r.id);

describe("cleanUpCityMerchants", () => {
  it("removes the town-named merchants and unlinks their transactions", () => {
    const db = legacyDb();
    cleanUpCityMerchants(db);
    // A real brand (Nettorama), one the user gave an icon (Roma Ita) and one the user
    // linked by hand (Kerkrade Winkels) stay.
    expect(merchantIds(db)).toEqual([4, 5, 6]);
    const unlinked = (db.prepare("SELECT id FROM transactions WHERE merchant_id IS NULL ORDER BY id").all() as { id: number }[]).map((r) => r.id);
    expect(unlinked).toEqual([1, 2, 3, 4]);
  });

  it("runs once", () => {
    const db = legacyDb();
    cleanUpCityMerchants(db);
    db.exec("INSERT INTO merchants (id, name, normalized_key) VALUES (7, 'Lienden', 'lienden'); INSERT INTO transactions (description, merchant_id) VALUES ('1451 Lienden Lienden NLD', 7);");
    cleanUpCityMerchants(db);
    expect(merchantIds(db)).toContain(7);
  });
});
